# Listing gates — the one ordered checklist for every listing create / clone / rewrite

**Single source of truth for *which* mandatory gates exist and *in what order*.** It deliberately holds no rule text of
its own beyond one line each — every row points at the authoritative section (CLAUDE.md or a shared guide). The point is
that `etsy-create-listing`, `etsy-new-listing-copywriter`, `etsy-copy-listing`, `etsy-optimize-listing` and
`etsy-seasonal-keywords` stop carrying their own drifting copies: they link here, and a rule added to this list reaches
all five at once. (A 2026-10-07 audit found the skills had drifted from CLAUDE.md: no DELIVERY TIME FRAME step, no
jewelry branch, no `sources` hard-block, and `etsy-create-listing` still taught the retired tag-rotation alt-text rule.)

**Rule of precedence:** if a skill's own text disagrees with a row below or with CLAUDE.md, the row / CLAUDE.md wins —
and the skill is the thing to fix (report the contradiction to the user rather than silently choosing).

Not every gate applies to every flow. `C` = create/clone, `O` = optimize/rewrite existing, `S` = seasonal tag rotation.
`J` = jewelry only. `P` = physical only.

## A. Before research or drafting

| # | Gate | Flows | Authority |
|---|---|---|---|
| A1 | Read the shop's DNA (`data/shops/<account>/shop-dna.json`); if missing, say so once and offer `etsy-shop-onboarding` | C O S | `shop-dna-guide.md` |
| A2 | Account must be `active` (`list_accounts`); a deactivated account is blocked | C O S | CLAUDE.md "Account `status`" |
| A3 | Digital listing requested on `abbas_etsy` → stop, suggest `itrat_etsy`'s line (itrat is now deactivated too — flag that) | C | CLAUDE.md "no digital/download listings on abbas_etsy" |
| A4 | Product-registry lookup — is this design already on another account? Tell the user first | C | CLAUDE.md "every listing carries a product_id" |
| A5 | Tags-bank lookup by product type; **show saved tags to the user before researching** | C O | CLAUDE.md "tags database" (STRICT) |
| A6 | `sources` captured (link or explicit text) — **hard blocker, no draft without it** | C | CLAUDE.md "every product carries a sourcing record" |
| A7 | Trademark / franchise / brand / celebrity screen of concept, title, tags, description, **and the artwork itself**. On a hit: ask the user **once** — "list it anyway?". **Yes = proceed regardless of any scan/flag/risk result; no re-asking, no blocking later steps.** No = stop | C O S | CLAUDE.md "SUPERSEDES… screened for branded content" (ask-once override, 2026-10-07) |
| A8 | Open the featured image and verify every physical/construction claim against the photo | C O | CLAUDE.md "verify physical/construction claims" |
| A9 | `J`: match featured image to a saved aesthetic; stop and report; wait for competitor IDs; fill PRODUCT ANALYSIS | C O | CLAUDE.md "jewelry listings match the featured image…"; `etsy-aesthetic-styles-guide.md` |
| A10 | `P`: `get_shop_production_partners` first → decides `who_made` (`someone_else` + partner id if any partner exists; jewelry always) | C | CLAUDE.md `create_draft_listing` gotchas / jewelry rule |
| A11 | Personalization asked explicitly (yes/no + details) — never inherited | C | `etsy-create-listing` step 1c |

## B. Copy

| # | Gate | Flows | Authority |
|---|---|---|---|
| B1 | **Rank-first title**: top-20 lead-phrase pattern shown, then title built from it | C O S(title edits) | `rank-first-title-guide.md` |
| B2 | Reference listings pulled → report their **average price** and suggest a price **below** it | C O | CLAUDE.md jewelry rule step 3b (applies to every product type) |
| B3 | `taxonomy_id` comes from real reference listings, not memory | C | CLAUDE.md "taxonomy_id is always sourced from real reference listings" |
| B4 | Copy QA Gate (no em dashes, grade 5-7, no AI-tells, no `AliExpress/dropshipping` words, not copied) — before showing **and** before writing | C O S | `etsy-seo-standards.md` |
| B5 | `P`: **DELIVERY TIME FRAME** block, numbers computed from this listing's real processing + shipping profile; check the return policy doesn't contradict "no returns" | C O(description) | CLAUDE.md "every listing description carries a computed DELIVERY TIME FRAME block" |
| B6 | `J`: description states what the piece is **and** its size/dimensions (or "adjustable, fits most") | C O | CLAUDE.md jewelry rule |

