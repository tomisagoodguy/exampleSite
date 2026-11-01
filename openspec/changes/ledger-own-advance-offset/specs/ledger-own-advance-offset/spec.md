## Purpose

Lets a partner who paid a shared ledger expense out of pocket settle it by depositing less in their next monthly deposit, instead of receiving a transfer back from the shared account. Any amount larger than one deposit carries over to the following deposits until it is fully offset.

## ADDED Requirements

### Requirement: Pending advance per person

The ledger SHALL compute, for each identity, a pending advance amount equal to the sum of that identity's expenses with `method = 'own'` and `checked = false`, minus the sum of that identity's deposits with `method = 'own'`. Own expenses already marked `checked = true` (reimbursed under the previous month-end transfer rule) SHALL be excluded. Refunds recorded as negative own expenses SHALL reduce the amount. The value SHALL be computable as of any date by only counting rows with `spent_on` on or before that date.

#### Scenario: Pending advance from own expenses and offsets

- **WHEN** an identity has own expenses and own deposits on record
- **THEN** the pending advance shown for that identity equals the own expenses (unchecked) minus the own deposits

##### Example: 小黃 pending advance

| Own expenses (unchecked) | Own expenses (checked) | Own deposits | Pending |
| --- | --- | --- | --- |
| 1782, 6800 | none | none | 8582 |
| 1782, 6800 | none | 8582 | 0 |
| 15000 | none | 10000 | 5000 |
| 1782 | 3000 | none | 1782 |

### Requirement: Deposit offsets pending advance

When the user records a new deposit for an identity whose pending advance is greater than zero, the expense form SHALL show the pending amount, the offset amount, and the actual transfer amount before saving. The offset amount SHALL be the smaller of the entered deposit amount and the pending advance; the actual transfer SHALL be the entered amount minus the offset. Saving SHALL write an offset row (`kind = 'deposit'`, `method = 'own'`, amount = offset) and a transfer row (`kind = 'deposit'`, `method = 'account'`, amount = transfer), both with the same date and `paid_by`. A row whose amount would be zero SHALL NOT be written.

#### Scenario: Deposit split into offset and transfer

- **WHEN** the user records a 10000 deposit for an identity with pending advance 8582
- **THEN** the form shows offset 8582 and transfer 1418, and saving writes one own deposit of 8582 and one account deposit of 1418

#### Scenario: Advance larger than one deposit carries over

- **WHEN** the user records a 10000 deposit for an identity with pending advance 15000
- **THEN** saving writes only one own deposit of 10000, no account deposit, and the identity's pending advance becomes 5000

#### Scenario: No pending advance

- **WHEN** the user records a deposit for an identity whose pending advance is zero or negative
- **THEN** the form shows no offset line and saving writes a single account deposit as before

##### Example: offset boundaries

| Entered deposit | Pending | Offset row | Transfer row |
| --- | --- | --- | --- |
| 10000 | 8582 | 8582 | 1418 |
| 10000 | 15000 | 10000 | not written |
| 10000 | 10000 | 10000 | not written |
| 10000 | 0 | not written | 10000 |

### Requirement: Offset deposit counts as contribution

An own deposit SHALL count as a deposit everywhere deposits are counted: the ledger balance, the month's deposit total, the monthly review, CSV export, and the "this month someone has not deposited yet" reminder.

#### Scenario: Offset-only month satisfies the reminder

- **WHEN** an identity's only deposit this month is an own deposit of 10000
- **THEN** the missing-deposit reminder does not list that identity and the month's deposit total includes the 10000

### Requirement: Offset deposit is labelled and preserved on edit

Ledger rows for own deposits SHALL be labelled as an offset (抵先墊) rather than a bank transfer. Editing an existing own deposit through the expense form SHALL keep `method = 'own'`; editing an account deposit SHALL keep `method = 'account'`. Editing an existing deposit SHALL NOT split it into two rows.

#### Scenario: Editing an offset row keeps its method

- **WHEN** the user opens an existing own deposit, changes its amount, and saves
- **THEN** the saved row still has `method = 'own'` and no new row is created

### Requirement: Check view shows pending advance per person

The check view SHALL show, for each identity with a non-zero pending advance, the own expense total, the offset total, and the pending advance, and SHALL state that it is offset at the next deposit. It SHALL NOT present per-row "reimbursed from the shared account" checkboxes for own expenses. The check view tab badge SHALL count identities with a positive pending advance instead of unchecked own rows.

#### Scenario: Check view after recording advances

- **WHEN** 小黃 has unchecked own expenses of 8582 and no own deposits
- **THEN** the check view shows 小黃 pending 8582 to be offset at the next deposit, with no reimbursement checkboxes

### Requirement: Bank reconciliation uses pending advance

Bank reconciliation SHALL subtract the pending advance total (all identities, as of the checkpoint date) from the bank balance, both in the front-end preview and in the `own_pending` value stored by the `dating_map_save_balance` RPC.

#### Scenario: Reconciliation after an offset deposit

- **WHEN** reconciling a ledger whose rows are listed below
- **THEN** the pending advance is 0 and the difference between actual and book balance is 0

##### Example: 11月 settled by offset

- **GIVEN** deposits 阿康 10000 (account), 小黃 8582 (own) and 1418 (account); expenses 1782 (own, 小黃), 6800 (own, 小黃), 2152 (card, unpaid)
- **WHEN** the user reconciles with bank 11418 and card owed 2152
- **THEN** book balance is 9266, pending advance is 0, actual is 11418 − 2152 − 0 = 9266, and the difference is 0
