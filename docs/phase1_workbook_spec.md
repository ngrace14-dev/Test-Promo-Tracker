# Phase 1A: Workbook Specification Document
## Promotional Credit Recovery Platform (PCRP)

### 1. Workbook Inventory (Worksheets)
| Worksheet Name | Purpose | Future System Mapping |
| :--- | :--- | :--- |
| **Master Tracker** | Active credit lifecycle tracking. | `reconciliationLedger` |
| **Monthly Reports** | Site-specific breakdowns for vendor outreach. | `Reporting Engine` |
| **Brand Directory** | Canonical mapping of Brands to Distributors/Contacts. | `brandMappings` & `vendorMappings` |
| **Recovery Log** | Recording of Memo numbers and Sage application dates. | `promoRecovered` |
| **Annual Archive** | Immutable record of resolved credits from prior years. | `ledgerSnapshots` |

### 2. Formula Inventory
| Calculation Name | Logic (Excel/Current App) | System Definition |
| :--- | :--- | :--- |
| **Credit Owed (Treez)** | `Sum(Vendor Credit Owed)` per Sale Item. | `promoGenerated.amount` |
| **Aggregated Credit** | `Sum(Credit Owed)` grouped by `(Site, Vendor, Month)`. | `reconciliationLedger.generatedTotal` |
| **Outstanding Balance**| `Aggregated Credit - Recovered Amount`. | `reconciliationLedger.balance` |
| **Recovery Rate (%)** | `(Total Recovered / Total Generated) * 100`. | `Reporting Analytics` |
| **Aging Days** | `Today() - Date Discovery/Requested`. | `reconciliationLedger.aging` |

### 3. Business Rule Catalog
- **Rule 1: Discovery Event** - A credit is "Earned" the moment a Treez POS transaction includes a "Vendor Credit Owed" value.
- **Rule 2: Aggregation Boundary** - Individual sales items are aggregated into a "Claim" defined by **Store + Canonical Vendor + Calendar Month**.
- **Rule 3: Settlement Definition** - A credit is only considered "Applied" when a matching entry is found in the Sage Recovery Ledger (Reference ID match).
- **Rule 4: Site Normalization** - "Redding" and "Sundial" are synonymous and must map to the same `SiteID`.

### 4. Data Dictionary
| Logical Field | Data Type | Requirement |
| :--- | :--- | :--- |
| `SiteID` | Enum | [Red Bluff, Redding] |
| `CanonicalVendor` | String | Must match the Legal Entity name in Sage. |
| `BrandName` | String | The marketing name in Treez (e.g., "Kiva"). |
| `EarnedAmount` | Decimal | The discovery value from Treez. |
| `RecoveredAmount` | Decimal | The settlement value from Sage. |
| `ReferenceID` | String | The Memo, Check, or ACH number. |

### 5. Manual Workflow Documentation
1. **Manual Discovery:** Admin uploads Treez CSV and clicks "Push to Tracker".
2. **Manual Outreach:** Admin filters for "Pending", generates a CSV, and clicks a `mailto:` link.
3. **Manual Recovery:** Accounting finds a credit in Sage, opens the Tracker app, finds the vendor, and manually types the Invoice # and Status.

### 6. Gap Analysis
- **Vendor-Specific Templates:** Need support for "Dime" and other vendor-specific itemized CSVs.
- **Sage Ingestion:** Current system lacks an automated way to pull "Recovery" data; it relies on manual typing.
- **Audit History:** Existing status changes overwrite previous data; new system requires an immutable audit trail.
