---
name: etsy-order-sheet-sync
description: Keeps the shop's "Etsy Order" Google Sheet (the cross-account order & customer record) in sync with live Etsy order data — pulls orders from a named account and saves them to the sheet (updating any order that's already there instead of duplicating it), and pushes sheet edits like a new tracking number back to Etsy when asked. Also handles ad hoc, single-order status updates said mid-conversation, not just bulk pulls/pushes. Trigger this whenever the user says things like "pull orders from [account] and save to the sheet", "sync my orders to the sheet", "update the order sheet", "add today's orders to the spreadsheet", "check the sheet for orders that aren't updated yet", "push this tracking number to Etsy from the sheet", "sheet mein jo update kiya hai wo Etsy pe bhi kr do", "[account] se order nikal k sheet me save kr do", "maine ye order process kar diya", "is order ka tracking number ye hai", "ye tracking Etsy pe bhi update kr do", "mark this order as processed/shipped", or any request that moves order data between Etsy and this specific Google Sheet in either direction, or updates one order's fulfillment stage in the sheet. Also trigger for customer-lookup questions answerable from the sheet's order history ("has this buyer ordered before", "show me [buyer]'s orders").
---

# Etsy Order Sheet Sync

Keeps one Google Sheet — "Etsy Order" — as the durable, cross-account record
of every order and its buyer, synced from live Etsy data on request, with
edits able to flow back to Etsy when the user makes them in the sheet. All
schema detail, the exact column layout, and the full step-by-step mechanics
for both directions live in
**`../_shared/order-management-sheet-guide.md`** — read that before doing
any real pull or push, this file is the trigger/entry-point summary, not a
duplicate of the mechanics.

## The sheet

- Title **"Etsy Order"**, spreadsheet ID `1sKw8DjlHPFxHtlR_0r4JJtWI1KhoSW7EUxXpPMDTEE4`.
- `Orders` tab = one row per **line item**, keyed by **(Account, Receipt ID,
  Listing ID)** — never Receipt ID alone, since this sheet spans every
  connected account and receipt IDs are only unique per-shop; and never
  `(Account, Receipt ID)` alone, since a multi-item order produces multiple
  rows. Header is on row 3 (row 1 is section labels, row 2 is a spacer).
- **Physical orders only — STRICT.** Digital/download line items
  (`is_digital: true` on the transaction) are never written to this sheet,
  on any pull, ever. Full filter logic in the shared guide below.
- **`Account` column is plain text** (e.g. `Itrat`) — no dropdown/data
  validation, even though `Index!B3:B5` has a reference list of account
  names. This was explicitly removed per user instruction; don't re-add it.
- **`All Listings` tab** — a third tab tracking every listing (not order)
  this system has created or knows about, across every account. On every
  new listing create, add a row here in the same turn, regardless of which
  account. Full schema (Listing ID/Title/Account/Type/Status/Price/
  Quantity/Product ID/Source/Created Date) in the shared guide's
  "`All Listings` tab" section.
- Reached via the `google-sheets` MCP server (`list_sheets`, `get_sheet_data`,
  `add_rows`, `update_cells`, `batch_update_cells`, `find_in_spreadsheet`,
  etc.) — a different server from `etsy`/`etsy-docs`, see `.mcp.json`.

## Two directions, two different confirmation rules

**Etsy → Sheet (pull and save/update):** this is local-adjacent bookkeeping
against the user's own spreadsheet, not a live Etsy write — do it
automatically when asked, no per-order confirmation needed, same reasoning
CLAUDE.md already applies to `data/listings/`, `data/tags-database.json`,
etc. Just report a short summary of what was added/updated afterward.

**Sheet → Etsy (push an edit back):** this calls real write tools
(`update_shop_receipt`, `create_receipt_shipment`) against a live,
mostly-irreversible shop — `create_receipt_shipment` **emails the buyer**.
This follows the exact same per-order confirmation discipline as
**`etsy-ship-assistant`**: show old → new, flag the buyer-email side effect,
get an explicit yes for that specific order, never batch-confirm, one order
at a time. The sheet is just where the instruction came from — it does not
soften the safety rule at all.

