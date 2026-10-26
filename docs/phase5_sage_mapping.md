# Sage CSV-to-Ledger Mapping Documentation
## PCRP Phase 5 - Recovery Pipeline

### 1. Header Validation Requirements
The Sage parser expects a General Ledger or Check Register export. It looks for the following logical fields:

| Logical Field | Expected Sage Headers (Any of) |
| :--- | :--- |
| **Vendor Code** | `Vendor`, `Vendor ID`, `ID`, `Supplier` |
| **Vendor Name** | `Vendor Name`, `Name`, `Payee` |
| **Amount** | `Amount`, `Total`, `Credit`, `Net Amount` |
| **Reference** | `Reference`, `Memo`, `Check #`, `Document #`, `Invoice` |
| **Date** | `Date`, `Transaction Date`, `Posting Date` |
| **Type** | `Type`, `Transaction Type`, `Journal` |

### 2. Identity Resolution & Ledger Mapping
Parsed recovery data is mapped to the `promoRecovered` schema.

| Source Sage Value | Processing Logic | Recovery Ledger Field (`promoRecovered`) |
| :--- | :--- | :--- |
| `Vendor ID` | `IdentityService.resolveVendor()` | `vendorId` |
| `Reference` | `trim()` | `refNumber` |
| `Date` | `new Date()` | `recoveryDate` |
| `Amount` | `Math.abs(parseFloat())` | `amount` |
| `Type` | `detectPaymentType()` | `paymentType` (MEMO/ACH/CHECK) |
| - | `sha256(Ref + Amount + Date)` | `dedupeHash` |
| - | `ImportService.currentBatchId` | `batchId` |

### 3. Payment Type Detection Logic
The system classifies recovery entries based on the Sage 'Type' or 'Reference' string:
- **MEMO:** If reference contains "CM", "CR", or "MEMO".
- **ACH:** If reference contains "ACH", "WIRE", or "EFT".
- **CHECK:** If reference is numeric or contains "CK".
- **JOURNAL:** Default for GL journal adjustments.

### 4. Deduplication & Integrity
- **Composite Key:** Records are unique by `refNumber` + `amount` + `recoveryDate`.
- **Integrity:** If a `vendorId` cannot be resolved, the record is stored as `UNMAPPED_RECOVERY` and flagged in the UI.
