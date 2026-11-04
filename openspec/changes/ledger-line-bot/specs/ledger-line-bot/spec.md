## Purpose

Lets the two ledger partners record shared expenses from a LINE group by sending a short text and tapping menus, and check monthly spending and the shared balance, without opening the website. Entries land in the same ledger and change history as the website.

## ADDED Requirements

### Requirement: Webhook accepts only signed LINE requests

The `line-webhook` Edge Function SHALL verify the `x-line-signature` HMAC-SHA256 of the raw request body against `LINE_CHANNEL_SECRET` before reading any event. A request with a missing or invalid signature SHALL receive status 403 and SHALL cause no database access. If `LINE_CHANNEL_SECRET` is not configured the function SHALL respond with status 503. A correctly signed request with an empty event list SHALL receive status 200.

#### Scenario: Forged request

- **WHEN** a POST arrives with a body that does not match its `x-line-signature`
- **THEN** the response status is 403 and no ledger row is written

#### Scenario: LINE console verification

- **WHEN** a correctly signed POST arrives with `{"events":[]}`
- **THEN** the response status is 200

### Requirement: Only whitelisted members are served

The bot SHALL map the event `source.userId` to a ledger name through the `LINE_USER_MAP` secret, a JSON object of LINE user id to `阿康` or `小黃`. Events from a user id absent from the map, or without a user id, SHALL be ignored with no reply and no database access. The only exception is the setup command defined in Requirement: Setup mode reveals the sender's own user id.

#### Scenario: Stranger in the group

- **WHEN** a group member not in `LINE_USER_MAP` sends `午餐 120`
- **THEN** the bot sends no reply and nothing is written

### Requirement: Setup mode reveals the sender's own user id

While the secret `LINE_SETUP_MODE` equals `1`, a message whose whole text is `我的ID` SHALL be answered with the sender's own LINE user id and no other user id. When `LINE_SETUP_MODE` is any other value or unset, the message SHALL be treated like any other text.

#### Scenario: Setup mode off

- **WHEN** `LINE_SETUP_MODE` is unset and a whitelisted member sends `我的ID`
- **THEN** the bot sends no reply

### Requirement: Expense text is parsed by fixed rules

A text message SHALL count as an expense draft only when, after splitting on whitespace, its last token that is not a payment word is an amount expression and at least one note token remains. An amount expression SHALL be positive integers joined by `+`, each allowing thousands commas, summing to between 1 and 9,999,999. A first token of `今天`, `昨天`, `前天`, or `M/D` SHALL set the date, otherwise the date SHALL be today in Asia/Taipei; `M/D` SHALL resolve to the most recent such date not after today. A token `公帳卡`, `公帳帳戶`, or `自己付` SHALL preset the payment method. When the last token that is not a payment word is not itself an amount expression but ends in one directly after a character that is not a digit, `/`, `:`, `.` or `-`, that token SHALL be split into a note part and the amount. The note SHALL be the remaining tokens joined by one space, cut to 60 characters. Any other text SHALL get no reply.

#### Scenario: Plain expense

- **WHEN** a member sends `午餐 120`
- **THEN** the draft has note `午餐`, amount 120, and today's date

#### Scenario: Sum, date and payment word

- **WHEN** a member sends `昨天 全聯 60+55 自己付`
- **THEN** the draft has note `全聯`, amount 115, yesterday's date, and method `own`

#### Scenario: No space before the amount

- **WHEN** a member sends `午餐120`
- **THEN** the draft has note `午餐` and amount 120

#### Scenario: Ordinary chat

- **WHEN** a member sends `晚點到家`
- **THEN** the bot sends no reply

#### Scenario: Zero amount

- **WHEN** a member sends `午餐 0`
- **THEN** the bot sends no reply and nothing is written

### Requirement: Category and payment are chosen from LINE menus

An expense draft SHALL be answered with quick reply buttons listing the rows of `dating_map_ledger_categories` where `hidden` is false, in `sort_order`, followed by a cancel button. When more than 12 categories are visible the first 12 SHALL be listed. Choosing a category SHALL show buttons for 公帳卡, 公帳帳戶, 自己付 and cancel, unless the text preset the method. No ledger row SHALL exist until the category and method are both known. Only the member who sent the original text SHALL be able to advance the draft; taps from the other member SHALL be ignored.

#### Scenario: Two taps complete an expense

- **WHEN** 阿康 sends `午餐 120`, taps 吃飯, then taps 公帳卡
- **THEN** one expense row exists with amount 120, category `food`, method `card`, paid_by 阿康, created_by 阿康, and the bot replies with the note, amount, category, method, payer and date plus a 復原 button

#### Scenario: Preset method skips a step

- **WHEN** 小黃 sends `咖啡 85 自己付` and taps a category
- **THEN** the row is written with method `own` without showing payment buttons

#### Scenario: Cancelled draft

- **WHEN** a member taps cancel on either menu
- **THEN** no row is written and the bot replies that it was cancelled

#### Scenario: Hidden category

- **WHEN** the category `gift` has `hidden = true`
- **THEN** it does not appear among the buttons

#### Scenario: Other member taps

