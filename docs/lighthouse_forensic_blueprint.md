# Lighthouse Forensic Accounting & Soft Audit System — Architectural Blueprint

## 1. Executive Purpose
**Lighthouse** is an internal, non-destructive ("soft") forensic accounting engine built into the Promo Credit Recovery Platform (PCRP). It continuously audits the general ledger (`promoRecovered` from Sage GL/Check Register, `promoCredits` settlement ledger) against POS discovery ledgers (`treesSales`, `promoGenerated`) and canonical identity mappings (`vendorMappings`, `brandMappings`, `siteMappings`).

Unlike pipeline workers that mutate operational records, Lighthouse operates as a **read-only observer over financial ledgers** and writes immutable findings to dedicated forensic collections (`forensicAuditRuns` and `forensicAuditLogs`).

---

## 2. System Data Topology & Ingestion Sources

| Collection | Role in PCRP | Lighthouse Forensic Role |
| :--- | :--- | :--- |
| **`treesSales`** | Raw POS line-item discounted sales | Source of truth for item-level promo discount calculations (`owed`) |
| **`promoGenerated`** | Aggregated discovery claims by `{Site}_{Vendor}_{Period}` | Expected credit baseline (`totalDiscovery`) |
| **`promoRecovered`** | Sage GL / Check Register credit memos, checks, ACHs | Actual GL recovery ledger (`amount`, `refNumber`, `dedupeHash`) |
| **`promoCredits`** | Active workflow & historical settlement ledger | Cross-checked for duplicate claims, status stagnation, and variance |
| **`brandMappings` / `vendorMappings`** | Canonical Identity Layer | Audited for many-to-many collisions, unmapped brands, and orphaned IDs |
| **`forensicAuditLogs`** | **New (Lighthouse)** | Append-only ledger of individual forensic findings/violations |
| **`forensicAuditRuns`** | **New (Lighthouse)** | Summary snapshots of each soft-audit execution for executive trending |

---

## 3. Core Forensic Audit Vectors

### Vector 1: GL vs. POS Variance Audit (`VARIANCE_ANOMALY` & `ORPHANED_SETTLEMENT`)
- **Objective**: Reconcile expected credits discovered from Treez POS (`promoGenerated` / `treesSales` / `promoCredits`) against actual general ledger settlements (`promoRecovered` / applied credits) per Vendor, Site, and Accounting Period.
- **Rules**:
  - Calculate `expectedAmount`, `recoveredAmount`, `varianceDollars` (`expected - recovered`), and `variancePercent`.
  - Flag `WARNING` if `|varianceDollars| > FORENSIC_THRESHOLDS.VARIANCE_TOLERANCE_DOLLARS` ($25) and `|variancePercent| > 5%`.
  - Flag `CRITICAL` if `|varianceDollars| >= $500` or `|variancePercent| >= 20%`.
  - Flag `ORPHANED_SETTLEMENT` (`WARNING`) if a Sage GL recovery (`promoRecovered`) exists for a vendor/period with zero corresponding discovery or claim record.
  - Flag `UNMAPPED_GL_RECOVERY` (`CRITICAL`) if a Sage GL recovery record has a `null` or unresolved `vendorId`.

### Vector 2: Duplicate & Overlap Claim Detection (`DUPLICATE_CLAIM`)
- **Objective**: Prevent double-counting or duplicate billing/deductions across `promoCredits` and `promoRecovered`.
- **Rules**:
  - Fingerprint claims using normalized composite keys:
    1. **Exact Settlement Reference Collision**: Multiple `promoCredits` or `promoRecovered` records sharing the same non-empty `creditMemoNumber` / `refNumber`.
    2. **Period-Vendor-Site-Amount Collision**: Multiple distinct records in `promoCredits` with identical `(canonicalVendorId || vendor, site, month, year, amount)` within the same period.
  - Severity: `CRITICAL` when duplicate records are both in `APPLIED` / `MEMO_RECEIVED` status; `WARNING` when in pre-settlement statuses.

### Vector 3: Aging & SLA Stagnation Audit (`STALE_CREDIT`)
- **Objective**: Detect revenue leakage caused by credits sitting idle in early workflow states or aging past collection windows.
- **Rules**:
  - **Discovery Stagnation (`WARNING`)**: Credits remaining in `DISCOVERED`, `VALIDATED`, or `READY_TO_SEND` beyond `STALE_DISCOVERY_SLA_DAYS` (30 days).
  - **Collection Aging Risk (`CRITICAL`)**: Unrecovered credits (`CONTACTED`, `AWAITING_RESPONSE`, `UNDER_REVIEW`, `CREDIT_APPROVED`, `Pending`, `Report Sent`) aging beyond `AGING_CRITICAL_SLA_DAYS` (90 days) without a linked GL recovery.

### Vector 4: Canonical Identity & Mapping Integrity (`MAPPING_AMBIGUITY`)
- **Objective**: Ensure the Canonical Identity Layer (Phase 3) has no referential leaks that would misattribute GL entries.
- **Rules**:
  - **Alias Collision (`CRITICAL`)**: The same normalized `brandName` in `brandMappings` points to multiple distinct `vendorId` values.
  - **Broken Foreign Key (`CRITICAL`)**: A `brandMappings` record references a `vendorId` that does not exist in `vendorMappings`.

---

## 4. Storage Schema & Service API

### `forensicAuditLogs` (Append-Only Findings Collection)
Each finding stores `runId`, `violationType`, `severity`, `status`, `vendorId`, `vendorName`, `site`, `period`, `expectedAmount`, `actualAmount`, `varianceAmount`, `variancePercent`, `relatedRecordIds`, `message`, and `detectedAt`.

### `services/LighthouseEngine.js` Public Methods
- `runFullForensicAudit(options)`: Orchestrates all 4 forensic vectors, optionally persists findings to `forensicAuditLogs`, and returns a comprehensive executive summary.
- `runVarianceAudit(period)`: Compares discovery/claim amounts against Sage GL recoveries (`promoRecovered` & applied `promoCredits`).
- `detectDuplicateClaims(period)`: Scans for duplicate claim fingerprints and shared memo/reference numbers.
- `detectAgingOutliers()`: Identifies credits breaching discovery (30d) or collection (90d) SLAs.
- `detectMappingAmbiguities()`: Audits `brandMappings` and `vendorMappings` for alias collisions and orphaned foreign keys.
- `generateSummary(findings)`: Aggregates findings by severity, violation category, vendor risk score, and total dollar exposure.
- `exportReconciliationCsv(findings)`: Formats findings into an accounting-ready CSV string for controller review.
