# Order Management Sheet — shared schema & sync mechanics

Referenced by `etsy-order-sheet-sync` (the skill that owns this workflow) and
by any other skill that touches orders and should keep the sheet current
(`etsy-ship-assistant` after a shipment is confirmed, `etsy-morning-briefing`
when it wants a historical view). This is a **live Google Sheet**, reached
through the `google-sheets` MCP server (see `.mcp.json`), not a local
`data/*.json` file — different write-confirmation rules apply than the other
`_shared` guides in this folder (see "Confirmation discipline" below).

## The sheet

- **Title:** "Etsy Order"
- **Spreadsheet ID:** `1sKw8DjlHPFxHtlR_0r4JJtWI1KhoSW7EUxXpPMDTEE4`
- **URL:** https://docs.google.com/spreadsheets/d/1sKw8DjlHPFxHtlR_0r4JJtWI1KhoSW7EUxXpPMDTEE4
- **Tabs:**
  - **`Orders`** — one row per **line item** (per transaction), not per
    receipt — a multi-item order produces multiple consecutive rows sharing
    the same `Receipt ID`. This is the sync target for everything in this
    guide. Header lives on **row 3** (row 1 holds two section-label cells,
    "Etsy Details" over columns A–L and "Supplier & Order Fulfilment" over
    columns M–S; row 2 is a blank spacer) — always write/read against row 3
    as the header row, not row 1.
  - **`Index`** — holds a reference list titled "Accounts" in column B
    (`Itrat`, `Abbas`, `Anas`, at `Index!B3:B5`). This used to back a
    dropdown on `Orders!Account`, but per explicit user instruction
    (2026-08-01) that dropdown was removed — **`Orders!Account` is plain
    text now, don't re-add data validation there.** Leave the `Index` list
    itself alone (harmless reference), just don't wire it back up.

This is the shop's **cross-account order & customer record**: since Etsy's
API has no dedicated "customer" object, the buyer name/address/order-history
fields on each `Orders` row are also this system's de facto lightweight CRM —
see "Customer-management angle" below.

## STRICT — physical orders only, never digital (explicit user instruction, 2026-08-01)

This sheet tracks **physical fulfillment** (supplier sourcing, tracking,
ship-by deadlines) — digital/download listings have no fulfillment step, so
they never belong here. **Every transaction returned by
`get_shop_receipts`/`get_receipt_transactions_by_receipt` already carries an
`is_digital` boolean** — use it directly, don't infer from title/listing
type:

- Skip any **transaction** where `is_digital` is `true` — don't write a row
  for it.
- If **every** transaction on a receipt is digital, skip the whole receipt —
  no row at all for that order.
- If a receipt mixes physical and digital line items (rare), write rows only
  for the physical transactions.
- This applies to every pull, not just a first bootstrap sync — a resync
  must never re-add a digital row even if one is passed in the scope.

## Sort order & dispatch-date highlight (explicit user instruction, 2026-08-02)

The `Orders` tab is always kept **sorted chronologically ascending by `Order
Date` (column A) — oldest order on top, newest at the bottom.** Whenever any
row is added or updated (a Workflow 1 pull, or an ad hoc conversational
status update), re-sort the full data range (`A4:T<last row>`) by column A
ascending immediately afterward — via a `batch_update` `sortRange` request
(`dimensionIndex: 0, sortOrder: "ASCENDING"`), not a manual row move. Since
Google Sheets' native sort moves formulas and cell formatting along with
each row's data, this is safe to run even with the `Listing ID` hyperlink
formula and the `Profit` formula in place — do this on every sync, not just
once.

**`Ship-by Deadline` (column S) is always highlighted** with a light
background color so the dispatch deadline is visually easy to spot — applied
once via a `repeatCell` request over `S4:S1000` (`red:1, green:0.949,
blue:0.8`, matching the same "extend to row 1000" convention as the date
number-format rule below), so it already covers every future row
automatically. Don't remove or need to reapply this on a normal sync — only
re-run it if the highlight is ever accidentally cleared.

**When the user asks to "update orders from `<account>`/`<accounts>`"**:
add only whatever orders aren't already in the sheet (per the sync key
below — never duplicate an existing `(Account, Receipt ID, Listing ID)`
row) exactly as Workflow 1 already does, then re-sort per the rule above as
the last step of that same request, every time — sorting isn't a separate
ask, it's baked into every add/update.

## Sync key — how a row is matched to an order

