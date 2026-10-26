# Phase 2: Domain Model Design
## Firestore Schema & Processing Architecture

### 1. Collection Specifications

#### A. Source Ledgers (Immutable)
- **`promoGenerated`**: Discovery ledger from Treez. Documents include `batchId`, `storeId`, `vendorId`, `month`, `year`, `amount`, `trackingId`, `status`.
- **`promoRecovered`**: Recovery ledger from Sage. Documents include `batchId`, `vendorId`, `amount`, `refNumber`, `recoveryDate`, `paymentType`, `status`.

#### B. Computed Ledger & Workflow
- **`reconciliationLedger`**: Central financial hub. `{StoreId}_{VendorId}_{MM-YYYY}`. Includes `generatedTotal`, `recoveredTotal`, `balance`, `status`, `aging`, `lastReconciled`.
- **`reconciliationQueue`**: Processing queue for decoupled reconciliation updates. Includes `targetLedgerId`, `priority`, `actionType`, `retryCount`, `status`.

#### C. Metadata & Mappings
- **`vendorMappings`**: Canonical Vendor Master. `vendorName`, `sageVendorCode`, `outreachEmail`, `paymentTerms`.
- **`brandMappings`**: Resolver for Treez Brand names. `brandName`, `canonicalVendorId`.

### 2. Reconciliation Queue Design
1. **Ingestion Trigger:** `promoGenerated` or `promoRecovered` write triggers an entry in `reconciliationQueue`.
2. **Worker Execution:** A Cloud Function processes the queue to recalculate the specific `reconciliationLedger` entry.
3. **Audit Logging:** Any update to the ledger by the worker generates an `auditLogs` entry.

### 3. Snapshot Model (`ledgerSnapshots`)
- **Frequency:** End of calendar month.
- **Rules:** Read-only access after creation. Stores historical financial states for audit compliance.

### 4. Security & Roles
- **RBAC:** Admins (Full), Accounting (Recovery/Settlement), Management (View-only).
- **Field-Level Protection:** Source totals (`generatedTotal`) cannot be manually modified; only updated via pipeline workers.

### 5. Indexing Requirements
- **Composite Index 1:** `reconciliationLedger`: `storeId` (ASC) + `period` (DESC) + `status` (ASC)
- **Composite Index 2:** `promoGenerated`: `vendorId` (ASC) + `status` (ASC) + `amount` (DESC)
- **Composite Index 3:** `promoRecovered`: `vendorId` (ASC) + `refNumber` (ASC)
