/**
 * scripts/simulate_audit_data.js
 *
 * Purpose: Simulates POS (Treez), Credit Ledger (promoCredits), General Ledger (Sage promoRecovered),
 * and Canonical Identity Mappings to verify the true end-to-end functionality of LighthouseEngine.
 *
 * Run via: node scripts/simulate_audit_data.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

/**
 * Loads LighthouseEngine.js in Node.js by shimming the browser-only gstatic CDN Firebase import.
 */
async function loadLighthouseEngineForNode() {
    const governanceUrl = pathToFileURL(path.join(rootDir, "governance.js")).href;
    const enginePath = path.join(rootDir, "services", "LighthouseEngine.js");
    let engineSource = fs.readFileSync(enginePath, "utf8");

    const firebaseStub = `
const collection = (db, name) => ({ db, name });
const getDocs = async () => ({ docs: [] });
const doc = (dbOrCol, id) => ({ dbOrCol, id });
const writeBatch = () => ({ set: () => {}, commit: async () => {} });
const serverTimestamp = () => new Date().toISOString();
`;
    engineSource = engineSource
        .replace(/import\s+\{[\s\S]*?\}\s+from\s+"https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+";/, firebaseStub)
        .replace(`from "../governance.js"`, `from "${governanceUrl}"`);

    const dataUrl = `data:text/javascript;base64,${Buffer.from(engineSource, "utf8").toString("base64")}`;
    const mod = await import(dataUrl);
    const gov = await import(governanceUrl);
    return { LighthouseEngine: mod.LighthouseEngine, governance: gov };
}

/**
 * Builds the comprehensive mock POS + General Ledger dataset with intentional forensic anomalies.
 */
