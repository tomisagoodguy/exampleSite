## Purpose

Lets the couple mark a shared-ledger expense as 寶寶's drink and shows how many times that happened each week, so 寶寶, who wants to cut sugar, can see the agreed two-per-week limit at a glance. It is a visual review aid, not an alert system.

## ADDED Requirements

### Requirement: Expense can be marked as a drink

The expense form SHALL show a 🧋 寶寶的飲料 checkbox for expenses of any category, both when creating and when editing, and SHALL save it to `is_drink` through the 16-parameter `dating_map_save_expense` RPC. Deposits and adjustments SHALL NOT show the checkbox and SHALL be stored with `is_drink = false`. A marked expense SHALL show 🧋 寶寶的飲料 in its ledger row. When creating an expense, choosing the `cafe` category SHALL tick the checkbox and choosing another category SHALL untick it, until the user toggles the checkbox by hand; after that, category changes SHALL NOT alter it. When editing an existing expense, category changes SHALL NOT alter the checkbox.

#### Scenario: Marking a new expense

- **WHEN** the user records a 60 expense in 飲料甜點 and ticks 🧋 寶寶的飲料
- **THEN** the saved row has `is_drink = true` and its ledger row shows 🧋 寶寶的飲料

#### Scenario: Choosing the cafe category ticks by default

- **WHEN** the user creates an expense and chooses 飲料甜點
- **THEN** the checkbox is ticked, and choosing 吃飯 instead unticks it

#### Scenario: Manual choice wins over the default

- **WHEN** the user creates an expense, chooses 飲料甜點, unticks the checkbox for a dessert, then chooses 吃飯 and 飲料甜點 again
- **THEN** the checkbox stays unticked

#### Scenario: Editing does not apply the default

- **WHEN** the user edits an unmarked 吃飯 expense and changes its category to 飲料甜點
- **THEN** the checkbox stays unticked

#### Scenario: Deposit never carries the mark

- **WHEN** the user ticks the checkbox and then switches the entry to a deposit before saving
- **THEN** the checkbox is hidden and the saved row has `is_drink = false`

#### Scenario: Older client edits an expense

- **WHEN** a page still running the previous bundle saves a marked expense through the 15-parameter RPC
- **THEN** the row keeps `is_drink = true`

### Requirement: Existing cafe expenses are backfilled

The migration SHALL set `is_drink = true` on every existing row with `kind = 'expense'` and `category = 'cafe'`, and SHALL leave all other rows false.

#### Scenario: Backfill of the current rows

- **WHEN** the migration runs against the 2 existing cafe expenses dated 2026-11-01 and 2026-11-03
- **THEN** both have `is_drink = true`, the other 5 expenses stay false, and the ledger history shows the change

### Requirement: Weekly drink count

A week SHALL run Monday through Sunday in local dates. Each expense with `is_drink = true` and `amount >= 0` SHALL count as one, in the week of its `spent_on`. Refunds with a negative amount SHALL NOT count. The count SHALL be computed from all ledger entries regardless of the month being viewed. The weekly limit SHALL be the constant `LEDGER_DRINK_WEEKLY_LIMIT`, set to 2.

#### Scenario: Sunday and Monday are different weeks

- **WHEN** marked expenses exist on 2026-11-01 (Sunday) and 2026-11-02 (Monday)
- **THEN** each falls in a different week and each week counts 1

#### Scenario: Week crossing a month boundary

- **WHEN** marked expenses exist on 2026-11-30 (Monday) and 2026-12-02 (Wednesday)
- **THEN** that week counts 2 whichever month is being viewed

#### Scenario: Refund is not counted

- **WHEN** a marked expense has amount -60
- **THEN** the week's count does not change

### Requirement: Drink count display

When the viewed month is the current month, the ledger list SHALL show at the top a row of cup icons with 🧋 本週 N／2, using max(limit, N) cups: drunk cups filled, unused cups as dashed outlines, and cups beyond the limit in coral. The same row SHALL show 🌱 已經 N 天沒喝 counted from the latest marked expense not later than today, 今天喝過 when that date is today, and nothing when no marked expense exists. The monthly review SHALL show a 🧋 寶寶的飲料 card whenever the ledger has any entry, including when the viewed month has none, with the cup row, a bar chart of the most recent 8 weeks with a dashed limit line and coral bars above the limit, how many of those weeks stayed within the limit, and the viewed month's count and spending. Going over the limit SHALL NOT raise a toast, popup, notification, or scolding text.

#### Scenario: Current week in the ledger list

- **WHEN** today is 2026-11-04, the current month is viewed, and one marked expense exists on 2026-11-03
- **THEN** the top of the list shows 🧋 本週 1／2 with one filled cup, one dashed cup, and 🌱 已經 1 天沒喝

#### Scenario: Over the limit is visible without alerts

- **WHEN** the current week has 3 marked expenses
- **THEN** the list shows 🧋 本週 3／2 with three cups, the third in coral, and no toast or popup appears

#### Scenario: Eight-week chart

- **WHEN** the review is opened and one of the last 8 weeks has 3 marked expenses
- **THEN** that bar is coral and rises above the dashed limit line, and the card states 7 of 8 weeks stayed within the limit

#### Scenario: Drunk today

- **WHEN** a marked expense is dated today
- **THEN** the row shows 今天喝過 instead of a day count

#### Scenario: Past month in the list

- **WHEN** the user views a month other than the current month
- **THEN** the ledger list does not show the weekly count

#### Scenario: Review card with no drinks this week

- **WHEN** the ledger has entries but none are marked in the current week
- **THEN** the review card shows 0 for this week

### Requirement: Drink mark survives history and restore

The ledger history SHALL list changes to `is_drink` with the label 寶寶的飲料 and the values 是 or 否. `dating_map_restore_expense` SHALL keep the mark of a deleted expense, and SHALL restore rows deleted before the column existed with `is_drink = false`.

#### Scenario: Restoring a marked expense

- **WHEN** a marked expense is deleted and then restored from its history row
- **THEN** the restored row has `is_drink = true` and counts again

#### Scenario: Restoring a row deleted before this change

- **WHEN** a history row whose `old_row` has no `is_drink` key is restored
- **THEN** the restore succeeds and the row has `is_drink = false`

#### Scenario: Toggling the mark

- **WHEN** the user unticks the checkbox on an existing marked expense
- **THEN** the history shows 寶寶的飲料 changed from 是 to 否
