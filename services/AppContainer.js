/**
 * services/AppContainer.js
 *
 * Purpose: Dependency Injection (DI) Container & Multi-Tool Suite Navigation Registry.
 * Decouples service instantiation from the monolithic Vue UI controller and provides
 * canonical metadata for the Hub-and-Spoke Multi-Tool Suite.
 */

import { IdentityService } from "./IdentityService.js";
import { HydrationService } from "./HydrationService.js";
import { QueueService } from "./QueueService.js";
import { LighthouseEngine } from "./LighthouseEngine.js";
import { DiscoveryAggregationEngine } from "./DiscoveryAggregationEngine.js";
import { PeriodDetectionEngine } from "./PeriodDetectionEngine.js";
import { WorkbookSyncService } from "./WorkbookSyncService.js";

export const SUITE_TOOLS = [
    {
        id: "LIGHTHOUSE",
        title: "Lighthouse Forensic Audit",
        subtitle: "GL & POS Soft Audit Engine",
        category: "Forensic Accounting",
        icon: "radar",
        accent: "amber",
        badge: "4 Vectors Active",
        description: "Non-destructive forensic accountant soft audit across General Ledger recoveries, Treez POS discovery, duplicate claims, aging SLAs, and identity mappings."
    },
    {
        id: "DASHBOARD",
        title: "Executive Dashboard",
        subtitle: "YTD Performance & KPIs",
        category: "Governance",
        icon: "layout-dashboard",
        accent: "emerald",
        badge: "99.9% Parity",
        description: "High-level recovery analytics, YTD workbook parity metrics, and executive financial exposure tracking across all store locations."
    },
    {
        id: "DISCOVERY",
        title: "Credit Discovery Engine",
        subtitle: "Treez POS Claim Aggregation",
        category: "Reconciliation",
        icon: "search",
        accent: "blue",
        badge: "POS Pipeline",
        description: "Ingests itemized Treez POS discounted sales and aggregates vendor promotional credit opportunities by site and period."
    },
    {
        id: "RECOVERY",
        title: "Sage GL Recovery Log",
        subtitle: "General Ledger & Check Register",
        category: "Reconciliation",
        icon: "history",
        accent: "emerald",
        badge: "Sage Pipeline",
        description: "Tracks credit memos, ACHs, checks, and GL journal settlements imported from Sage accounting exports."
    },
    {
        id: "IMPORT_CENTER",
        title: "Import Control Center",
        subtitle: "Data Ingestion & Batch Monitor",
        category: "Governance",
        icon: "terminal",
        accent: "indigo",
        badge: "Batch Queue",
        description: "Centralized ingestion workbench for Treez POS CSVs, Sage GL exports, and horizontal Excel promo tracking workbooks."
    },
    {
        id: "IDENTITY",
        title: "Canonical Identity Hub",
        subtitle: "Vendor, Brand & Site Resolver",
        category: "Calibration",
        icon: "fingerprint",
        accent: "amber",
        badge: "Phase 3 Verified",
        description: "Resolves unmapped POS brand strings and Sage vendor codes into canonical vendor identities with referential integrity."
    },
    {
        id: "LEDGER",
        title: "Master Settlement Ledger",
        subtitle: "Active Credit & Outreach Tracker",
        category: "Reconciliation",
        icon: "book-open",
        accent: "slate",
        badge: "System of Record",
        description: "Operational credit recovery workbench for logging vendor resolutions, credit memo numbers, and brand portal report publishing."
    },
    {
        id: "VALIDATION",
        title: "Workbook Calibration",
        subtitle: "Aging & Parity Verification",
        category: "Calibration",
        icon: "check-circle-2",
        accent: "emerald",
        badge: "Calibrated",
        description: "Cross-checks platform ledger totals against master accounting workbooks and vendor aging buckets (0-30, 31-60, 61-90, 90+)."
    }
];

/**
 * Generates a deterministic 4-vector forensic dataset for in-app simulation and testing.
 */
export function buildBrowserSimulatedDataset() {
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
            { id: "BM_COLLIDE_1", brandName: "Blueberry Reserve", vendorId: "VND_KIVA" },
            { id: "BM_COLLIDE_2", brandName: "Blueberry Reserve", vendorId: "VND_WYLD" },
            { id: "BM_ORPHAN_FK", brandName: "Ghost Extracts", vendorId: "VND_NON_EXISTENT_999" }
        ],
        promoGenerated: [
            {
                id: "GEN_KIVA_AUG",
                site: "Red Bluff",
                vendorId: "VND_KIVA",
                vendorName: "Kiva Confections",
                month: "August",
                year: 2026,
                totalDiscovery: 5000.00
            },
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

export function createAppContainer(db, logSystemAction) {
    const identityService = new IdentityService(db, logSystemAction);
    const hydrationService = new HydrationService(db, identityService, logSystemAction);
    const queueService = new QueueService(db, logSystemAction);
    const lighthouseEngine = new LighthouseEngine(db, logSystemAction);
    const discoveryEngine = new DiscoveryAggregationEngine(db, identityService, logSystemAction);
    const periodEngine = new PeriodDetectionEngine();
    const workbookSyncService = new WorkbookSyncService(db, logSystemAction);

    return {
        identityService,
        hydrationService,
        queueService,
        lighthouseEngine,
        discoveryEngine,
        periodEngine,
        workbookSyncService
    };
}