export function buildSimulatedForensicDataset() {
    const now = Date.now();
    const daysAgo = (d) => now - d * 24 * 60 * 60 * 1000;

    return {
        vendorMappings: [
            { id: "VND_KIVA", canonicalName: "Kiva Confections", sageVendorCode: "KIV01" },
            { id: "VND_WYLD", canonicalName: "Wyld Canna", sageVendorCode: "WYL01" },
            { id: "VND_JEETER", canonicalName: "DreamFields (Jeeter)", sageVendorCode: "JEE01" },
            { id: "VND_CONNECTED", canonicalName: "Connected Cannabis Co", sageVendorCode: "CON01" }
        ],

        brandMappings: [
            { id: "BM_1", brandName: "Kiva", vendorId: "VND_KIVA" },
            { id: "BM_2", brandName: "Camino", vendorId: "VND_KIVA" },
            // Vector 4 Test A: Alias Collision ("Blueberry Reserve" mapped to TWO distinct canonical vendors)
            { id: "BM_COLLIDE_1", brandName: "Blueberry Reserve", vendorId: "VND_KIVA" },
            { id: "BM_COLLIDE_2", brandName: "Blueberry Reserve", vendorId: "VND_WYLD" },
            // Vector 4 Test B: Broken Foreign Key (references non-existent vendorId)
            { id: "BM_ORPHAN_FK", brandName: "Ghost Extracts", vendorId: "VND_NON_EXISTENT_999" }
        ],

        promoGenerated: [
            // Vector 1 Test A: Critical Variance ($5,000 expected vs $3,200 recovered in Sage = $1,800 / 36% variance)
            {
                id: "GEN_KIVA_AUG",
                site: "Red Bluff",
                vendorId: "VND_KIVA",
                vendorName: "Kiva Confections",
                month: "August",
                year: 2026,
                totalDiscovery: 5000.00
            },
            // Vector 1 Control: Clean Match ($2,000 expected vs $1,990 recovered = $10 / 0.5% within $25 tolerance)
            {
                id: "GEN_WYLD_AUG",
                site: "Redding",
                vendorId: "VND_WYLD",
                vendorName: "Wyld Canna",
                month: "August",
                year: 2026,
                totalDiscovery: 2000.00
            }
        ],

        promoRecovered: [
            {
                id: "SAGE_REC_1",
                vendorId: "VND_KIVA",
                amount: 3200.00,
                refNumber: "CM-88410",
                recoveryDate: "2026-08-25",
                month: "August",
                year: 2026,
                paymentType: "MEMO",
                sourceMetadata: { rawVendor: "Kiva Confections" }
            },
            {
                id: "SAGE_REC_2",
                vendorId: "VND_WYLD",
                amount: 1990.00,
                refNumber: "ACH-99201",
                recoveryDate: "2026-08-28",
                month: "August",
                year: 2026,
                paymentType: "ACH",
                sourceMetadata: { rawVendor: "Wyld Canna" }
            },
            // Vector 1 Test B: Orphaned GL Settlement ($750 recovered in GL for Connected, $0 discovery/claims)
            {
                id: "SAGE_REC_ORPHAN",
                vendorId: "VND_CONNECTED",
                amount: 750.00,
                refNumber: "CM-ORPHAN-77",
                recoveryDate: "2026-08-19",
                month: "August",
                year: 2026,
                paymentType: "MEMO",
                sourceMetadata: { rawVendor: "Connected Cannabis Co" }
            },
            // Vector 1 Test C: Unmapped GL Recovery (null vendorId from Sage import)
            {
                id: "SAGE_REC_UNMAPPED",
                vendorId: null,
                amount: 425.50,
                refNumber: "CK-55109",
                recoveryDate: "2026-08-30",
                paymentType: "CHECK",
                sourceMetadata: { rawVendor: "UNKNOWN DISTRO LLC" }
            }
        ],

        promoCredits: [
            // Vector 2 Test A: Duplicate Claim Fingerprint (same vendor, site, trackingMonth, creditType, amount)
            {
                id: "CRED_DUP_1",
                canonicalVendorId: "VND_JEETER",
                vendor: "Jeeter",
                site: "Redding",
                trackingMonth: "August",
                year: 2026,
                creditType: "Scan Down",
                amount: 1250.00,
                status: "Applied",
                invoice: "CM-JEET-100",
                createdAt: daysAgo(15)
            },
            {
                id: "CRED_DUP_2",
                canonicalVendorId: "VND_JEETER",
                vendor: "Jeeter",
                site: "Redding",
                trackingMonth: "August",
                year: 2026,
                creditType: "Scan Down",
                amount: 1250.00,
                status: "Applied",
                invoice: "CM-JEET-101",
                createdAt: daysAgo(14)
            },
            // Vector 2 Test B: Reused Credit Memo / Invoice Reference across distinct records
            {
                id: "CRED_MEMO_COLLIDE_1",
                canonicalVendorId: "VND_KIVA",
                vendor: "Kiva Confections",
                site: "Red Bluff",
                trackingMonth: "August",
                year: 2026,
                creditType: "BOGO",
                amount: 600.00,
                status: "Applied",
                invoice: "CM-SHARED-999",
                createdAt: daysAgo(10)
            },
            {
                id: "CRED_MEMO_COLLIDE_2",
                canonicalVendorId: "VND_WYLD",
                vendor: "Wyld Canna",
                site: "Redding",
                trackingMonth: "August",
                year: 2026,
                creditType: "TPR",
                amount: 850.00,
                status: "Applied",
                invoice: "CM-SHARED-999",
                createdAt: daysAgo(10)
            },
            // Vector 3 Test A: Pre-outreach Discovery Stagnation (45 days in DISCOVERED > 30-day SLA)
            {
                id: "CRED_STALE_WARN",
                canonicalVendorId: "VND_WYLD",
                vendor: "Wyld Canna",
                site: "Red Bluff",
                trackingMonth: "July",
                year: 2026,
                creditType: "Display Credit",
                amount: 450.00,
                status: "DISCOVERED",
                createdAt: daysAgo(45)
            },
            // Vector 3 Test B: Critical Collection Aging (105 days in AWAITING_RESPONSE > 90-day SLA)
            {
                id: "CRED_STALE_CRIT",
                canonicalVendorId: "VND_JEETER",
                vendor: "Jeeter",
                site: "Red Bluff",
                trackingMonth: "May",
                year: 2026,
                creditType: "Scan Down",
                amount: 3100.00,
                status: "AWAITING_RESPONSE",
                createdAt: daysAgo(105)
            }
        ],

        treesSales: []
    };
}

