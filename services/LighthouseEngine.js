/**
 * LighthouseEngine.js
 *
 * Purpose: Forensic Accountant Soft Audit System for General Ledger & Promo Credit Recovery.
 * Performs non-destructive cross-collection integrity checks across POS discovery,
 * active promo credit ledgers, Sage GL recoveries, and canonical identity mappings.
 */

import {
    collection,
    getDocs,
    doc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
    AUDIT_ACTIONS,
    AUDIT_VIOLATION_TYPES,
    AUDIT_SEVERITY,
    FORENSIC_AUDIT_STATUS,
    FORENSIC_THRESHOLDS
} from "../governance.js";

export class LighthouseEngine {
    /**
     * @param {Object} db - Firestore database instance
     * @param {Function} logActionFn - Audit logger callback (optional)
     * @param {Object} thresholds - Custom threshold overrides (optional)
     */
    constructor(db, logActionFn = null, thresholds = {}) {
        this.db = db;
        this.logAction = logActionFn || (async () => {});
        this.thresholds = {
            ...FORENSIC_THRESHOLDS,
            ...thresholds
        };
    }

    /**
     * Loads required collections from Firestore once, or normalizes an injected dataset
     * (used for simulation, dry-runs, and zero-cost in-memory audits).
     */
    async _loadDataset(dataset = null) {
        if (dataset) {
            return {
                promoGenerated: dataset.promoGenerated || [],
                promoRecovered: dataset.promoRecovered || [],
                promoCredits: dataset.promoCredits || [],
                treesSales: dataset.treesSales || [],
                vendorMappings: dataset.vendorMappings || [],
                brandMappings: dataset.brandMappings || []
            };
        }

        const toArray = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const [
            generatedSnap,
            recoveredSnap,
            creditsSnap,
            salesSnap,
            vendorsSnap,
            brandsSnap
        ] = await Promise.all([
            getDocs(collection(this.db, "promoGenerated")),
            getDocs(collection(this.db, "promoRecovered")),
            getDocs(collection(this.db, "promoCredits")),
            getDocs(collection(this.db, "treesSales")),
            getDocs(collection(this.db, "vendorMappings")),
            getDocs(collection(this.db, "brandMappings"))
        ]);

        return {
            promoGenerated: toArray(generatedSnap),
            promoRecovered: toArray(recoveredSnap),
            promoCredits: toArray(creditsSnap),
            treesSales: toArray(salesSnap),
            vendorMappings: toArray(vendorsSnap),
            brandMappings: toArray(brandsSnap)
        };
    }

    /**
     * Orchestrates a complete soft forensic audit across all 4 audit vectors.
     * Fetches Firestore collections once per run to minimize read costs, or accepts
     * an in-memory dataset for simulation and testing.
     * @param {Object} options - { period: { month, year } | null, persist: boolean, dataset: Object | null }
     */
    async runFullForensicAudit(options = { period: null, persist: false, dataset: null }) {
        const runId = `LH_RUN_${Date.now()}`;
        const periodFilter = options.period || null;
        const data = await this._loadDataset(options.dataset);

        const [
            varianceFindings,
            duplicateFindings,
            agingFindings,
            mappingFindings
        ] = await Promise.all([
            this.runVarianceAudit(periodFilter, data),
            this.detectDuplicateClaims(periodFilter, data),
            this.detectAgingOutliers(data),
            this.detectMappingAmbiguities(data)
        ]);

        const allFindings = [
            ...varianceFindings,
            ...duplicateFindings,
            ...agingFindings,
            ...mappingFindings
        ].map(finding => ({
            ...finding,
            runId,
            status: finding.status || FORENSIC_AUDIT_STATUS.PENDING_REVIEW
        }));

        const summary = this.generateSummary(allFindings, runId, periodFilter);

        if (options.persist && this.db) {
            await this.persistAuditRun(runId, summary, allFindings);
        }

        await this.logAction(AUDIT_ACTIONS.FORENSIC_SCAN_COMPLETED, {
            runId,
            totalFindings: summary.totalFindings,
            criticalCount: summary.bySeverity[AUDIT_SEVERITY.CRITICAL] || 0,
            totalVarianceExposure: summary.totalVarianceExposure
        });

        return {
            runId,
            summary,
            findings: allFindings
        };
    }

