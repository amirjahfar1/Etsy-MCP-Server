# 7-day new-shop launch playbook

Used by `etsy-shop-onboarding` (new-shop mode, or when the user asks "launch plan / aaj ka task / day N").
Goal: a new shop goes from empty to **10 live, QA-clean listings + a complete storefront in 7 days**, with a
measurable baseline for week 2. This is a plan for *doing the work*, not a promise of sales — Etsy exposes no
traffic/conversion API (see CLAUDE.md "Known blind spots") and nobody can honestly guarantee ranking.

State lives in `data/shops/<account>/launch-plan.json` (see schema at the bottom). Every task is either
`owner: claude` (a skill does it, with the normal confirm-before-write gate on every Etsy write) or
`owner: user` (something only the shop owner can do in Shop Manager / on their own accounts — Etsy has no API for it).
Claude never marks a `user` task done by itself; it asks.

Pacing: if a day's tasks aren't finished, the plan **slides** (Day 3 becomes "next session"), it doesn't silently skip.
The clock starts at `launch_start_date`, not at account creation.

## Day 1 — Foundation (nothing can be listed properly without these)
| # | Task | Owner | Skill / how |
|---|---|---|---|
| 1.1 | Shop DNA saved (niche, buyer, voice, price band, suppliers) | claude | `etsy-shop-onboarding` Q&A |
| 1.2 | Shop title + announcement written, confirmed, applied | claude | `update_shop` (one write, table-confirmed) |
| 1.3 | Payment account/billing/identity verification complete | user | Shop Manager — Claude can only check `is_etsy_payments_onboarded` via `get_shop` |
| 1.4 | Production partner added (required for any `someone_else` listing) | user | Shop Manager → Settings → Production Partners; verify with `get_shop_production_partners` |
| 1.5 | Shipping profile(s), processing profile, return policy exist | claude | `create_shop_shipping_profile` + destinations, `create_processing_profile`, `create_shop_return_policy` — follow the standing profile rules in CLAUDE.md (jewelry: shared profile, US free / rest $5; apparel: Standard Shipping) |
| 1.6 | Shop policies pasted (returns/cancellations/privacy) | user | Claude hands over exact text from the setup kit — not API-writable |

## Day 2 — Brand & storefront
| # | Task | Owner | How |
|---|---|---|---|
| 2.1 | About story (≤5,000 chars), tagline, FAQ, sale message | claude drafts / user pastes | setup kit in `etsy-shop-onboarding` (story uses only facts the owner gave — never invent a "grandmother's workshop") |
| 2.2 | Logo (≥500×500) and banner/featured photos (760×468 crop, ≤5) | user | Claude supplies a visual brief matched to `brand.visual_notes`; no upload API exists |
| 2.3 | 4-6 shop sections created (**titles ≤20 chars** — confirmed live limit) | claude | `create_shop_section`, one confirmed batch |
| 2.4 | Shop DNA `setup_checklist` re-read from live shop | claude | `get_shop`, `get_shop_sections`, policies read |

## Day 3 — Research (so Day 4-5 listings are grounded, not guessed)
| # | Task | Owner | How |
|---|---|---|---|
| 3.1 | Niche/saturation read for the 3 best product ideas | claude | `etsy-niche-scanner` (Haiku for the reads) |
| 3.2 | **Rank-first title pattern** for each of the first 10 products | claude | `rank-first-title-guide.md` — top-20 ranking titles → first-40-char pattern |
| 3.3 | Keyword/tag bank per product group | claude | `etsy-keyword-research`, saved to `data/tags-database.json` |
| 3.4 | Price benchmark: average of researched listings + suggested price below it | claude | CLAUDE.md step 3b — mandatory every time reference listings are pulled |
| 3.5 | Product list locked (10 products) with sources confirmed | user + claude | `etsy-supplier-sourcing` / `Add Product/` staging; a `sources` entry is a hard blocker before any draft |

## Day 4 — Listings batch 1 (5 products)
`etsy-create-listing` per product, full flow, every gate: trademark screen, photo verification, rank-first title,
Copy QA Gate, DELIVERY TIME FRAME block, `who_made` per production-partner rule, listings-record JSON, tags-database
sync, product-registry, `sources`. Drafts first; **do not publish on Day 4** — publishing is Day 6 after QA.

## Day 5 — Listings batch 2 (5 more → 10 drafts) + merchandising
- Same flow for products 6-10.
- Assign every draft to a shop section; pick the featured listings (the 4 strongest thumbnails/prices).
- Upload videos where the supplier provided one (rule: image requirements guide).

## Day 6 — QA, risk check, publish
| # | Task | Owner | How |
|---|---|---|---|
| 6.1 | Independent QA pass on all 10 drafts | claude | `etsy-listing-qa-check` (whole catalog) |
| 6.2 | IP/trademark/risk scan of all 10 + shop text | claude | `etsy-risk-scan` — fix before publishing |
| 6.3 | Reconcile local records with live drafts | claude | `etsy-sync-check` |
| 6.4 | Publish the clean ones (`state: active`) — one confirmed write per listing, or one table for the batch if the user approves it as a batch | claude | `update_listing` + record + Ready Products sheet sync (jewelry) |

Publishing costs a listing fee per listing (see `etsy-fees-guide.md`) — say the total before asking for the yes.

## Day 7 — Go-live review + week-2 baseline
| # | Task | Owner | How |
|---|---|---|---|
| 7.1 | Storefront audit of the finished shop | claude | `etsy-storefront-audit` |
| 7.2 | Whole-shop scorecard = the **baseline** (saved into DNA `live_snapshot`) | claude | `etsy-audit-account` |
| 7.3 | Export Etsy Stats CSV (views/visits/favorites) into the project | user | Shop Manager → Stats → download — the only way traffic data reaches this system |
| 7.4 | Week-2 routine set: 5 new listings/week, tag rotation after 14 days, review replies | claude + user | writes the next 7 days into `launch-plan.json` as "week 2" |

## `launch-plan.json` schema

```json
{
  "account": "Anas",
  "start_date": "2026-10-08",
  "current_day": 1,
  "tasks": [
    {"id": "1.1", "day": 1, "title": "Shop DNA saved", "owner": "claude",
     "status": "todo | doing | done | blocked | skipped",
     "done_date": null, "note": null}
  ],
  "baseline": {"date": null, "scorecard_ref": null}
}
```

Update a task's status the moment it changes (local bookkeeping, no confirmation). When the user says "launch plan
dikhao / aaj kya karna hai", read this file, show **today's** open tasks only (not all 7 days), and name the next
one to do.
