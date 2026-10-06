# "Ready Products" Google Sheet — jewelry status tracker

Referenced by `etsy-create-listing` and any ad-hoc jewelry create/publish flow
that touches a product staged in `Add Product/Jewelry Products/`. This is a
**Google Sheet**, reached through the `google-sheets` MCP server — not a
local file, but the same "always sync, no confirmation needed" bookkeeping
discipline as this project's local data stores (`data/listings/`,
`data/product-registry.json`, `data/tags-database.json`).

## Where it lives

- Spreadsheet ID: `1AiIjKdxvsne4giYdT6mc266xr8Ly87e2q7SHiU_HpNA`
- Tab: `Ready Products`
- This is a **different spreadsheet** from the "Etsy Order" sheet
  (`1sKw8DjlHPFxHtlR_0r4JJtWI1KhoSW7EUxXpPMDTEE4`, see
  `order-management-sheet-guide.md`) — don't confuse the two. The "Etsy
  Order" sheet tracks orders/customers across every account; this sheet
  tracks jewelry product staging/publish status only.

## Schema

Two columns, one header row:

| Column A | Column B |
|---|---|
| `Aliexpress ID` | `Status` |

- **`Aliexpress ID`**: the AliExpress product ID that also names that
  product's staging subfolder under `Add Product/Jewelry Products/<Category>/`
  (e.g. `3256806165172385`). This is the join key — always match rows by
  exact text match on this column, never by row position (rows aren't
  guaranteed to stay in folder-creation order as the sheet grows).
- **`Status`**: one of:
  - `Ready` — the product is staged (images + intake filled) but no Etsy
    write has happened yet for it. This is the sheet's own default value for
    a new row — **never write `Ready` yourself**, only the other two states
    below.
  - `Draft` — `create_draft_listing` succeeded for this product; the listing
    exists on Etsy but isn't live yet.
  - `Published` — the listing's `state` was set to `active` via
    `update_listing`.

## When to update it — every successful create/publish, no confirmation needed

Same reasoning as every other mandatory local-adjacent record in this
project: this is bookkeeping against the user's own spreadsheet, not a live
Etsy write, so it happens automatically in the same turn as the confirmed
Etsy write it followed — no separate ask.

1. **Right after `create_draft_listing` succeeds** for a product sourced from
   `Add Product/Jewelry Products/`: find its row by `Aliexpress ID` (read the
   sheet with `get_sheet_data`, locate the matching row), then
   `update_cells` that row's `Status` cell to `Draft`.
2. **Right after that same listing is published** (`update_listing` with
   `state: active`): update the same row's `Status` cell to `Published`.
3. If no row exists yet for that AliExpress ID (a product staged after the
   sheet was last reviewed), add one with `add_rows` rather than skipping the
   sync — `Aliexpress ID` in column A, `Status` (`Draft` or `Published`) in
   column B.
4. Mention briefly that the sheet was updated (a short aside is enough, same
   as the listings-record sync convention) — don't make it a whole report
   section.

## Why this exists

The user's own words: this answers "which jewelry products are ready to
publish, which are already done, which are still drafts" at a glance,
without opening every product folder or cross-referencing Etsy directly. The
`Ready`/`Draft`/`Published` progression mirrors the local folder-rename
convention (`<Aliexpress ID>` → `<Aliexpress ID> - created`, see
`Add Product/Jewelry Products/README.txt`) but lives in the shared sheet so
the status is visible without opening the filesystem.

## Blind spots — state plainly

- This sheet only reflects what this system has touched — a row stuck on
  `Ready` doesn't mean the product hasn't been worked on outside this system,
  it means no `create_draft_listing`/`update_listing` call has gone through
  this project's own flow for it yet.
- If a listing is later deactivated, deleted, or replaced (see CLAUDE.md's
  "a deactivated/replaced listing collapses to exactly one current record"
  standing rule), update this sheet's `Status` too rather than leaving a
  stale `Published` on a dead listing — the sheet should reflect what's
  genuinely live right now.
