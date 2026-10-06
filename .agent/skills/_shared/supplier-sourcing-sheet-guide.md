# Supplier & Sourcing Sheet — shared schema & mechanics

Referenced by `etsy-supplier-sourcing` (the skill that owns this workflow).
This is a **live Google Sheet**, separate from the "Etsy Order" sheet
(`order-management-sheet-guide.md`) — different spreadsheet, different
purpose (sourcing/research, not order fulfillment), reached through the same
`google-sheets` MCP server.

## The spreadsheet

- **Title:** "Etsy Ecommerce"
- **Spreadsheet ID:** `1AiIjKdxvsne4giYdT6mc266xr8Ly87e2q7SHiU_HpNA`
- **URL:** https://docs.google.com/spreadsheets/d/1AiIjKdxvsne4giYdT6mc266xr8Ly87e2q7SHiU_HpNA
- **Tabs in scope for this skill** (added 2026-08-01):
  - **`Suppliers`** (sheet ID `162848423`) — every sourcing option
    (AliExpress/Merchize/other) for products this shop lists, with cost and
    quality stats.
  - **`Shops`** (sheet ID `1207843181`) — freeform reference list of
    competitor/inspiration Etsy shops.
  - **`Product Research List`** (sheet ID `566615175`) — product/listing
    URLs worth considering, with basic cost/price research.
- **Tabs NOT in scope** — `Content`, `Resources`, `Prices by Products`,
  `Sheet3` exist in the same spreadsheet but are unrelated scratch/reference
  tabs. Don't write to them under this skill unless the user separately asks
  about one by name.

## `Suppliers` tab — schema

Header row 1, columns A–L (as of 2026-08-01 — reconfirm with
`get_sheet_data`/`include_grid_data` before assuming this hasn't drifted):

| Col | Header | Type | Notes |
|---|---|---|---|
| A | Supplier Link | hyperlinked URL | the actual product page (AliExpress item URL, Merchize product URL, etc.) |
| B | Material | freeform text | e.g. `"100% Cotton"`, `"50/50"` |
| C | Product Price | currency number | base item price |
| D | USA Shipping | currency number | shipping cost to a US address (often `$0.00` when included in price) |
| E | Total Cost | **formula**, `=C{row}+D{row}` | **never hardcode this value** — always write it as a formula referencing that row's own C/D cells, matching every existing row |
| F | Total Sold | freeform text | e.g. `"203"`, `"5000+"`, `"2000+"` — mirrors AliExpress's own "orders" display convention (rounded/bucketed for high-volume items), keep that convention rather than inventing precise numbers |
| G | Reviews / Avg | freeform text, pattern `"<count> / <avg_rating>"` | e.g. `"27 / 4.6"`, `"747 / 4.8"` — count first, then average star rating, separated by `" / "` |
| H | Type | **dropdown**, `ONE_OF_LIST` strict | `Select`, `Custom Print`, `Custom Print & Embroidery`, `DTG`, `Embroidery`, `DTF & DTG` |
| I | Product Type | **dropdown**, `ONE_OF_LIST` strict | `Select`, `Hoodie`, `Tshirt`, `Sweatshirt` |
| J | Supplier | **dropdown**, `ONE_OF_LIST` strict | `Select`, `Aliexpress`, `Merchize`, `Other` |
| K | Best for | freeform text | why this supplier/link is good (quality, price point, etc.) |
| L | Used For | freeform text | which listings/niches it's actually being used for — often blank until it's actually in use |

**The three dropdown columns (H/I/J) are `strict: true`** — writing a value
outside the allowed list will be rejected by Sheets. If a new supplier
doesn't cleanly fit an existing `Type`/`Product Type` option (e.g. a
product type that isn't Hoodie/Tshirt/Sweatshirt), **ask the user** whether
to use the closest existing option or whether the dropdown list itself
should be extended (extending it is a `setDataValidation` change affecting
every row, past and future — confirm before doing that, it's not pure
per-row bookkeeping).

There's typically a basic filter active on this tab (view-only, doesn't
affect writes) — don't worry about it when appending rows.

## Behavior 1 — "give me the best supplier for `<product>`"

Read-only — no confirmation needed, just report.

1. `get_sheet_data` the full `Suppliers` tab.
2. Filter to rows matching the requested `Product Type` (and `Type` too, if
   the user specified a technique like "embroidery" or "custom print").
3. Rank the filtered candidates using judgment across three signals, in
   this priority order:
   - **Reviews / Avg** — parse the average rating (the number after `/`);
     higher is better, and treat a very low review *count* as a caveat even
     if the average looks good (e.g. `3 / 5.0` is weaker evidence than
     `747 / 4.8`).
   - **Total Sold** — parse the magnitude (`"5000+"` > `"2000+"` >
     `"700+"` > a plain number); higher suggests a more proven/reliable
     listing.
   - **Total Cost** — lower is better, all else being roughly equal; don't
     let a slightly cheaper option override a meaningfully better
     rating/volume.
