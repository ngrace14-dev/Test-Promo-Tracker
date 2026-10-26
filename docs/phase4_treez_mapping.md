# Treez CSV-to-Ledger Mapping Documentation
## PCRP Phase 4 - Discovery Pipeline

### 1. Header Validation Requirements
The parser expects at least one of the following variations for critical fields:

| Logical Field | Expected CSV Headers (Any of) |
| :--- | :--- |
| **Brand** | `Product Brand`, `Brand` |
| **Tracking ID** | `State Tracking Id`, `Tracking Id`, `License Number` |
| **Timestamp** | `Date Closed`, `Date`, `Transaction Date` |
| **Store** | `Store Name`, `Location`, `Site` |
| **Units** | `Units Sold`, `Unit Sold`, `Qty`, `Quantity` |
| **Price** | `Cost Per Unit`, `Unit Price`, `Price` |
| **Discount** | `Discounts`, `Discount Amount`, `Discount` |
| **Credit Owed** | `Vendor Credit Owed`, `Credit Owed` |

### 2. Identity Resolution & Ledger Mapping
Once parsed, raw data is transformed into the `promoGenerated` schema using the `IdentityService`.

| Source CSV Value | Processing Logic | Ledger Field (`promoGenerated`) |
| :--- | :--- | :--- |
| `Product Brand` | `IdentityService.resolveBrand()` | `vendorId`, `brandMappingId` |
| `Store Name` | `IdentityService.resolveSite()` | `storeId` |
| `Date Closed` | `Date.getMonth()` / `Year` | `month`, `year` |
| `Vendor Credit Owed` | `parseFloat()` | `amount` |
| `Tracking Id` | `trim()` | `trackingId` |
| - | `sha256(TrackingID + Store + Timestamp)` | `dedupeHash` |
| - | `ImportService.currentBatchId` | `batchId` |

### 3. Logic & Deduplication
- **Composite Key:** Records are unique by `TrackingId` + `Store` + `Timestamp`.
- **Confidence Tracking:** Records are flagged with `resolutionConfidence` (HIGH/MEDIUM/NONE).
- **Aggregation Rule:** Although raw rows are stored in `promoGenerated`, the `WorkbookService` provides a pre-aggregated summary to the `reconciliationQueue`.
