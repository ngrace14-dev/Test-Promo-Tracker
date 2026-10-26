# Phase 1B: Acceptance Test Matrix
## Parity & Validation Specification

### 1. Parity Validation Matrix
| Test ID | Workbook Output | System Data Source | Parity Validation Rule |
| :--- | :--- | :--- | :--- |
| **VAL-01** | **Earned Total** | `promoGenerated` | `SUM(workbook.earned)` == `SUM(promoGenerated.amount)` within a **$0.01 tolerance** per Store/Month. |
| **VAL-02** | **Recovered Total** | `promoRecovered` | `SUM(workbook.recovered)` == `SUM(promoRecovered.amount)` where `recoveryDate` is in the same fiscal month. |
| **VAL-03** | **Balance Owed** | `reconciliationLedger` | `(GeneratedTotal - RecoveredTotal)` == `reconciliationLedger.balance`. Must handle negative balances. |
| **VAL-04** | **Aging Bucket** | `reconciliationLedger` | System must match workbook aging for `0-30, 31-60, 61-90, 91+` based on `discoveryDate`. |

### 2. Reconciliation Logic & Tolerance Rules
- **Rule R-01 (Exact Match):** Level 1 Match (Reference ID) must be case-insensitive and ignore special characters.
- **Rule R-02 (Penny Tolerance):** A credit is marked `APPLIED` if the variance is $\le \$0.10$.
- **Rule R-03 (Multiple Settlement):** One Sage payment covering multiple months must "Waterfall" (oldest first).
- **Rule R-04 (Vendor Alias):** All spelling variations of a vendor must resolve to a single Canonical Name.

### 3. Edge Case & Exception Testing
| Scenario | Requirement | Success Criteria |
| :--- | :--- | :--- |
| **Duplicate Treez Row** | Re-uploading the same CSV. | Row counts in `promoGenerated` remain unchanged. |
| **Split Store Payment** | One check for both sites. | System splits recovery and applies to respective store ledgers. |
| **Retroactive Credit** | Jan data uploaded in March. | Jan `reconciliationLedger` is updated; Snapshots remain frozen. |

### 4. Snapshot & Audit Integrity
- **Snapshot Parity:** Monthly snapshots must be a byte-for-byte copy of the `reconciliationLedger`.
- **Audit Chain:** Every amount change must log `PreviousValue`, `NewValue`, `User`, and `CorrelationID`.