Since rows are per-line-item, match on **(`Account`, `Receipt ID`, `Listing
ID`)** — not `Receipt ID` alone (not unique across accounts) and not
`(Account, Receipt ID)` alone (not unique across a multi-item order's rows).
In the rare case the same `Listing ID` appears twice in one receipt (two
different variants of the same listing), also compare the `Variant` column
to disambiguate.

## `Orders` tab column schema

Current header row (row 3, columns A–T) — write this row before appending
any data if the tab is ever rebuilt from scratch:

| Column | Source | Notes |
|---|---|---|
| Order Date | transaction/receipt `create_timestamp`, written as a real date value | displayed as `d mmmm yyyy` (e.g. "31 July 2026") — a sheet-wide column number format, not a text string. Write the actual date (not `YYYY-MM-DD` text) via `USER_ENTERED` input; the column's number format handles the display automatically |
| Account | the connected-account name passed to the pull, capitalized (`Itrat`, `Abbas`, `Anas` — matches `Index!B3:B5`'s casing) | **plain text, no dropdown** — see note above |
| Receipt ID | `receipt_id` | part of the sync key |
| Listing ID | transaction's `listing_id` | part of the sync key. **Write as a clickable link, not a plain number** — `=HYPERLINK("https://www.etsy.com/listing/<listing_id>","<listing_id>")`, so clicking the cell opens that listing on Etsy. Use `USER_ENTERED` value input (not `RAW`) when writing this cell or the formula won't evaluate. |
| Listing Title | transaction's `title` | |
| Variant (Size/Color) | transaction's `variations`, joined as `"<formatted_name>: <formatted_value>, ..."` | blank if no variations |
| Qty | transaction's `quantity` | |
| Customer Name | receipt's `name` | |
| Shipping Address (full) | receipt's `formatted_address`, verbatim (keep internal line breaks) | |
| Country | receipt's `country_iso` | |
| Customer Contact | always blank | **Etsy's Open API does not expose buyer email** (`buyer_email` is always `null`) — don't guess or leave a stale value, just blank |
| Payment Received | **ledger-derived true net earning** (see "Payment Received — true net earning, not `amount_net`" below) — NOT `get_payment_by_receipt`'s `amount_net` field, which is incomplete | **Write as a plain NUMBER (e.g. `40.83`), never as text with a symbol prefix (`"$40.83"`)** — the dashboard's `SUMIF` needs real numbers. Apply the currency symbol via a per-cell `numberFormat` (`CURRENCY`, pattern `"$"#,##0.00` / `"€"#,##0.00` / `"£"#,##0.00` matching that receipt's `buyer_currency`, from `get_payment_by_receipt`) instead of baking it into the value. Write only on the FIRST line-item row of each receipt, blank on subsequent rows of the same receipt (it's a receipt-level figure — `SUMIF` naturally ignores the blanks, no double-counting). This is the actual amount that lands in the seller's account after ALL Etsy deductions, not the buyer-paid gross total — don't confuse with `grandtotal` from `get_shop_receipts` |
| Supplier | manual | never auto-filled by a sync |
| Order Placed? | manual | never auto-filled by a sync — but the dashboard's `Processing` bucket reads this column (non-blank = "sent to supplier"), so a blank vs. any-value distinction matters once the user starts filling it in |
| Order ID | manual (supplier's own order reference) | never auto-filled by a sync |
| Total Sourcing Cost | manual, **always entered in USD** (explicit user instruction, 2026-08-01 — the user pays suppliers in USD regardless of what currency the buyer paid in, and always records this figure in USD) | never auto-filled by a sync |
| Tracking Number | receipt's `shipments` array once shipped, `"<carrier_name>: <tracking_code>"` | blank until shipped — the dashboard's `Tracking Pending` bucket is just "this column is blank", so keep it truly empty, not a placeholder string |
| Fulfillment Status | derived — see taxonomy below | conditional formatting colors each state — keep the exact wording (`Pending`/`Shipped`/`Delivered`/`Unpaid`, optionally `" (Refunded)"` appended) so the color rules and the dashboard's `COUNTUNIQUEIFS` wildcard matches (`"Pending*"` etc.) keep working |
| Ship-by Deadline | transaction's `expected_ship_date`, written as a real date value | displayed as `d mmmm yyyy` (e.g. "6 August 2026"), same column-format convention as `Order Date` above — blank if not present |
| Profit (approx., USD) | **formula** (col T), added 2026-08-01: `=IF(AND(L{row}<>"",P{row}<>""),L{row}-P{row},"")` | `Payment Received` (col L) minus `Total Sourcing Cost` (col P) — blank until both are populated, so an order with no sourcing cost on file yet doesn't show a misleadingly-full "profit". **Approximate by design**: `Payment Received` lands in whatever currency the buyer paid in (per that payment's own `amount_net.currency_code`), while `Total Sourcing Cost` is always USD — this is a raw subtraction across currencies, no FX conversion, same approximation the pre-existing `Total Net Sales (approx.)` dashboard figure already makes. Formatted as flat USD (`$#,##0.00`), not the row's own payment currency, so the displayed symbol never implies false FX precision. |

**Date display (explicit user instruction, 2026-08-01):** `Order Date` (col A)
and `Ship-by Deadline` (col S) are stored as real Google Sheets date values
(not text), formatted with the column-level number-format pattern
`d mmmm yyyy` — e.g. "31 July 2026", not "2026-07-31". This was set once via
a `batch_update` `repeatCell` request over rows 4–1000 of each column, so it
already covers every future synced row automatically — a sync only needs to
write the actual date (via `USER_ENTERED` input), never a manually-formatted
string, and the column format takes care of display. If a resync ever
appends rows past row 1000, extend the same `repeatCell` format range rather
than letting new rows fall back to Sheets' default date display.

The four manual columns (Supplier, Order Placed?, Order ID, Total Sourcing
Cost) are intentionally never touched by an automatic sync — that's the
user's own fulfillment tracking, a pull only ever fills the Etsy-sourced
columns. **`Profit` (col T) is likewise never written by a sync** — it's a
live formula, not a stored value, so it recalculates on its own the instant
`Total Sourcing Cost` is filled in or `Payment Received` changes; a sync
should just leave the cell alone (same as the manual columns, just for a
different reason — formula vs. deliberately-manual).

### Payment Received — true net earning, not `amount_net` (explicit user instruction, 2026-08-02)

**`get_payment_by_receipt`'s `amount_net` field is INCOMPLETE and must never be
written into the `Payment Received` column directly.** Confirmed live against
Etsy's own Shop Manager "Earnings" screen for a real receipt (gross $30.32 →
Etsy showed "You earned $21.53"): `amount_net` only accounts for the
Payment Processing Fee (and, inconsistently, sometimes sales tax pass-through
— see below) — it never subtracts the **Transaction Fee** or the
**Offsite Ads Fee** (when the order carries one), both of which are real
deductions Etsy takes before the seller ever sees the money. Using
`amount_net` as-is overstates earnings, in the observed cases by $1.50–$6.50
per order.

**The correct figure requires pulling itemized ledger entries** via
`get_payment_ledger_entries` and summing everything that actually belongs to
that receipt/payment:

1. `get_payment_by_receipt` (account, receipt_id) → `payment_id`,
   `amount_gross`, `buyer_currency` (for the number format), `create_timestamp`.
2. `get_receipt_transactions_by_receipt` (account, receipt_id) → every
   line-item's `transaction_id` (a multi-item receipt has more than one).
3. `get_payment_ledger_entries` (account, `min_created`: create_timestamp −120,
   `max_created`: create_timestamp +3600 — widen to +86400 if nothing turns up)
   → the ledger entries posted around that payment.
4. Sum: the `PAYMENT_GROSS` entry (`reference_type: "shop_payment"`,
   `reference_id: payment_id`) **minus** every entry tied to this receipt/
   payment/transaction — `PAYMENT_PROCESSING_FEE` (`reference_type:
   "processing_fee"`, `reference_id: payment_id`), every `transaction`-type
   entry (`reference_type: "transaction"`, `reference_id` in this receipt's
   transaction_ids — one per line item), `shipping_transaction`
   (`reference_type: "receipt"`, `reference_id: receipt_id`), `sales_tax`
   (same reference pattern, present whenever the order had tax), `buyer_fee`
   (same reference pattern — confirmed live 2026-08-03, a newer Etsy ledger
   line not documented anywhere else in this project; it's a real deduction
   from the seller's balance, same as sales_tax/shipping_transaction, not a
   pass-through to ignore), and `offsite_ads_fee` (same pattern, only present
   on some orders — don't treat its absence as an error). **Exclude** anything
   with `reference_type: "listing"` (e.g. `renew_sold_auto`, `listing_refund`)
   — those are listing-level fees, not part of this order's earnings.
   **Do not skip the `transaction` or `shipping_transaction` deductions** —
   confirmed live 2026-08-03: a sync miscalculated `Payment Received` by
   summing only `PAYMENT_GROSS − PAYMENT_PROCESSING_FEE − sales_tax` (and
   `buyer_fee` when present), silently dropping the `transaction`-type and
   `shipping_transaction` entries — overstating net earning by $1.42–$4.38
   per receipt in the observed cases. Every entry tied to the receipt/payment
   must be included, not just the "obvious" fee-named ones.
5. The result, divided by 100 (ledger amounts are in minor units), is the
   true `Payment Received` figure.

**Known API quirk — the ledger's own `currency` field is unreliable for
foreign-currency receipts.** Every `get_payment_ledger_entries` result
reports `"currency": "USD"` regardless of the payment's actual currency —
confirmed live: a GBP receipt's ledger `PAYMENT_GROSS` amount numerically
matched its `amount_gross` in GBP exactly (not FX-converted to real USD), so
the entries are genuinely in the original buyer currency, just mislabeled.
**Always source the currency for number-formatting from
`get_payment_by_receipt`'s `buyer_currency` field, never from the ledger
entries' own `currency` field.**

This read/aggregate job (multiple receipts × multiple chained API calls
each) is exactly the kind of bulk research task that belongs to a **Haiku**
subagent per CLAUDE.md's model-usage rule — delegate it, don't do the
per-receipt ledger math in the main thread.

### Fulfillment Status taxonomy (STRICT wording — the dashboard depends on it)

Derive from the **receipt's own fields**, not just `is_shipped`/`is_paid`:

- `is_paid` is `false` → **`Unpaid`**
- `is_paid` is `true`, `is_shipped` is `false` → **`Pending`**
- `is_shipped` is `true` **and** the receipt's raw `status` field is *not*
  `"Completed"` → **`Shipped`**
- the receipt's raw `status` field **is** `"Completed"` → **`Delivered`**
  (Etsy only sets this once the order is fully closed out — don't infer
  Delivered from `is_shipped` alone, a shipped-but-not-yet-`Completed`
  receipt is still `Shipped`)
- if `refunds` is non-empty, append `" (Refunded)"` to whichever of the
  above was computed (e.g. `"Shipped (Refunded)"`)

This four-state taxonomy (plus the manual `Order Placed?`/`Tracking Number`
columns) is exactly what the **Index tab dashboard** (below) counts — don't
invent new status words without updating the dashboard formulas too.

## `All Listings` tab — cross-account listing registry

Explicit user instruction, 2026-08-01. A third tab (alongside `Orders` and
`Index`) tracking **every listing this system has ever created or been
told about, across every connected account** — not orders, the listings
themselves. One row per listing.

### Column schema (header row 1)

| Col | Header | Source | Notes |
|---|---|---|---|
| A | Listing ID | — | write as `=HYPERLINK("https://www.etsy.com/listing/<id>","<id>")`, same convention as `Orders!Listing ID` |
| B | Listing Title | live Etsy (`get_listings_by_ids`/`get_listing`) | |
| C | Account | the connected-account name, capitalized (`Itrat`, `Abbas`, …) — plain text, matches `Orders!Account`'s convention, no dropdown |
| D | Type | derived (`physical`/`download` from the live listing, or the local record's own `type` field) | dropdown: `Physical` / `Digital` |
| E | Status | live Etsy `state` (`draft`→`Draft`, `active`→`Active`, `inactive`→`Inactive`, `edit`→`Edit (Frozen)`, `expired`→`Expired`, `sold_out`→`Sold Out`) | dropdown: `Draft` / `Active` / `Inactive` / `Edit (Frozen)` / `Expired` / `Sold Out` |
| F | Price | live Etsy (`get_listings_by_ids` — the listing's current price, not the local record's, which can drift stale) | currency format |
| G | Quantity | live Etsy | |
| H | Product ID | **local only** — `data/listings/<account>/<listing_id>/record.json`'s (or the flat digital `.json`'s) `product_id` field | this doesn't exist anywhere in Etsy's API, local record is the only source |
| I | Source | **local only** — the local record's `sources` array (per `product-registry-guide.md`'s mandatory sourcing rule), condensed to `"<label>: <value>"` for the first entry (note `"+N more"` if there's more than one) | **leave blank if the local record has no `sources` field — never fabricate a source.** Most listings created before 2026-08-01 predate the sourcing rule and genuinely have none on file; that's expected, not an error |
| J | Created Date | live Etsy (`get_listing`'s `creation_timestamp`/`original_creation_timestamp`, formatted `YYYY-MM-DD`) | local records don't store this |

**Why live Etsy for columns B/E/F/G/J but local-only for H/I:** Etsy's API
is the authoritative, always-current source for anything it actually
exposes (title, state, price, quantity, creation date) — the local
`record.json` can drift stale between edits. But `product_id` and `sources`
exist **only** in the local record; Etsy has no equivalent field for
either, so those two columns can only ever be as complete as the local
bookkeeping is.

### Keeping it current

- **On every new listing this system creates** (`etsy-create-listing`,
  `etsy-new-listing-copywriter`, `etsy-copy-listing`, or any ad-hoc draft),
  for **whichever account it's on** — append a row here in the same turn as
  the listing-record write (same local-bookkeeping reasoning as everywhere
  else, no separate confirmation). Pull `Source` from that listing's own
  `sources` array if the create flow captured one (per the mandatory
  sourcing rule); if it somehow wasn't captured, leave the cell blank
  rather than guessing — don't block the row from being added over a
  missing source.
- **Existing/already-published listings** get backfilled from
  `data/listings/<account>/` (folder-based for physical, flat-file for
  digital) cross-referenced with a batched `get_listings_by_ids` call per
  account (up to 100 IDs per call) for the live-sourced columns. This is a
  bulk read-and-aggregate job — per `CLAUDE.md`'s model-usage rule, delegate
  it to a **Haiku** subagent, never do the file-by-file reading in the main
  thread.
- If a listing is later deleted from Etsy (per the "one current record per
  product" rule elsewhere in this project), remove its row here too, same
  as removing its local record folder.

## Dashboard (`Index` tab)

The `Index` tab (sheet ID `1468010829` as of 2026-08-01 — confirm with
`list_sheets`/`get_multiple_spreadsheet_summary` if this ever seems stale)
holds two things:

- **`Accounts` reference list** — `Index!B2` is the header cell (`"Accounts"`),
  `Index!B3:B5` (as of 2026-08-01: `Itrat`, `Abbas`, `Anas`) lists every
  tracked account's display name. `Orders!Account` is plain text (no
  dropdown), but this list is still what the dashboard formulas below key
  off of.
- **Fulfillment dashboard** — a title banner, a summary table, and two
  charts, starting at `Index!B8`. Table layout as of 2026-08-01 (`Total
  COGS`/`Total Profit` columns added 2026-08-01):
  - `B8:I8` merged title banner, `B9:I9` merged subtitle.
  - `B11:K11` header row: `Account | Total Orders | Total Net Sales
    (approx.) | Pending | Processing | Shipped | Delivered | Tracking
    Pending | Total COGS (USD) | Total Profit (approx.)`.
  - One data row per account (`B12`, `B13`, `B14`, … — same order as the
    `Accounts` list), formulas keyed off that row's `$B` cell, e.g. for the
    row where `$B12` = an account name:
    ```
    Total Orders:      =COUNTUNIQUEIFS(Orders!$C$4:$C$1000,Orders!$B$4:$B$1000,$B12)
    Total Net Sales:   =SUMIF(Orders!$B$4:$B$1000,$B12,Orders!$L$4:$L$1000)
    Pending:           =COUNTUNIQUEIFS(Orders!$C$4:$C$1000,Orders!$B$4:$B$1000,$B12,Orders!$R$4:$R$1000,"Pending*",Orders!$N$4:$N$1000,"")
    Processing:        =COUNTUNIQUEIFS(Orders!$C$4:$C$1000,Orders!$B$4:$B$1000,$B12,Orders!$R$4:$R$1000,"Pending*",Orders!$N$4:$N$1000,"<>")
    Shipped:           =COUNTUNIQUEIFS(Orders!$C$4:$C$1000,Orders!$B$4:$B$1000,$B12,Orders!$R$4:$R$1000,"Shipped*")
    Delivered:         =COUNTUNIQUEIFS(Orders!$C$4:$C$1000,Orders!$B$4:$B$1000,$B12,Orders!$R$4:$R$1000,"Delivered*")
    Tracking Pending:  =COUNTUNIQUEIFS(Orders!$C$4:$C$1000,Orders!$B$4:$B$1000,$B12,Orders!$Q$4:$Q$1000,"")
    Total COGS (USD):  =SUMIF(Orders!$B$4:$B$1000,$B12,Orders!$P$4:$P$1000)
    Total Profit:      =D12-J12
    ```
    Counts are on **unique Receipt ID** (`COUNTUNIQUEIFS` against
    `Orders!$C`), not row count — a multi-line-item order must not be
    double-counted as two orders. `Total Net Sales` and `Total COGS` are
    plain `SUMIF`s since `Payment Received` (col L) and `Total Sourcing Cost`
    (col P) are each only ever populated on a receipt's first row. `Total
    Profit` is a plain subtraction of those two SUMIF results (not a third
    SUMIF over `Orders!Profit`) — mathematically identical, one fewer
    dependency.
  - **Currency handling (explicit user instruction, 2026-08-01): every
    dashboard figure is treated as USD, full stop.** `Total Sourcing Cost` is
    always entered in USD by the user regardless of what the supplier
    actually bills in, and `Total Net Sales`/`Total COGS`/`Total Profit` are
    never FX-converted even though `Payment Received` lands in the buyer's
    own payment currency (EUR/GBP/USD, etc.) per receipt. This project has no
    exchange-rate source, so these dashboard columns (like the pre-existing
    `Total Net Sales (approx.)`) are **approximate roll-ups that sum
    mixed-currency numbers as if they were all the same unit** — good enough
    for a rough profit pulse, not accounting-grade P&L. Real FX-converted
    figures would need a genuine currency-conversion data source, not a
    formula tweak.
  - A `TOTAL` row directly below the last account row: `=SUM(...)` over the
    account rows for every numeric column (now including `Total COGS`/`Total
    Profit`).
  - Two charts anchored below the table (`Net Sales by Account` — pie,
    domain `B<first>:B<last>` / series `D<first>:D<last>`; `Fulfillment
    Funnel by Account` — grouped column, domain `B<first>:B<last>` / series
    `E:E`,`F:F`,`G:G`,`H:H` each `<first>:<last>`) — built via `batch_update`
    `addChart` requests with explicit `domain`/`series` source ranges (the
    simplified `add_chart` tool only accepts one contiguous range, which
    doesn't fit this table's column layout — use raw `batch_update` for any
    chart edit here). **Both charts still only read columns B–I** — adding
    `Total COGS`/`Total Profit` at J/K didn't require touching either
    chart's ranges; a future COGS/Profit chart would need its own `addChart`
    request.

### Registering a new account (mandatory whenever a new Etsy account connects)

Per `CLAUDE.md`'s "Connecting a new account" step 5 — explicit user
instruction, 2026-08-01: every newly-connected account must be added here
immediately, before any orders are ever pulled for it, so the dashboard
tracks it from day one. Mechanics:

1. **Insert one row**, not overwrite — use `batch_update`'s
   `insertDimension` (`ROWS`) on the `Index` sheet, `startIndex` = the row
   directly above the current `TOTAL` row (i.e. push the new account row in
   just before `TOTAL`, not after it). Inserting (rather than appending past
   the end) makes Sheets auto-extend the `TOTAL` row's `SUM()` ranges and
   both charts' domain/series ranges to include the new row — no manual
   range-editing needed on the `TOTAL` formulas or the charts.
2. Write the account's display name into that new row's first cell, and
   copy the **nine formulas** (`Total Orders` through `Total Profit`,
   columns C–K) from an existing account row into the rest of the new row
   (same pattern as above, just pointing at the new row's own `$B` cell).
3. Also append the same account name to `Index!B3:B5`'s `Accounts`
   reference list (extend by one row below the last existing entry).
4. This registers the account for tracking only — it does not pull any
   orders. Do Workflow 1 below (or wait for the user to ask) to actually
   populate that account's rows on the `Orders` tab.

## Workflow 1 — Pull orders from Etsy and save/update the sheet

Triggered by "pull orders from `<account>` and save to the sheet", "sync
`<account>`'s orders to the sheet", "update the order sheet", or equivalent.

1. **Resolve scope.** Default to open/unshipped orders plus anything created
   in roughly the last 90 days, unless the user gives an explicit date range
   or says "all orders" / "pura order history" (then page through the full
   history — mind the 5 req/s rate limit, batch where possible).
2. **Pull receipts.** `get_shop_receipts` for the target `account`, paged as
   needed. For each receipt, pull line items via
   `get_receipt_transactions_by_receipt` (or use the `transactions` array
   already embedded in `get_shop_receipts`'s response, which carries the
   same `is_digital` flag).
3. **Filter out digital line items** per the STRICT rule above — drop any
   transaction with `is_digital: true`; drop the whole receipt if every
   transaction on it is digital. Do this before writing anything, not as a
   cleanup pass afterward.
4. **Compute the true net earning** for each remaining receipt per "Payment
   Received — true net earning, not `amount_net`" above (ledger-derived, not
   `get_payment_by_receipt`'s `amount_net` alone) — needed for the `Payment
   Received` column. Not the receipt's gross `grandtotal` either.
5. **Read the current sheet state.** `get_sheet_data` on the `Orders` tab
   (header is row 3, data starts row 4) to see which `(Account, Receipt ID,
   Listing ID)` combinations already have a row, and their current values.
6. **Diff and write, per physical line item:**
   - **No existing row** → append a new row with the full column set from
     the schema above (one row per transaction, `Payment Received` only on
     that receipt's first row, `Listing ID` written as a `HYPERLINK(...)`
     formula per the schema note above).
   - **Existing row, values changed** (status flipped to shipped, tracking
     now present, etc.) → update just the changed cells. Never touch the
     four manual fulfillment columns (Supplier, Order Placed?, Order ID,
     Total Sourcing Cost) on an automatic resync.
   - **Existing row, nothing changed** → skip it.
7. **Re-sort the full data range** (`A4:T<last row>`) chronologically
   ascending by `Order Date` — see "Sort order & dispatch-date highlight"
   above. Do this every time, even if nothing else changed.
8. **Report a short summary**: how many new rows added, how many existing
   rows updated (and roughly what changed), how many were already current,
   and how many digital line items/receipts were skipped by the filter.

This entire workflow is **local-adjacent bookkeeping against the user's own
sheet, not an Etsy write** — proceed without a confirmation prompt, per the
user's explicit instruction that this should just happen when asked. Still
report what was written so it's not a silent black box.

## Workflow 2 — Push a sheet edit back to Etsy

Triggered by "update Etsy from the sheet", "push this tracking number to
Etsy", "sheet mein jo change kiya hai wo Etsy pe bhi kr do", or the user
pointing at a specific row/receipt that now has new tracking/status info
filled in that Etsy doesn't have yet.

1. Identify the target row(s) — either the specific one the user names, or
   diff the sheet's `Tracking Number`/`Fulfillment Status` columns against
   each order's live Etsy state (`get_shop_receipt`) to find rows that are
   ahead of Etsy. Remember a receipt may span multiple rows (one per line
   item) — a shipment/status push applies to the whole receipt, so update
   every row sharing that `Receipt ID`.
2. Map the change to the correct write tool:
   - `Tracking Number` newly filled in → `create_receipt_shipment`.
   - A status change with no tracking involved → `update_shop_receipt`.
3. **This is a live Etsy write — the full `etsy-ship-assistant` confirmation
   discipline applies, no exceptions just because the source was a
   spreadsheet cell:**
   - Show the receipt id, buyer, item(s), and the exact **old status → new
     value** being pushed.
   - If it's `create_receipt_shipment`, explicitly flag that **this emails
     the buyer automatically**.
   - Get an explicit **"yes/haan/confirm"** for that specific order before
     calling the tool.
   - One order at a time — never batch-confirm multiple pushes on one yes.
4. After the Etsy write succeeds, update `Fulfillment Status` (and
   `Tracking Number` if new) on every row of that receipt — same as
   Workflow 1's write step, no separate confirmation needed for that part.

## Conversational status updates — single-order, mid-conversation triggers

Explicit user instruction, 2026-08-01: the user will often report an
order's fulfillment progress in plain conversation, not by invoking a bulk
pull or push — these need to update the sheet **immediately**, in the same
turn, without waiting for a "sync the sheet" request. Three distinct
triggers, each with its own confirmation rule:

1. **"I've processed this order"** (`"maine ye order process kar diya"`,
   `"[order] process ho gaya"`, or the user names a supplier/order id for a
   specific order) — the order has been placed with the supplier, no
   tracking yet.
   - Resolve the target row(s) from whatever the user gave (Receipt ID,
     buyer name, listing title — cross-reference `Orders` to find it if
     they didn't give the exact Receipt ID).
   - Set `Order Placed?` = `Yes` on every row sharing that Receipt ID. If
     the user also gave a supplier name or their own order reference,
     fill `Supplier`/`Order ID` too.
   - **Sheet-only bookkeeping — no confirmation needed**, same reasoning as
     Workflow 1. Just confirm back what was updated in one line.
   - This is exactly what flips the dashboard's count for that order from
     `Pending` into `Processing` (see the `Processing` formula in the
     Dashboard section above — it reads this same `Order Placed?` column).
2. **"Here's the tracking number"** with no mention of Etsy (`"iska
   tracking number ye hai"`, `"tracking add kr do"`) — the user is telling
   you to record it, not necessarily push it live yet.
   - Update `Tracking Number` and `Fulfillment Status` (→ `Shipped`) on
     every row of that receipt in the `Orders` tab.
   - **Sheet-only — no confirmation needed.** Don't call
     `create_receipt_shipment` unless the user's message actually asks for
     Etsy to be updated too (that's trigger 3) — recording a tracking
     number in the sheet and pushing it live to Etsy (which emails the
     buyer) are different-weight actions, don't conflate them.
3. **"Here's the tracking, update Etsy too"** (`"ye tracking Etsy pe bhi
   update kr do"`, `"isko etsy pe daal do"`, or any phrasing that asks for
   both) — this is Workflow 2 (a real, buyer-facing Etsy write via
   `create_receipt_shipment`):
   - Run the full per-order confirmation loop from Workflow 2 (old → new,
     flag the automatic buyer email, explicit yes) before calling the tool.
   - **The instant that Etsy write succeeds**, in the same turn, update
     `Tracking Number` + `Fulfillment Status` on every row of that receipt
     in the sheet. This is the sync guarantee the user asked for — an Etsy
     tracking push must never be left unmirrored in the sheet, even for one
     turn.

## Customer-management angle

Etsy's Open API has no standalone "customer" resource — `get_user`/
`get_user_address`/`get_user_addresses` exist but are **not currently usable
on this account's token** (missing `email_r`/`address_r`/`address_w` scopes —
see the "User Management" section of the main tool map in `CLAUDE.md`). Until
those scopes are granted, buyer identity/history lives entirely in the
`Orders` tab's per-order rows (`Customer Name`, `Shipping Address (full)`,
and order history visible by filtering/searching the sheet for that name)
plus whatever `get_shop_reviews`/`get_reviews_by_listing` surface about buyer
sentiment.
For structured repeat-buyer/bundle analysis (not just "list this buyer's
orders"), hand off to `etsy-repeat-buyer-radar` — that skill's grouping logic
is the right tool for pattern-finding, this sheet is the right tool for
per-order record-keeping.

## Tool inventory this workflow draws on

**Etsy MCP — order data (read):** `get_shop_receipts`, `get_shop_receipt`,
`get_receipt_transactions_by_receipt`, `get_receipt_transactions_by_listing`,
`get_receipt_transactions_by_shop`, `get_receipt_transaction`.
**Etsy MCP — order writes (confirm first, per Workflow 2):**
`update_shop_receipt`, `create_receipt_shipment`.
**Etsy MCP — supporting reads:** `get_payment_by_receipt` (**required on
every pull**, not optional — this is where the `Payment Received`/net-of-fees
column comes from), `get_processing_profiles`, `get_shop_shipping_profile`
(ship-by date math, same as `etsy-ship-assistant`), `get_shipping_carriers`
(valid carrier codes before any `create_receipt_shipment`).
**Google Sheets MCP:** `list_sheets`, `get_sheet_data`,
`get_multiple_sheet_data`, `find_in_spreadsheet` (reads); `add_rows`,
`add_columns`, `update_cells`, `batch_update_cells`, `batch_update` (writes to
the sheet itself — no confirmation needed per Workflow 1 above);
`get_multiple_spreadsheet_summary`/`list_spreadsheets`/`search_spreadsheets`
(discovery, rarely needed once the spreadsheet ID above is known).

## Environment note — the `google-sheets` MCP server

Runs via `uvx --with "mcp<2" mcp-google-sheets@latest` (see `.mcp.json`) —
the `mcp<2` pin is required, not optional: `mcp-google-sheets` imports
`mcp.server.fastmcp`, which was removed in `mcp` SDK 2.0.0, so an unpinned
`uvx` install resolves a broken combination
(`ModuleNotFoundError: No module named 'mcp.server.fastmcp'`). Auth is OAuth
via `CREDENTIALS_PATH`/`TOKEN_PATH` env vars pointing at `sheets-oauth.json`/
`sheets-token.json` in the project root (gitignored) — these were copied
from the sibling SEO project's already-authorized Google account, so no
fresh browser consent flow is needed unless that token is ever revoked.