- **WHEN** 小黃 taps a button on a draft 阿康 started
- **THEN** the draft does not advance and nothing is written

### Requirement: Saved expense behaves like a website expense

A row saved from LINE SHALL have kind `expense` and `checked` false. A row saved from a text message SHALL have `is_drink` true exactly when the category is `cafe`; a row saved from the form SHALL use the form's drink checkbox. The change history SHALL attribute LINE actions to the member by sending the `x-dating-map-who` header. Saving SHALL go through `dating_map_save_expense` so the existing validation and sync trigger apply.

#### Scenario: Cafe expense

- **WHEN** a member completes the text `手搖 60` with category `cafe`
- **THEN** the row has `is_drink = true` and the website's drink count includes it

#### Scenario: Open website updates

- **WHEN** a row is saved from LINE while the ledger page is open
- **THEN** the row appears on the page without a manual reload

### Requirement: One text produces at most one expense

Saving SHALL be keyed by the LINE message id of the original text inside one database transaction. A repeated tap or a redelivered webhook event for an already saved message id SHALL NOT create another row and SHALL be answered as already recorded.

#### Scenario: Double tap

- **WHEN** the final button of a draft is delivered twice
- **THEN** exactly one ledger row exists and the second reply says it was already recorded

### Requirement: Member can undo their latest LINE expense

The text `復原` SHALL delete the sender's most recent expense saved from LINE that still exists, and the 復原 button SHALL delete only the expense it was shown with and only when tapped by the member who recorded it, both through the same deletion path as the website so that change history records it and it can be restored there. An expense with `checked = true` SHALL NOT be deleted and the reply SHALL say to change it on the website. If no such expense exists the reply SHALL say there is nothing to undo. Expenses entered on the website SHALL never be affected.

#### Scenario: Undo latest

- **WHEN** 阿康 saved `午餐 120` from LINE and sends `復原`
- **THEN** the row is deleted, the reply names `午餐 $120`, and the website's change history shows the deletion by 阿康

#### Scenario: Undo only touches own entries

- **WHEN** 小黃 sends `復原` and only 阿康 has LINE expenses
- **THEN** nothing is deleted and the reply says there is nothing to undo

#### Scenario: Undo button tapped twice

- **WHEN** 阿康 has two LINE expenses and taps the 復原 button of the latest one twice
- **THEN** only that expense is deleted, the earlier one stays, and the second reply says there is nothing to undo

#### Scenario: Checked expense

- **WHEN** the latest LINE expense was already ticked against the card statement
- **THEN** it stays and the reply points to the website

### Requirement: Member can query month spending and balance

The text `這個月` SHALL be answered with the current Asia/Taipei month's expense total, counting negative refunds, and a per-category breakdown. The text `餘額` SHALL be answered with the shared balance through today, computed as on the website: deposits plus adjustments minus expenses, excluding `method = 'own'` expenses that are not `checked`. The totals SHALL read every ledger row across pages rather than stopping at the 1,000-row PostgREST limit.

#### Scenario: Balance matches website

- **WHEN** a member sends `餘額`
- **THEN** the number equals the balance shown on the ledger page the same day

#### Scenario: Self-paid excluded

- **WHEN** the only change today is a 60 expense with method `own`
- **THEN** `餘額` is unchanged and `這個月` is 60 higher

### Requirement: Failures are reported to the member

When a database or configuration failure stops a save, undo, or query, the bot SHALL reply that the action did not succeed and SHALL NOT report success. The function SHALL log the error without logging the passphrase or access token.

#### Scenario: Passphrase out of date

- **WHEN** the website passphrase changed but `DATING_MAP_PASSPHRASE` did not, and a member completes a draft
- **THEN** no row is written and the reply says it was not recorded

### Requirement: Expense form opens from LINE without typing

When the secret `LINE_LIFF_ID` is set, every bot reply to a whitelisted member SHALL carry a quick reply button labelled 📝 記一筆 that opens `https://liff.line.me/<LINE_LIFF_ID>`, and the text `記帳` SHALL be answered with that button. Replies that already show a category or payment menu SHALL keep their menu and SHALL NOT exceed 13 buttons. The same link SHALL work when pinned as a group announcement.

#### Scenario: Open from a command

- **WHEN** a member sends `記帳`
- **THEN** the reply has a 📝 記一筆 button that opens the form

#### Scenario: Button after a balance query

- **WHEN** a member sends `餘額`
- **THEN** the balance reply also has the 📝 記一筆 button

### Requirement: Rich menu gives a permanent entry

The one-on-one chat with the bot SHALL show a rich menu with four areas: 記一筆 opening `https://liff.line.me/<LINE_LIFF_ID>`, 帳本 opening the same link with `?view=book`, and 餘額, 復原 each sending that exact text. Recording from this chat SHALL NOT notify the other member and SHALL NOT use push messages.

#### Scenario: Record without typing

- **WHEN** a member opens the chat with the bot and taps 記一筆
- **THEN** the expense form opens without sending any message first

#### Scenario: Query without typing

- **WHEN** a member taps 餘額 on the rich menu
- **THEN** the bot replies with the shared balance

#### Scenario: Other member not notified