4. Present the top 1–3 candidates as a table with the actual columns behind
   the recommendation — **Supplier Link, Supplier, Material, Total Cost,
   Total Sold, Reviews/Avg, Best for/Used For** — so the user sees the real
   stats, not just a name. State briefly why the top pick won over the
   others.

## Behavior 2 — "add this supplier"

Local bookkeeping (a research/sourcing sheet, not a live Etsy write) — no
formal confirmation gate needed to write the row, but always report back
the full row that was written so the user can see it landed correctly (same
transparency habit as everywhere else in this project, even without a
formal confirm-before-write requirement here).

1. **Determine `Supplier`** (`Aliexpress`/`Merchize`/`Other`) from the URL
   domain if the user didn't say it outright.
2. **If it's an AliExpress link** — try to get live stats (Product Price,
   Material if listed, Total Sold, Reviews count/avg) from the actual
   listing page:
   - Try `WebFetch` on the URL first.
   - AliExpress product pages are a heavily JS-rendered SPA — price, sold
     count, and rating are usually populated client-side and **will often
     not appear in a plain `WebFetch`'s fetched content.** If the fetch
     doesn't yield usable stats, fall back to the `Claude Browser` tool
     (`navigate` to the URL, then `read_page`/`get_page_text`) to read the
     fully-rendered page instead.
   - **If stats still can't be found this way, don't guess or leave the row
     silently incomplete** — tell the user exactly which fields couldn't be
     pulled (e.g. "couldn't find Total Sold or the rating on this page")
     and either ask them for those values directly, or ask whether they'd
     rather add it manually themselves — per the user's own instruction
     (2026-08-01): *"aliexpress k stats tum live listing sy dekh lena, na
     mily to mjsy poch lena ya kehna k manual add kron"*.
3. **If it's a Merchize (or other non-AliExpress) link** — don't attempt to
   scrape "Total Sold"/"Reviews" stats, those are AliExpress-specific
   concepts that don't exist on a Merchize catalog page. Just capture
   Product Price/Material/shipping if visible on the page; ask the user for
   anything that isn't.
4. **Always use the validated dropdown values** for `Type`/`Product
   Type`/`Supplier` (see the strict list above) — never write free text
   into those three columns. If unsure which option fits, ask.
5. **Write `Total Cost` as the formula** `=C{row}+D{row}`, referencing that
   new row's own Product Price/USA Shipping cells — not a hardcoded number.
6. Append the new row at the end of the tab's current data (check
   `get_sheet_data` first to find the next empty row — don't assume a fixed
   row number).

## `Shops` tab

**No fixed header row, no dropdown validation** — an intentionally loose
reference list of competitor/inspiration Etsy shop URLs, with occasional
freeform notes (category, price point, sales volume) in the columns after
the URL. When asked to save a shop:

1. Append the shop URL to column A of the next empty row.
2. If the user gives notes (or you looked at the shop and have something
   worth recording — category, typical price point, sales volume), put
   that as plain text in column B of the same row.
3. Don't invent a rigid schema here or try to "clean up" the existing rows'
   inconsistent column usage — this tab is deliberately loose.

## `Product Research List` tab

Header row 1: `product link | product name | product cost | shipping cost
| Average price`. Columns beyond E are used inconsistently in the existing
data (a `Done`/`done` status marker, a linked Etsy `listing_id` once the
product actually got published, and freeform keyword/tag words scattered
across further columns) — **don't try to normalize or reorganize these**,
and don't overwrite anything already present past column E.

When asked to save a product or listing URL here:

1. Append to the next empty row.
2. Fill in whatever of `product name`/`product cost`/`shipping cost`/
   `Average price` the user gives you directly, or that's clearly visible
   on the linked page — don't guess or estimate values you can't see.
3. Leave anything you don't have real data for blank rather than
   fabricating a number.

## Tool inventory this skill draws on

**Google Sheets MCP:** `get_sheet_data` (reads, use `include_grid_data:
true` when you need to re-verify a dropdown's allowed values or a formula
column), `update_cells`, `add_rows`, `batch_update` (writes — same server as
the Etsy Order sheet, see `.mcp.json`).
**Live AliExpress stat lookup:** `WebFetch` first, `Claude Browser`
(`mcp__Claude_Browser__navigate` + `read_page`/`get_page_text`) as the
fallback when the page is JS-rendered and `WebFetch` comes back empty of
useful stats.
