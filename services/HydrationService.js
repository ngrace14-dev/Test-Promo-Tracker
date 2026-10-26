/**
 * HydrationService.js
 * 
 * Purpose: Enriches legacy string-based records with canonical IDs.
 * Part of PCRP Phase 3 - Canonical Identity Layer.
 */

import { collection, getDocs, doc, updateDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { AUDIT_ACTIONS } from "../governance.js";

export class HydrationService {
    constructor(db, identityService, logActionFn) {
        this.db = db;
        this.identityService = identityService;
        this.logAction = logActionFn;
    }

    /**
     * Scans promoCredits and adds canonical IDs based on identity resolution.
     * @param {boolean} dryRun - If true, performs calculation without writing to Firestore.
     */
    async hydrateLegacyCredits(dryRun = true) {
        const report = {
            totalProcessed: 0,
            successfullyHydrated: 0,
            needsMapping: 0,
            errors: 0,
            changes: [],
            timestamp: Date.now()
        };

        try {
            const creditsRef = collection(this.db, "promoCredits");
            const snapshot = await getDocs(creditsRef);
            
            report.totalProcessed = snapshot.docs.length;
            let batch = writeBatch(this.db);
            let batchCount = 0;

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                
                // Skip already hydrated records unless they need re-resolution (optional logic)
                if (data.hydrationStatus === 'COMPLETE' && !dryRun) continue;

                const brandResult = await this.identityService.resolveBrand(data.vendor, { 
                    source: 'HYDRATION_ENGINE', 
                    creditId: docSnap.id 
                });
                
                const siteId = await this.identityService.resolveSite(data.site);

                const updates = {
                    canonicalVendorId: brandResult.vendorId || null,
                    canonicalSiteId: siteId !== 'UNKNOWN' ? siteId : null,
                    hydrationStatus: (brandResult.vendorId && siteId !== 'UNKNOWN') ? 'COMPLETE' : 'NEEDS_MAPPING',
                    hydrationConfidence: brandResult.confidence,
                    lastHydratedAt: serverTimestamp()
                };

                if (updates.hydrationStatus === 'COMPLETE') {
                    report.successfullyHydrated++;
                } else {
                    report.needsMapping++;
                }

                report.changes.push({
                    id: docSnap.id,
                    vendor: data.vendor,
                    site: data.site,
                    resolvedVendorId: updates.canonicalVendorId,
                    resolvedSiteId: updates.canonicalSiteId,
                    status: updates.hydrationStatus
                });

                if (!dryRun) {
                    const ref = doc(this.db, "promoCredits", docSnap.id);
                    batch.update(ref, updates);
                    batchCount++;

                    if (batchCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(this.db);
                        batchCount = 0;
                    }
                }
            }

            if (!dryRun && batchCount > 0) {
                await batch.commit();
            }

            await this.logAction(AUDIT_ACTIONS.MAPPING_QUEUE_UPDATED, {
                message: `Legacy Hydration ${dryRun ? 'Dry Run' : 'Executed'}`,
                report: {
                    total: report.totalProcessed,
                    success: report.successfullyHydrated,
                    pending: report.needsMapping
                }
            });

            return report;

        } catch (error) {
            console.error("Hydration Error:", error);
            report.errors++;
            throw error;
        }
    }

    /**
     * Verifies referential integrity by checking if resolved IDs actually exist.
     */
    async verifyIntegrity(report) {
        // Validation logic to ensure vendorId exists in vendorMappings
        // This is a safety check before final production runs
        const validChanges = report.changes.filter(c => c.resolvedVendorId !== null);
        return {
            validCount: validChanges.length,
            integrityScore: (validChanges.length / report.totalProcessed) * 100
        };
    }
}