## C. The write (every Etsy write is table-confirmed first)

| # | Gate | Flows | Authority |
|---|---|---|---|
| C1 | One markdown table of **every** field (`Field \| Value` on create, `Field \| Old \| New` on update); wait for explicit yes | C O S | CLAUDE.md "show the full write payload as a table" |
| C2 | `create_draft_listing`: `quantity` ≤ 999, `styles` (plural, create-only), `readiness_state_id` | C | CLAUDE.md `create_draft_listing` gotchas |
| C3 | Price changes after creation go through `update_listing_inventory` only; re-fetch to confirm | O | CLAUDE.md gotchas |
| C4 | `J`: shared jewelry shipping profile (3-5 day processing, 10-15 transit, US free / rest $5), generic profile name, `who_made: someone_else` | C | CLAUDE.md jewelry shipping rule |
| C5 | AliExpress/Merchize profiles: `secondary_cost` $5.00 everywhere | C | CLAUDE.md shipping standing rule |
| C0 | **Media is part of the create table** (every image in rank order + alt_text, video, size chart). One approval covers the draft **and** all image/video uploads — Claude uploads them itself from the staging folder, no per-file confirmation | C | CLAUDE.md "images and video are uploaded by Claude" |
| C6 | Images: rename gallery images (keyword + style, sequential); `alt_text` = renamed filename with hyphens→spaces; featured = product core name; size chart = `size chart`; **always pass `alt_text` and `rank` together** on in-place updates | C | `etsy-seo-standards.md` "Image alt text" |
| C7 | When an API call errors in a way the project didn't know: diagnose via `etsy-docs`, fix, **document it in the right place** | C O S | CLAUDE.md "when a live API call errors, fix it AND document it" |

## D. Bookkeeping — same turn as the Etsy write, no confirmation needed

| # | Gate | Authority |
|---|---|---|
| D1 | `data/listings/<account>/<listing_id>/record.json` created/updated with **every** live field (+ personalization, `product_id`, `sources`) | `listings-record-guide.md` |
| D2 | Every final tag saved to `data/tags-database.json` (no duplicates; increment instead) | `tags-database-guide.md` |
| D3 | `data/product-registry.json` entry + `sources` propagated to sibling listings of the same `product_id` | `product-registry-guide.md` |
| D4 | `data/title-patterns.json` updated if a new rank-first pattern was researched | `rank-first-title-guide.md` |
| D5 | `J`: "Ready Products" sheet row → `Draft` on create, `Published` on activate | `ready-products-sheet-guide.md` |
| D6 | `J`: rename the product's staging folder with the ` - created` suffix | CLAUDE.md "Add Product/Jewelry Products" |
| D7 | Replacement of a frozen/deactivated listing collapses to exactly one current record per `product_id` | CLAUDE.md "a deactivated/replaced listing collapses…" |

## E. After the write

| # | Gate | Authority |
|---|---|---|
| E1 | Final-report verification — re-read the live listing and check each field actually landed | `etsy-seo-standards.md` "Final-report verification" |
| E2 | Independent `etsy-listing-qa-check` on the new/changed listing | skill |
| E3 | If the shop is in its launch week, tick the matching `launch-plan.json` task | `launch-7day-playbook.md` |

## How skills use this file

Each listing skill carries one short block at the top of its workflow:

> **Mandatory gates:** run every gate in `../_shared/listing-gates.md` that applies to this flow (A→B→C→D→E). This skill's
> own steps below add flow-specific detail only; they never override a gate.

That is all a skill should say about these rules. If a skill needs to explain *how* it satisfies a gate in its own
flow (e.g. `etsy-copy-listing` explaining why price is never inherited), that stays in the skill — the gate list stays here.
