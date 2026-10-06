---
name: etsy-supplier-sourcing
description: Manages the shop's "Etsy Ecommerce" Google Sheet's sourcing data — the Suppliers tab (every AliExpress/Merchize/other sourcing option with cost and quality stats), the Shops tab (competitor/inspiration Etsy shop URLs), and the Product Research List tab (candidate product/listing URLs worth considering). Recommends the best supplier for a product type by ranking real stats (rating, total sold, cost), and adds new suppliers using the sheet's validated dropdowns — pulling AliExpress stats from the live listing when possible. Trigger this whenever the user says things like "best supplier for [product]", "supplier do mjhe [product] k liye", "which supplier should I use for [hoodie/tshirt/sweatshirt]", "add this supplier", "ye supplier add kr do", "save this shop", "ye shop save kr do", "add this to product research", "is listing ko research list me daal do", or any request to look up, recommend, or record sourcing/supplier/competitor-shop/product-research data in this specific spreadsheet.
---

# Etsy Supplier Sourcing

Manages the "Etsy Ecommerce" Google Sheet's sourcing side — a different
spreadsheet from the "Etsy Order" sheet (`etsy-order-sheet-sync` owns that
one; this skill never touches it). Full schema, dropdown values, ranking
logic, and the AliExpress live-stat lookup mechanics live in
**`../_shared/supplier-sourcing-sheet-guide.md`** — read that before doing
any real lookup or write, this file is the trigger/entry-point summary.

## The spreadsheet

- Title **"Etsy Ecommerce"**, spreadsheet ID
  `1AiIjKdxvsne4giYdT6mc266xr8Ly87e2q7SHiU_HpNA`.
- Three tabs this skill manages: **`Suppliers`**, **`Shops`**,
  **`Product Research List`**. The spreadsheet has other tabs (`Content`,
  `Resources`, `Prices by Products`, `Sheet3`) that are out of scope — don't
  touch them under this skill.
- Reached via the `google-sheets` MCP server, same as `etsy-order-sheet-sync`.

## Three behaviors

1. **"Best supplier for `<product>`"** — read-only, no confirmation needed.
   Filter the `Suppliers` tab by `Product Type`(/`Type`), rank by rating →
   total sold → cost, present the top 1–3 with their real stats in a table.
2. **"Add this supplier"** — write to `Suppliers`, no formal confirmation
   gate (local sourcing bookkeeping) but always report the full row back.
   Use the sheet's three **strict dropdown columns**
   (`Type`/`Product Type`/`Supplier`) — never freehand those. For an
   AliExpress link, try to pull live Product Price/Material/Total
   Sold/Reviews from the actual listing page (`WebFetch`, then the
   `Claude Browser` tool if the page is JS-rendered and the fetch comes up
   empty) — if stats still can't be found, **ask the user** for them or
   whether they'll add it manually, don't guess. `Total Cost` is always a
   formula (`=C{row}+D{row}`), never a hardcoded number.
3. **"Save this shop" / "Add to product research list"** — simple
   append-a-row to `Shops` or `Product Research List`. Both are loosely
   structured (see the shared guide) — fill in what you're given or can see
   on the page, leave the rest blank rather than guessing.

## Report structure

**Best-supplier recommendation:**
```
Best supplier(s) for <product type>:

| Supplier Link | Supplier | Material | Total Cost | Total Sold | Reviews/Avg | Best for |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

Top pick: <link> — <one-line reason: rating/volume/cost tradeoff>
```

**After adding a supplier:**
```
Added to Suppliers tab:

| Field | Value |
|---|---|
| Supplier Link | ... |
| Material | ... |
| Product Price | ... |
| USA Shipping | ... |
| Total Cost | =C{row}+D{row} |
| Total Sold | ... |
| Reviews / Avg | ... |
| Type | ... |
| Product Type | ... |
| Supplier | ... |
| Best for | ... |
| Used For | ... |

<note any field that couldn't be found live and had to be asked about or left blank>
```

## Handoffs

- This skill only manages sourcing/research data — it never touches Etsy
  itself (no listing creation, no order data). For actually creating a
  listing from a sourced product, hand off to `etsy-create-listing`.
- The "Etsy Order" sheet (orders/fulfillment) is a completely separate
  spreadsheet owned by `etsy-order-sheet-sync` — don't cross-write between
  the two.
