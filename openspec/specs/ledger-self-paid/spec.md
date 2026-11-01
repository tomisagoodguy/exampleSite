# ledger-self-paid Specification

## Purpose

Treats an expense one partner paid out of pocket as that partner's own contribution to the shared ledger, so it counts toward spending habits without reducing the shared account balance and without any reimbursement or offset step. Shows how much each partner has contributed so they can decide for themselves whether one tops up.

## Requirements

### Requirement: Self-paid expense is the payer's contribution

An expense with `method = 'own'` SHALL be labelled 自己付 in the expense form and ledger rows. It SHALL count in category spending, trip spending, the monthly review totals, and CSV export like any other expense. It SHALL NOT create any pending amount, offset row, or reimbursement checkbox.

#### Scenario: Recording a self-paid expense

- **WHEN** the user records a 60 cafe expense with payment method 自己付 paid by 阿康
- **THEN** the row shows 阿康自己付, the month's cafe spending includes 60, and no reimbursement or offset prompt appears anywhere


<!-- @trace
source: ledger-own-advance-offset
updated: 2026-11-01
code:
  - CLAUDE.md
-->

---
### Requirement: Shared balance excludes self-paid expenses

The shared account balance SHALL equal deposits plus adjustments minus expenses, excluding expenses with `method = 'own'` and `checked = false`. Own expenses with `checked = true` (reimbursed from the shared account under the old rule) SHALL still reduce the balance. Bank reconciliation SHALL compare the bank balance minus unpaid card charges against this balance, in the front-end preview and in the `book_balance` stored by the `dating_map_save_balance` RPC, with `own_pending` stored as 0.

#### Scenario: Balance with self-paid expenses

- **WHEN** the ledger has the rows listed below
- **THEN** the shared balance is 17848 and reconciling with bank 20000 and card owed 2152 reports no difference

##### Example: 11月 ledger

- **GIVEN** deposits 小黃 10000 and 阿康 10000 (account); expenses 1782 and 6800 (own, 小黃), 2152 (card), 60 (own, 阿康)
- **WHEN** the balance is computed
- **THEN** balance = 20000 − 2152 = 17848, and bank 20000 − card owed 2152 − 17848 = 0


<!-- @trace
source: ledger-own-advance-offset
updated: 2026-11-01
code:
  - CLAUDE.md
-->

---
### Requirement: Deposit records the actual transfer

A new deposit SHALL be saved as a single row with the amount entered, which is the actual transfer into the bank. The expense form SHALL NOT show an offset calculation, SHALL NOT split the deposit, and SHALL reject an amount of 0. The ledger SHALL NOT show a monthly deposit reminder.

#### Scenario: Saving a deposit

- **WHEN** the user records a 1418 deposit for 小黃 while 小黃 has self-paid expenses on record
- **THEN** exactly one account deposit of 1418 is saved and the form showed no offset line


<!-- @trace
source: ledger-own-advance-offset
updated: 2026-11-01
code:
  - CLAUDE.md
-->

---
### Requirement: Contribution gap is shown for reference

The check view and the monthly review SHALL show, for each identity, the cumulative contribution up to the viewed date (current date in the check view, end of the viewed month in the review), computed as deposits plus unchecked own expenses, with the deposit and self-paid parts. When contributions differ, they SHALL state who contributed more, by how much, and that the other can deposit that amount to even out. The display SHALL NOT block or prompt any action.

#### Scenario: Gap after self-paid expenses

- **WHEN** the ledger has the 11月 rows above
- **THEN** the views show 阿康 10060 (deposit 10000 + self-paid 60), 小黃 18582 (deposit 10000 + self-paid 8582), and that 小黃 contributed 8522 more and 阿康 can deposit 8522 to even out

#### Scenario: Even contributions

- **WHEN** both identities have the same contribution total
- **THEN** the views show both totals and state that the contributions are even

<!-- @trace
source: ledger-own-advance-offset
updated: 2026-11-01
code:
  - CLAUDE.md
-->