async function runVerification() {
    console.log("==================================================================");
    console.log("  LIGHTHOUSE FORENSIC ENGINE - FUNCTIONAL VERIFICATION & AUDIT");
    console.log("==================================================================\n");

    const { LighthouseEngine, governance } = await loadLighthouseEngineForNode();
    const { AUDIT_VIOLATION_TYPES, AUDIT_SEVERITY } = governance;

    const auditLogs = [];
    const engine = new LighthouseEngine(null, async (action, payload) => {
        auditLogs.push({ action, payload });
    });

    const dataset = buildSimulatedForensicDataset();
    const result = await engine.runFullForensicAudit({
        period: null,
        persist: false,
        dataset
    });

    console.log(`Run ID:                 ${result.runId}`);
    console.log(`Total Findings:         ${result.summary.totalFindings}`);
    console.log(`Critical Findings:      ${result.summary.bySeverity[AUDIT_SEVERITY.CRITICAL]}`);
    console.log(`Warning Findings:       ${result.summary.bySeverity[AUDIT_SEVERITY.WARNING]}`);
    console.log(`Total Dollar Exposure:  $${result.summary.totalVarianceExposure.toFixed(2)}\n`);

    console.log("--- Findings Breakdown by Category ---");
    for (const [type, count] of Object.entries(result.summary.byType)) {
        console.log(`  - ${type.padEnd(28)}: ${count}`);
    }

    console.log("\n--- Detailed Forensic Findings ---");
    result.findings.forEach((f, i) => {
        console.log(
            `[${i + 1}] [${f.severity.toUpperCase()}] ${f.violationType} | Vendor: ${f.vendorName} | Period: ${f.period}\n` +
            `    Expected: $${Number(f.expectedAmount || 0).toFixed(2)} | Actual: $${Number(f.actualAmount || 0).toFixed(2)} | Variance: $${Number(f.varianceAmount || 0).toFixed(2)}\n` +
            `    Records: [${(f.relatedRecordIds || []).join(", ")}] | ${f.message}\n`
        );
    });

    const has = (fn) => result.findings.some(fn);
    const assertions = [
        ["Vector 1A: Critical GL vs POS Shortfall Variance (Kiva $5,000 vs $3,200)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.VARIANCE_ANOMALY && f.vendorId === "VND_KIVA" && f.severity === AUDIT_SEVERITY.CRITICAL && f.varianceAmount === 1800)],
        ["Vector 1 Control: Ignores Variance Within Tolerance (Wyld $2,000 vs $1,990 = $10 diff)",
            !has(f => f.violationType === AUDIT_VIOLATION_TYPES.VARIANCE_ANOMALY && f.vendorId === "VND_WYLD" && f.period === "August_2026")],
        ["Vector 1B: Orphaned GL Settlement (Connected $750 GL recovery with $0 discovery)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.ORPHANED_SETTLEMENT && f.vendorId === "VND_CONNECTED")],
        ["Vector 1C: Unmapped Sage GL Recovery (CK-55109 with null vendorId)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.UNMAPPED_GL_RECOVERY && f.severity === AUDIT_SEVERITY.CRITICAL)],
        ["Vector 2A: Duplicate Claim Fingerprint (Jeeter $1,250 x 2 in August)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.DUPLICATE_CLAIM && f.relatedRecordIds.includes("CRED_DUP_1") && f.relatedRecordIds.includes("CRED_DUP_2"))],
        ["Vector 2B: Shared Credit Memo / Invoice Reference Collision (CM-SHARED-999)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.DUPLICATE_CLAIM && f.relatedRecordIds.includes("CRED_MEMO_COLLIDE_1") && f.relatedRecordIds.includes("CRED_MEMO_COLLIDE_2"))],
        ["Vector 3A: Pre-Outreach Discovery Stagnation > 30 Days (Warning)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.STALE_CREDIT && f.relatedRecordIds.includes("CRED_STALE_WARN") && f.severity === AUDIT_SEVERITY.WARNING)],
        ["Vector 3B: Critical Collection Aging > 90 Days (Critical)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.STALE_CREDIT && f.relatedRecordIds.includes("CRED_STALE_CRIT") && f.severity === AUDIT_SEVERITY.CRITICAL)],
        ["Vector 4A: Brand Alias Collision ('Blueberry Reserve' -> VND_KIVA & VND_WYLD)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.MAPPING_AMBIGUITY && f.vendorName === "Blueberry Reserve")],
        ["Vector 4B: Broken Foreign Key in Brand Mappings ('Ghost Extracts' -> VND_NON_EXISTENT_999)",
            has(f => f.violationType === AUDIT_VIOLATION_TYPES.MAPPING_AMBIGUITY && f.vendorName === "Ghost Extracts")],
        ["CSV Exporter: Valid Multi-Row Accounting Reconciliation CSV",
            engine.exportReconciliationCsv(result.findings).split("\n").length === result.findings.length + 1]
    ];

    console.log("--- Verification Assertions ---");
    let failedCount = 0;
    for (const [name, pass] of assertions) {
        console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}`);
        if (!pass) failedCount++;
    }

    if (failedCount > 0) {
        console.error(`\nVERIFICATION FAILED: ${failedCount} assertion(s) did not pass.`);
        process.exit(1);
    }
    console.log(`\nALL ${assertions.length} FORENSIC AUDIT ASSERTIONS PASSED.`);
}

runVerification().catch(err => {
    console.error("Simulation error:", err);
    process.exit(1);
});