    /**
     * Vector 1: GL vs. POS Discovery Variance Audit
     * Compares expected credits (from promoGenerated / treesSales / promoCredits) against actual
     * general ledger recoveries (from promoRecovered and settled promoCredits).
     * @param {Object|null} period - Optional { month: 'August', year: 2026 }
     * @param {Object|null} dataset - Optional preloaded dataset
     */
    async runVarianceAudit(period = null, dataset = null) {
        const findings = [];
        const dataStore = await this._loadDataset(dataset);

        const ledgerMap = new Map();

        const getOrCreateBucket = (key, meta) => {
            if (!ledgerMap.has(key)) {
                ledgerMap.set(key, {
                    vendorId: meta.vendorId || null,
                    vendorName: meta.vendorName || "Unknown Vendor",
                    periodKey: meta.periodKey || "UNKNOWN_PERIOD",
                    expectedDiscovery: 0,
                    posRawDiscovery: 0,
                    claimedAmount: 0,
                    glRecoveredAmount: 0,
                    appliedCreditAmount: 0,
                    hasSettledRecord: false,
                    relatedRecordIds: []
                });
            }
            return ledgerMap.get(key);
        };

        // 1. Ingest promoGenerated (Treez POS aggregated discovery)
        dataStore.promoGenerated.forEach(data => {
            if (period && (data.month !== period.month || Number(data.year) !== Number(period.year))) {
                return;
            }
            const vendorKey = data.vendorId || (data.vendorName || "UNKNOWN").trim().toLowerCase();
            const periodKey = `${data.month || "Unknown"}_${data.year || "Unknown"}`;
            const key = `${vendorKey}__${periodKey}`;

            const bucket = getOrCreateBucket(key, {
                vendorId: data.vendorId,
                vendorName: data.vendorName,
                periodKey
            });
            bucket.expectedDiscovery += parseFloat(data.totalDiscovery || data.amount || 0);
            if (data.id) bucket.relatedRecordIds.push(data.id);
        });

        // 1b. Ingest treesSales (Raw POS line-item sales fallback/verification)
        dataStore.treesSales.forEach(sale => {
            const saleMonth = sale.month || "Unknown";
            const saleYear = sale.year || this._extractYear(sale.date) || new Date().getFullYear();
            if (period && (saleMonth !== period.month || (sale.year && Number(saleYear) !== Number(period.year)))) {
                return;
            }
            const vendorKey = sale.canonicalVendorId || (sale.brand || "UNKNOWN").trim().toLowerCase();
            const periodKey = `${saleMonth}_${saleYear}`;
            const key = `${vendorKey}__${periodKey}`;

            const bucket = getOrCreateBucket(key, {
                vendorId: sale.canonicalVendorId || null,
                vendorName: sale.brand || "Unknown Brand",
                periodKey
            });
            bucket.posRawDiscovery += parseFloat(sale.owed || 0);
        });

        // 2. Ingest promoCredits (Active & legacy settlement ledger)
        dataStore.promoCredits.forEach(data => {
            if (data.archived === true) return;
            const creditMonth = data.trackingMonth || data.month || "Unknown";
            const creditYear = data.year || new Date().getFullYear();

            if (period && (creditMonth !== period.month || (data.year && Number(creditYear) !== Number(period.year)))) {
                return;
            }

            const vendorKey = data.canonicalVendorId || (data.vendor || "UNKNOWN").trim().toLowerCase();
            const periodKey = `${creditMonth}_${creditYear}`;
            const key = `${vendorKey}__${periodKey}`;

            const bucket = getOrCreateBucket(key, {
                vendorId: data.canonicalVendorId || null,
                vendorName: data.vendor || "Unknown Vendor",
                periodKey
            });

            const amount = parseFloat(data.amount || 0);
            bucket.claimedAmount += amount;

            const normalizedStatus = (data.status || "").toUpperCase();
            if (normalizedStatus === "APPLIED" || normalizedStatus === "MEMO_RECEIVED") {
                bucket.appliedCreditAmount += parseFloat(data.recoveredAmount || data.amount || 0);
                bucket.hasSettledRecord = true;
            }
            if (data.id) bucket.relatedRecordIds.push(data.id);
        });

        // 3. Ingest promoRecovered (Sage GL / Check Register imports)
        dataStore.promoRecovered.forEach(data => {
            const amount = parseFloat(data.amount || 0);

            if (!data.vendorId) {
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.UNMAPPED_GL_RECOVERY,
                    severity: AUDIT_SEVERITY.CRITICAL,
                    vendorId: null,
                    vendorName: data.sourceMetadata?.rawVendor || "Unmapped Sage Vendor",
                    period: data.recoveryDate || "Unknown",
                    expectedAmount: 0,
                    actualAmount: amount,
                    varianceAmount: -amount,
                    variancePercent: 1,
                    relatedRecordIds: data.id ? [data.id] : [],
                    message: `Unmapped Sage GL recovery of $${amount.toFixed(2)} (Ref: ${data.refNumber || "N/A"}) lacks a canonical Vendor ID.`
                });
                return;
            }

            const recMonth = data.month || this._extractMonthName(data.recoveryDate);
            const recYear = data.year || this._extractYear(data.recoveryDate);

            if (period && recMonth && recYear) {
                if (recMonth !== period.month || Number(recYear) !== Number(period.year)) {
                    return;
                }
            }

            const periodKey = `${recMonth || "Unknown"}_${recYear || "Unknown"}`;
            const key = `${data.vendorId}__${periodKey}`;

            const bucket = getOrCreateBucket(key, {
                vendorId: data.vendorId,
                vendorName: data.sourceMetadata?.rawVendor || data.vendorId,
                periodKey
            });
            bucket.glRecoveredAmount += amount;
            if (data.id) bucket.relatedRecordIds.push(data.id);
        });

        // 4. Evaluate Variances per Bucket
        for (const bucket of ledgerMap.values()) {
            const posBaseline = bucket.expectedDiscovery > 0 ? bucket.expectedDiscovery : bucket.posRawDiscovery;
            const expectedBase = posBaseline > 0 ? posBaseline : bucket.claimedAmount;
            const actualRecovered = bucket.glRecoveredAmount > 0 ? bucket.glRecoveredAmount : bucket.appliedCreditAmount;
            const hasSettlementActivity = bucket.glRecoveredAmount > 0 || bucket.hasSettledRecord;

            // Case A: Orphaned GL settlement with zero discovery/claims
            if (expectedBase === 0 && actualRecovered > 0) {
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.ORPHANED_SETTLEMENT,
                    severity: AUDIT_SEVERITY.WARNING,
                    vendorId: bucket.vendorId,
                    vendorName: bucket.vendorName,
                    period: bucket.periodKey,
                    expectedAmount: 0,
                    actualAmount: actualRecovered,
                    varianceAmount: -actualRecovered,
                    variancePercent: 1,
                    relatedRecordIds: bucket.relatedRecordIds,
                    message: `GL settlement of $${actualRecovered.toFixed(2)} recorded for ${bucket.vendorName} (${bucket.periodKey}) with $0.00 in POS discovery/claims.`
                });
                continue;
            }

            if (expectedBase <= 0) continue;

            // Case B: If no settlement has occurred yet, check if POS Discovery disagrees with Claimed Amount
            if (!hasSettlementActivity) {
                if (posBaseline > 0 && bucket.claimedAmount > 0) {
                    const claimDiff = posBaseline - bucket.claimedAmount;
                    const absDiff = Math.abs(claimDiff);
                    const diffPct = absDiff / posBaseline;
                    if (
                        absDiff > this.thresholds.VARIANCE_TOLERANCE_DOLLARS &&
                        diffPct > this.thresholds.VARIANCE_TOLERANCE_PERCENT
                    ) {
                        const isCritical =
                            absDiff >= this.thresholds.CRITICAL_VARIANCE_DOLLARS ||
                            diffPct >= this.thresholds.CRITICAL_VARIANCE_PERCENT;
                        findings.push({
                            violationType: AUDIT_VIOLATION_TYPES.VARIANCE_ANOMALY,
                            severity: isCritical ? AUDIT_SEVERITY.CRITICAL : AUDIT_SEVERITY.WARNING,
                            vendorId: bucket.vendorId,
                            vendorName: bucket.vendorName,
                            period: bucket.periodKey,
                            expectedAmount: Number(posBaseline.toFixed(2)),
                            actualAmount: Number(bucket.claimedAmount.toFixed(2)),
                            varianceAmount: Number(claimDiff.toFixed(2)),
                            variancePercent: Number(diffPct.toFixed(4)),
                            relatedRecordIds: bucket.relatedRecordIds,
                            message: `POS-to-Claim variance of $${claimDiff.toFixed(2)} (${(diffPct * 100).toFixed(1)}%) between POS discovery ($${posBaseline.toFixed(2)}) and claimed ledger ($${bucket.claimedAmount.toFixed(2)}) for ${bucket.vendorName}.`
                        });
                    }
                }
                // Open claims with $0 GL recovery and no POS mismatch are tracked by Vector 3 (Aging SLA)
                continue;
            }

            // Case C: Settlement has occurred — compare Expected Base vs Actual GL Recovery
            const varianceDollars = expectedBase - actualRecovered;
            const absVariance = Math.abs(varianceDollars);
            const variancePercent = absVariance / expectedBase;

            if (
                absVariance > this.thresholds.VARIANCE_TOLERANCE_DOLLARS &&
                variancePercent > this.thresholds.VARIANCE_TOLERANCE_PERCENT
            ) {
                const isCritical =
                    absVariance >= this.thresholds.CRITICAL_VARIANCE_DOLLARS ||
                    variancePercent >= this.thresholds.CRITICAL_VARIANCE_PERCENT;

                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.VARIANCE_ANOMALY,
                    severity: isCritical ? AUDIT_SEVERITY.CRITICAL : AUDIT_SEVERITY.WARNING,
                    vendorId: bucket.vendorId,
                    vendorName: bucket.vendorName,
                    period: bucket.periodKey,
                    expectedAmount: Number(expectedBase.toFixed(2)),
                    actualAmount: Number(actualRecovered.toFixed(2)),
                    varianceAmount: Number(varianceDollars.toFixed(2)),
                    variancePercent: Number(variancePercent.toFixed(4)),
                    relatedRecordIds: bucket.relatedRecordIds,
                    message: `Variance of $${varianceDollars.toFixed(2)} (${(variancePercent * 100).toFixed(1)}%) between expected ($${expectedBase.toFixed(2)}) and recovered ($${actualRecovered.toFixed(2)}) for ${bucket.vendorName}.`
                });
            }
        }

        return findings;
    }

    /**
     * Vector 2: Duplicate & Overlap Claim Detection
     * Scans promoCredits for identical (Vendor, Site, Period, Amount) fingerprints
     * or reused Credit Memo / Invoice / Settlement Reference numbers.
     * @param {Object|null} period - Optional { month, year }
     * @param {Object|null} dataset - Optional preloaded dataset
     */
    async detectDuplicateClaims(period = null, dataset = null) {
        const findings = [];
        const dataStore = await this._loadDataset(dataset);

        const fingerprintGroups = new Map();
        const memoRefGroups = new Map();

        dataStore.promoCredits.forEach((data, idx) => {
            if (data.archived === true) return;
            const recordMonth = data.trackingMonth || data.month || "Unknown";
            if (period && recordMonth !== "Unknown" && recordMonth !== period.month) return;

            const amount = parseFloat(data.amount || 0);
            if (amount <= 0) return;

            const recordId = data.id || `credit_${idx}`;
            const vendorKey = (data.canonicalVendorId || data.vendor || "UNKNOWN").trim().toLowerCase();
            const siteKey = (data.canonicalSiteId || data.site || "ALL").trim().toLowerCase();
            const monthKey = recordMonth.trim().toLowerCase();
            const typeKey = (data.type || data.creditType || "GENERAL").trim().toLowerCase();

            const fingerprint = `${vendorKey}|${siteKey}|${monthKey}|${typeKey}|${amount.toFixed(2)}`;
            if (!fingerprintGroups.has(fingerprint)) {
                fingerprintGroups.set(fingerprint, []);
            }
            fingerprintGroups.get(fingerprint).push({ ...data, id: recordId, _resolvedMonth: recordMonth });

            const memoRef = (data.invoice || data.creditMemoNumber || data.deductionNumber || data.refNumber || "").trim();
            if (memoRef.length > 2) {
                const normalizedRef = memoRef.toUpperCase();
                if (!memoRefGroups.has(normalizedRef)) {
                    memoRefGroups.set(normalizedRef, []);
                }
                memoRefGroups.get(normalizedRef).push({ ...data, id: recordId, _resolvedMonth: recordMonth });
            }
        });

        for (const [, records] of fingerprintGroups.entries()) {
            if (records.length > 1) {
                const sample = records[0];
                const amount = parseFloat(sample.amount || 0);
                const settledCount = records.filter(r =>
                    ["APPLIED", "MEMO_RECEIVED"].includes((r.status || "").toUpperCase())
                ).length;

                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.DUPLICATE_CLAIM,
                    severity: settledCount > 1 ? AUDIT_SEVERITY.CRITICAL : AUDIT_SEVERITY.WARNING,
                    vendorId: sample.canonicalVendorId || null,
                    vendorName: sample.vendor || "Unknown Vendor",
                    site: sample.site || "Unknown Site",
                    period: sample._resolvedMonth || "Unknown",
                    expectedAmount: amount,
                    actualAmount: amount * records.length,
                    varianceAmount: amount * (records.length - 1),
                    relatedRecordIds: records.map(r => r.id),
                    message: `${records.length} potential duplicate claims of $${amount.toFixed(2)} detected for ${sample.vendor} (${sample.site || "All Sites"} - ${sample._resolvedMonth}).`
                });
            }
        }

        for (const [refNum, records] of memoRefGroups.entries()) {
            if (records.length > 1) {
                const totalAmount = records.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.DUPLICATE_CLAIM,
                    severity: AUDIT_SEVERITY.CRITICAL,
                    vendorId: records[0].canonicalVendorId || null,
                    vendorName: records[0].vendor || "Multiple/Unknown",
                    period: records[0]._resolvedMonth || "Multiple",
                    expectedAmount: parseFloat(records[0].amount || 0),
                    actualAmount: totalAmount,
                    varianceAmount: totalAmount - parseFloat(records[0].amount || 0),
                    relatedRecordIds: records.map(r => r.id),
                    message: `Settlement Reference / Credit Memo # "${refNum}" is assigned to ${records.length} distinct credit records.`
                });
            }
        }

        return findings;
    }

    /**
     * Vector 3: Aging & SLA Stagnation Audit
     * Flags credits that have stagnated in discovery or remain uncollected past SLA windows.
     * @param {Object|null} dataset - Optional preloaded dataset
     */
    async detectAgingOutliers(dataset = null) {
        const findings = [];
        const dataStore = await this._loadDataset(dataset);
        const now = Date.now();
        const msPerDay = 1000 * 60 * 60 * 24;

        const settledStatuses = new Set(["APPLIED", "MEMO_RECEIVED", "WRITTEN_OFF", "REJECTED", "UNCOLLECTABLE"]);
        const earlyStatuses = new Set(["DISCOVERED", "VALIDATED", "READY_TO_SEND", "PENDING"]);

        dataStore.promoCredits.forEach((data, idx) => {
            if (data.archived === true) return;
            const rawStatus = (data.status || "PENDING").toUpperCase();
            if (settledStatuses.has(rawStatus)) return;

            const recordMonth = data.trackingMonth || data.month || null;
            const createdMs = this._resolveTimestampMs(
                data.createdAt || data.dateAdded || data.dateRequested || data.timestamp,
                recordMonth,
                data.year
            );
            if (!createdMs) return;

            const ageDays = Math.floor((now - createdMs) / msPerDay);
            const amount = parseFloat(data.amount || 0);
            const recordId = data.id || `credit_${idx}`;

            if (ageDays >= this.thresholds.AGING_CRITICAL_SLA_DAYS) {
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.STALE_CREDIT,
                    severity: AUDIT_SEVERITY.CRITICAL,
                    vendorId: data.canonicalVendorId || null,
                    vendorName: data.vendor || "Unknown Vendor",
                    site: data.site || "Unknown",
                    period: recordMonth || "Unknown",
                    ageDays,
                    expectedAmount: amount,
                    actualAmount: 0,
                    varianceAmount: amount,
                    relatedRecordIds: [recordId],
                    message: `Credit of $${amount.toFixed(2)} for ${data.vendor} has been open for ${ageDays} days (Status: ${data.status}), exceeding the ${this.thresholds.AGING_CRITICAL_SLA_DAYS}-day critical aging threshold.`
                });
            } else if (earlyStatuses.has(rawStatus) && ageDays >= this.thresholds.STALE_DISCOVERY_SLA_DAYS) {
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.STALE_CREDIT,
                    severity: AUDIT_SEVERITY.WARNING,
                    vendorId: data.canonicalVendorId || null,
                    vendorName: data.vendor || "Unknown Vendor",
                    site: data.site || "Unknown",
                    period: recordMonth || "Unknown",
                    ageDays,
                    expectedAmount: amount,
                    actualAmount: 0,
                    varianceAmount: amount,
                    relatedRecordIds: [recordId],
                    message: `Credit of $${amount.toFixed(2)} for ${data.vendor} has remained in pre-outreach status (${data.status}) for ${ageDays} days.`
                });
            }
        });

        return findings;
    }

    /**
     * Vector 4: Canonical Identity & Mapping Integrity Audit
     * Verifies that brandMappings and vendorMappings have no alias collisions or broken foreign keys.
     * @param {Object|null} dataset - Optional preloaded dataset
     */
    async detectMappingAmbiguities(dataset = null) {
        const findings = [];
        const dataStore = await this._loadDataset(dataset);

        const validVendorIds = new Set();
        dataStore.vendorMappings.forEach(vDoc => {
            if (vDoc.id) validVendorIds.add(vDoc.id);
        });

        const brandToVendors = new Map();

        dataStore.brandMappings.forEach((data, idx) => {
            const docId = data.id || `brand_map_${idx}`;
            const rawBrand = (data.brandName || "").trim();
            const lowerBrand = rawBrand.toLowerCase();
            const vendorId = data.vendorId || data.canonicalVendorId || null;

            if (!vendorId || (validVendorIds.size > 0 && !validVendorIds.has(vendorId))) {
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.MAPPING_AMBIGUITY,
                    severity: AUDIT_SEVERITY.CRITICAL,
                    vendorId: vendorId,
                    vendorName: rawBrand || docId,
                    period: "N/A",
                    expectedAmount: 0,
                    actualAmount: 0,
                    varianceAmount: 0,
                    relatedRecordIds: [docId],
                    message: `Brand mapping "${rawBrand}" references non-existent or null canonical Vendor ID (${vendorId || "NULL"}).`
                });
            }

            if (lowerBrand) {
                if (!brandToVendors.has(lowerBrand)) {
                    brandToVendors.set(lowerBrand, { rawBrand, vendorIds: new Set(), docIds: [] });
                }
                const entry = brandToVendors.get(lowerBrand);
                if (vendorId) entry.vendorIds.add(vendorId);
                entry.docIds.push(docId);
            }
        });

        for (const [, entry] of brandToVendors.entries()) {
            if (entry.vendorIds.size > 1) {
                findings.push({
                    violationType: AUDIT_VIOLATION_TYPES.MAPPING_AMBIGUITY,
                    severity: AUDIT_SEVERITY.CRITICAL,
                    vendorId: Array.from(entry.vendorIds).join(", "),
                    vendorName: entry.rawBrand,
                    period: "N/A",
                    expectedAmount: 0,
                    actualAmount: 0,
                    varianceAmount: 0,
                    relatedRecordIds: entry.docIds,
                    message: `Ambiguous brand alias "${entry.rawBrand}" maps to ${entry.vendorIds.size} different canonical vendors (${Array.from(entry.vendorIds).join(", ")}).`
                });
            }
        }

        return findings;
    }

    /**
     * Aggregates findings into an executive KPI & risk summary.
     */
    generateSummary(findings = [], runId = null, period = null) {
        const bySeverity = {
            [AUDIT_SEVERITY.CRITICAL]: 0,
            [AUDIT_SEVERITY.WARNING]: 0,
            [AUDIT_SEVERITY.INFO]: 0
        };

        const byType = {};
        Object.values(AUDIT_VIOLATION_TYPES).forEach(t => {
            byType[t] = 0;
        });

        let totalVarianceExposure = 0;
        const vendorExposureMap = new Map();

        findings.forEach(f => {
            if (bySeverity[f.severity] !== undefined) {
                bySeverity[f.severity]++;
            }
            byType[f.violationType] = (byType[f.violationType] || 0) + 1;

            const exposure = Math.abs(parseFloat(f.varianceAmount || 0));
            totalVarianceExposure += exposure;

            const vName = f.vendorName || "Unknown Vendor";
            if (!vendorExposureMap.has(vName)) {
                vendorExposureMap.set(vName, { vendorName: vName, findingCount: 0, totalExposure: 0 });
            }
            const vEntry = vendorExposureMap.get(vName);
            vEntry.findingCount++;
            vEntry.totalExposure += exposure;
        });

        const topFlaggedVendors = Array.from(vendorExposureMap.values())
            .sort((a, b) => b.totalExposure - a.totalExposure || b.findingCount - a.findingCount)
            .slice(0, 10);

        return {
            runId: runId || `LH_RUN_${Date.now()}`,
            period: period ? `${period.month}_${period.year}` : "ALL",
            totalFindings: findings.length,
            bySeverity,
            byType,
            totalVarianceExposure: Number(totalVarianceExposure.toFixed(2)),
            topFlaggedVendors,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Persists a forensic audit run summary and its individual findings to Firestore.
     */
    async persistAuditRun(runId, summary, findings) {
        let batch = writeBatch(this.db);
        let opCount = 0;

        const runRef = doc(this.db, "forensicAuditRuns", runId);
        batch.set(runRef, {
            ...summary,
            executedAt: serverTimestamp()
        });
        opCount++;

        for (const finding of findings) {
            const logRef = doc(collection(this.db, "forensicAuditLogs"));
            batch.set(logRef, {
                ...finding,
                detectedAt: serverTimestamp()
            });
            opCount++;

            if (opCount >= 400) {
                await batch.commit();
                batch = writeBatch(this.db);
                opCount = 0;
            }
        }

        if (opCount > 0) {
            await batch.commit();
        }
    }

    /**
     * Generates a CSV report string from forensic findings for accounting reconciliation.
     */
    exportReconciliationCsv(findings = []) {
        const headers = [
            "Run ID",
            "Severity",
            "Violation Type",
            "Status",
            "Vendor Name",
            "Vendor ID",
            "Site",
            "Period",
            "Expected ($)",
            "Actual ($)",
            "Variance ($)",
            "Related Record IDs",
            "Forensic Notes"
        ];

        const escapeCell = (val) => {
            const str = String(val ?? "").replace(/"/g, '""');
            return `"${str}"`;
        };

        const rows = findings.map(f => [
            f.runId || "",
            f.severity || "",
            f.violationType || "",
            f.status || FORENSIC_AUDIT_STATUS.PENDING_REVIEW,
            f.vendorName || "",
            f.vendorId || "",
            f.site || "ALL",
            f.period || "",
            Number(f.expectedAmount || 0).toFixed(2),
            Number(f.actualAmount || 0).toFixed(2),
            Number(f.varianceAmount || 0).toFixed(2),
            (f.relatedRecordIds || []).join("; "),
            f.message || ""
        ].map(escapeCell).join(","));

        return [headers.map(escapeCell).join(","), ...rows].join("\n");
    }

    _extractMonthName(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        return months[d.getMonth()];
    }

    _extractYear(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.getFullYear();
    }

    _resolveTimestampMs(rawTimestamp, monthName = null, yearVal = null) {
        if (rawTimestamp) {
            if (typeof rawTimestamp === "number") return rawTimestamp;
            if (typeof rawTimestamp.toMillis === "function") return rawTimestamp.toMillis();
            if (rawTimestamp.seconds) return rawTimestamp.seconds * 1000;
            const parsed = new Date(rawTimestamp).getTime();
            if (!isNaN(parsed)) return parsed;
        }
        if (monthName) {
            const yr = yearVal || new Date().getFullYear();
            const approx = new Date(`${monthName} 1, ${yr}`).getTime();
            if (!isNaN(approx)) return approx;
        }
        return null;
    }
}
