# What a NEW listing needs: the single checklist

One page answering "what must exist before this listing can be created?". The gates themselves are in `listing-gates.md`; the field rules in
`etsy-seo-standards.md` (Listing Completeness Gate). Items marked **YOU** come from the owner; **SYSTEM** are produced/looked up by the agent;
**ETSY** are hard API requirements (the call fails without them).

## 1. Always (every listing, every account)

| Need | From | Detail |
|---|---|---|
| Which account | YOU | An **active** account (`list_accounts`); deactivated accounts are blocked. `abbas_etsy` takes physical products only |
| Physical or digital | YOU | Sets `type`; digital also needs the downloadable file |
| **Source of the product** (`sources`) | YOU | A supplier link (AliExpress/Merchize/Printify...) or explicit plain text ("in-house DTG print"). **Hard blocker: no draft without it** |
| **Images** | YOU | At least 1, target 8-10 (hero first; size chart is always rank 2 when it exists; clothing requires a size chart). Put them in the product's staging folder; the agent renames, orders, adds alt text and uploads them itself |
| Video | YOU (optional) | One video in the staging folder is uploaded automatically |
| Price | YOU | The owner decides the price; the agent only reports the market's list and actual sale prices |
| Personalized? | YOU | Yes/no, and what the buyer enters (name/date/photo...). Never inherited from another listing |
| Variants (sizes/colors/...) | YOU | Each option with its price and quantity, if any |
| Title, 13 tags, description | SYSTEM | Rank-first research (`node scripts/keyword-stats.mjs`), tag slot model, Copy QA Gate, 135-140 character title, DELIVERY TIME FRAME block (computed from the real profiles) |
| `taxonomy_id` | SYSTEM | Taken from real reference listings, never guessed |
| `materials`, `styles` (max 2, **create-time only**) | SYSTEM + YOU | Materials from the spec; styles from the matched aesthetic |
| Shop section, return policy | SYSTEM | Picked from the account's existing ones (or "none") |
| Shipping profile + processing profile (`readiness_state_id`) | SYSTEM | Existing profile of the account; jewelry uses the shared jewelry profile |
| `who_made` + production partner | SYSTEM | `get_shop_production_partners` first: any partner on file -> `someone_else` + that partner id; jewelry always |
| AI-art disclosure | YOU | If the artwork itself is AI-generated it must be disclosed in the description |

## 2. By product type

| Type | Extra needs |
|---|---|
| **Jewelry** (`Add Product/Jewelry Products/<category>/<aliexpress id>/`) | Staging folder with the images; the AliExpress URL (the agent fills BASIC INFO and PRODUCT ANALYSIS itself); the agent matches the featured image to a saved aesthetic and **stops to report it**; then the owner gives 3-5 real Etsy reference listing ids/URLs in that style; size/dimension must appear in the description; shared "Jewelry Shipping" profile (3-5 day processing, 10-15 day transit, US free / rest $5); account needs a production partner |
| **Clothing / apparel** | Size chart image; sizes x colors with price/quantity; `update_listing_inventory` for the variants |
| **AliExpress / dropship** | `product-details.txt` in `Add Product/AliExpress/<product>/` (URL, variations, pricing, personalization, materials); `secondary_cost` $5 on its shipping profile |
| **Merchize** | The Merchize SKU/pricing sheet **and** the markup confirmed |
| **Digital download** | The deliverable file (>= 1) attached with `upload_listing_file`; not allowed on `abbas_etsy` |
| **Personalized** | `personalization_questions` (text <= 45 chars, instructions <= 120 chars, no instructions on dropdowns, upload `max_allowed_files` >= 2) |

## 3. Account prerequisites (once per shop)

Etsy payments onboarded, a shipping profile, a processing profile, a return policy (also "no returns" counts), at least one production partner for any
non-handmade listing (added by the owner in Shop Manager; there is **no API** for it), and shop sections. `etsy-shop-onboarding` checks and builds these.

## 4. Etsy's own hard requirements (the call fails otherwise)

| Rule | Error you would see |
|---|---|
| `readiness_state_id` on physical listings | "A readiness_state_id is required for physical listings." |
| `who_made: someone_else` needs a declared production partner | opaque HTTP 400 |
| Create-time `quantity` <= 999 | opaque HTTP 400 |
| `styles` can only be set at creation | silently lost if forgotten |
| At least 1 image before publishing; digital needs a file | draft cannot be activated |
| Prices are decimals, tags <= 20 chars (letters, numbers, spaces, `-`, `'`), title <= 140, `% : & +` once each | field-level rejections |

## 5. Branded products

If the concept contains a franchise, character, brand or celebrity name or artwork, the agent asks **once**: "list it anyway?" Your yes is final
for that product (CLAUDE.md). The risk (frozen listing, suspension) is stated in that one question.