- **WHEN** 阿康 records an expense from the one-on-one chat
- **THEN** 小黃 receives no LINE message about it

### Requirement: Ledger book opens from LINE without the passphrase

Opening the form link with `view=book` SHALL verify the member as in Requirement: Form identifies the member by LINE login, receive the website passphrase and member name from the function, store them in localStorage under `dating_map_passphrase` and `dating_map_identity`, and go to `/adventure-map/?tab=ledger`. The passphrase SHALL be returned only to a whitelisted member and SHALL NOT appear in any static file. The website SHALL open the 公帳 tab when the URL has `tab=ledger` and SHALL keep its usual opening tab otherwise.

#### Scenario: Open the ledger book

- **WHEN** 小黃 taps 帳本 on the rich menu
- **THEN** the 公帳 page opens inside LINE with 流水, 月曆 and 回顧, without asking for a password

#### Scenario: Stranger opens the book link

- **WHEN** a LINE user outside `LINE_USER_MAP` opens the book link
- **THEN** the function responds 403, no passphrase is returned, and the page says this account cannot view the ledger

#### Scenario: Website without the parameter

- **WHEN** someone opens `/adventure-map/` without `tab=ledger`
- **THEN** the opening tab is chosen as before

### Requirement: Form identifies the member by LINE login

The form SHALL send the LIFF ID token to the `line-webhook` function, which SHALL verify it with the LINE verify endpoint against `LINE_LOGIN_CHANNEL_ID` and map its `sub` through `LINE_USER_MAP`. An invalid token or a user outside the map SHALL receive status 403, SHALL cause no write, and the form SHALL show that this account cannot record. The form SHALL NOT ask for the website passphrase and the page SHALL contain no secret. Form requests SHALL be accepted only from the origin `https://tomisagoodguy.github.io`.

#### Scenario: Whitelisted member opens the form

- **WHEN** 小黃 opens the form inside LINE
- **THEN** the form shows 小黃 as the payer and the visible categories in `sort_order`

#### Scenario: Stranger opens the form

- **WHEN** a LINE user outside `LINE_USER_MAP` opens the link
- **THEN** the function responds 403 and the form shows no way to submit

### Requirement: Form records an expense by tapping

The form SHALL offer the date defaulting to today in Asia/Taipei, an amount field using the numeric keyboard with a ＋ button so sums such as `60+55` can be entered, category and payment buttons matching the website, and an optional note of up to 60 characters. Submit SHALL stay disabled until the amount is valid and a category and payment method are chosen. An empty note SHALL be saved as the category label so 復原 and the summary can name the entry. Each form session SHALL send one generated `liff:` id as the message id, so a repeated submit creates no second row. The function SHALL reject an amount outside 1 to 9,999,999, a malformed date, an unknown method, or an unknown or hidden category with status 400. A saved row SHALL follow Requirement: Saved expense behaves like a website expense.

#### Scenario: Submit by tapping

- **WHEN** 阿康 enters 120, taps 吃飯 and 公帳卡, and submits
- **THEN** one expense row exists with note 吃飯, paid_by 阿康, and the form shows success

#### Scenario: Sum in the amount field

- **WHEN** a member enters 60, taps ＋, enters 55, and submits
- **THEN** the saved amount is 115

#### Scenario: Double submit

- **WHEN** the same form session submits twice
- **THEN** exactly one ledger row exists

#### Scenario: Save failure

- **WHEN** the database rejects the save
- **THEN** the form shows that nothing was recorded and keeps the entered values

### Requirement: Form marks drinks like the website

The form SHALL show a 🧋 寶寶的飲料 checkbox. Choosing the category `cafe` SHALL check it and choosing any other category SHALL clear it, until the member changes the checkbox by hand; after that the category SHALL no longer change it for this entry. The saved `is_drink` SHALL equal the checkbox. The function SHALL reject a save whose drink value is not a boolean with status 400.

#### Scenario: Drink by default

- **WHEN** a member chooses 飲料甜點 and submits without touching the checkbox
- **THEN** the row has `is_drink = true`

#### Scenario: Dessert is not a drink

- **WHEN** a member chooses 飲料甜點, unchecks the checkbox, and submits
- **THEN** the row has category `cafe` and `is_drink = false`, and the weekly drink count does not change

#### Scenario: Drink under another category

- **WHEN** a member checks the box by hand and then chooses 吃飯
- **THEN** the box stays checked and the row has `is_drink = true`

### Requirement: Form result is visible in the chat

After a save, a form opened from a chat SHALL use `liff.sendMessages` to post the summary in that chat as the member, then close the form. This SHALL NOT use push messages. When the form was opened outside a chat, or sending fails, the form SHALL show the success summary instead, and the expense SHALL stay saved. The bot SHALL NOT treat the posted summary as an expense draft.

#### Scenario: Opened from the group

- **WHEN** a member submits the form opened from the group
- **THEN** the group shows that member's message with the note, amount, category, method, payer and date, and the bot does not answer it

#### Scenario: Sending is not allowed

- **WHEN** `liff.sendMessages` fails after a save
- **THEN** the form shows the success summary and the row remains