## Workflow summary

1. **Pull request** ("get orders from `<account>`, save to sheet"): resolve
   scope (default: open orders + last ~90 days, or the range/"all orders"
   the user gives) → `get_shop_receipts` + `get_receipt_transactions_by_receipt`
   per order → read the `Orders` tab's current rows → for each order, add a
   new row if `(Account, Receipt ID)` isn't there yet, or update just the
   changed cells if it is, or skip if nothing changed. Never touch the
   `Notes` column automatically. Full column schema and exact steps: the
   shared guide.
2. **Push request** ("update Etsy from the sheet", or a specific row the
   user points at): identify what changed in the sheet vs. Etsy's live
   state, map to `update_shop_receipt` or `create_receipt_shipment`, run the
   full per-order confirmation loop above, then sync that row's status back
   after the write succeeds.
3. **Customer lookup** ("has `<buyer>` ordered before"): search/filter the
   `Orders` tab by buyer name across all accounts — this sheet is the
   closest thing this system has to a customer record, since Etsy's API
   exposes no standalone customer object (see the shared guide's
   "Customer-management angle"). For pattern-level analysis (repeat-buyer
   cohorts, bundle candidates) hand off to `etsy-repeat-buyer-radar` instead
   of trying to do that analysis here.
4. **Ad hoc single-order status update** — the user says, mid-conversation,
   that they've processed/shipped a specific order. This doesn't require
   invoking a bulk pull or push; three distinct triggers (explicit user
   instruction, 2026-08-01 — full mechanics in the shared guide's
   "Conversational status updates" section):
   - **"I processed this order"** (order placed with the supplier, no
     tracking yet) → find that order's row(s) in `Orders` by whatever the
     user gave (receipt id, buyer name, listing) and set `Order Placed?` =
     `Yes` — sheet-only, no confirmation needed. This is what moves the
     dashboard's count from `Pending` into `Processing`.
   - **"Here's the tracking number"** (sheet only, Etsy not mentioned) →
     update that order's `Tracking Number` and `Fulfillment Status` (→
     `Shipped`) in the sheet — sheet-only, no confirmation needed.
   - **"Here's the tracking, update Etsy too"** → this is a live Etsy write
     (`create_receipt_shipment`), so run the full push confirmation loop
     (step 2 above) first; **the moment that Etsy write succeeds**, update
     the same order's `Tracking Number`/`Fulfillment Status` in the sheet in
     the same turn — never leave a successful Etsy tracking push unmirrored
     in the sheet, that's the whole point of this trigger.

## Report structure

**After a pull/save:**
```
Synced <account> orders to the Etsy Order sheet:
  + <N> new orders added
  ~ <N> existing orders updated (<what changed, briefly>)
  = <N> already current, skipped
```

**Before/after each push (mirrors etsy-ship-assistant's per-order block):**
```
--- Pushing Receipt <id> to Etsy ---
Proposed Action:
  Receipt <id> — <buyer>
  <field>: <old> → <new>
  ⚠️ create_receipt_shipment will EMAIL the buyer automatically.   (only if applicable)

Confirmation Required: reply "yes" to push this, or "skip".

Result: ✅ pushed and sheet row updated. / ⏭️ skipped. / ❌ <error>.
```

## Handoffs

- After `etsy-ship-assistant` confirms and submits a shipment, offer to sync
  that order's row in the sheet too (tracking number, shipped status) so the
  sheet doesn't go stale between explicit sync requests.
- `etsy-morning-briefing` can point at this sheet as the durable order log
  behind its daily digest, but doesn't need to sync it itself.
- Bulk pattern analysis across orders (repeat buyers, bundles) belongs to
  `etsy-repeat-buyer-radar`, not this skill.
