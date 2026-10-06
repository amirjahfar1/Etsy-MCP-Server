# Shop DNA — per-shop identity record

One file per connected account: `data/shops/<account>/shop-dna.json` (gitignored with the rest of `data/`).
It is what every other skill should read **first** so it knows what this shop sells, to whom, in what voice,
at what price band, and what it must never do — instead of guessing or re-asking every session.
Created/updated by `etsy-shop-onboarding`. Local bookkeeping, same as listings-record/tags-database:
writing it needs no confirmation (it is not an Etsy write).

Companion file: `data/shops/<account>/launch-plan.json` (the 7-day plan state — see `launch-7day-playbook.md`).

## Who reads it

Any skill that writes copy, picks a price, picks `styles`/`who_made`, or judges "does this fit this shop":
`etsy-new-listing-copywriter`, `etsy-create-listing`, `etsy-copy-listing`, `etsy-optimize-listing`,
`etsy-seasonal-keywords`, `etsy-product-ideation`, `etsy-pricing-audit`, `etsy-audit-account`,
`etsy-storefront-audit`, `etsy-risk-scan`. **If the account has no `shop-dna.json`, say so once and offer to run
`etsy-shop-onboarding`** — don't silently proceed as if the shop had no identity. (Never block on it; a missing
DNA file is a nudge, not a gate.)

## Schema

```json
{
  "schema_version": 1,
  "account": "Anas",
  "shop_id": "67270188",
  "shop_name": "Duskfang",
  "shop_url": "https://www.etsy.com/shop/Duskfang",
  "last_updated": "2026-10-07",
  "onboarding": {
    "mode": "new | running",
    "completed_date": "2026-10-07",
    "launch_start_date": "2026-10-08 | null",
    "dna_source": "asked | inferred-from-live-shop | both"
  },
  "identity": {
    "niche_primary": "gothic/vintage jewelry",
    "categories": ["jewelry"],
    "sub_niches": ["rings", "necklaces"],
    "product_types": ["silver-tone rings", "pendants"],
    "business_model": "dropship | print-on-demand | handmade | digital | mixed",
    "suppliers": ["AliExpress"],
    "physical_or_digital": "physical",
    "who_made_default": "someone_else",
    "production_partner_ids": [123],
    "never_sell": ["branded/licensed characters", "..."]
  },
  "audience": {
    "primary_buyer": "women 22-35 buying for themselves",
    "gift_buyers": true,
    "countries": ["US", "UK", "CA", "AU"],
    "occasions": ["birthday", "anniversary", "halloween"],
    "price_sensitivity": "low | medium | high"
  },
  "brand": {
    "aesthetic_styles": ["Gothic", "Vintage"],
    "voice": "warm, plain-spoken, a little dark-romantic",
    "avoid_words": ["amazing", "stunning"],
    "tagline": "...",
    "story_facts": ["real facts the owner confirmed; never invented"],
    "visual_notes": "black backgrounds, macro detail shots"
  },
  "commercial": {
    "currency": "USD",
    "price_band": {"min": 18, "max": 45},
    "pricing_rule": "below researched competitor average (see CLAUDE.md step 3b)",
    "target_margin_pct": 40,
    "ships_from": "PK",
    "default_processing": {"min": 3, "max": 5, "readiness_state_id": 0},
    "default_shipping_profile_id": 0,
    "default_return_policy_id": 0
  },
  "live_snapshot": {
    "fetched_date": "2026-10-07",
    "listing_active_count": 11,
    "sales_count": 2,
    "review_count": 0,
    "review_average": 0,
    "sections": ["Rings"],
    "has_announcement": true,
    "has_about": null,
    "has_banner": false,
    "has_logo": true,
    "policies_set": ["shipping", "refunds", "privacy"],
    "shipping_profiles": ["Jewelry Shipping"],
    "etsy_shop_name_drift": "accounts.json says X, Etsy says Y | null"
  },
  "setup_checklist": {
    "shop_title": "done | todo | skipped",
    "announcement": "done",
    "about_story": "todo",
    "logo": "done",
    "banner": "todo",
    "policies": "done",
    "sections": "todo",
    "shipping_profile": "done",
    "processing_profile": "done",
    "return_policy": "done",
    "production_partner": "done",
    "payment_account": "done",
    "first_10_listings": "todo"
  },
  "rules_for_claude": [
    "Free-text owner constraints, e.g. 'never use the word handmade', 'keep tags jewelry-only'"
  ]
}
```

Unknown values are `null`, never invented. `live_snapshot` is a **dated photo**, not truth — when a skill relies on
it and it is older than ~30 days, re-read the live shop first.

## Building it — two modes (decided by `etsy-shop-onboarding`)

- **new shop**: ask the questions in `etsy-shop-onboarding/SKILL.md` → fill `identity`/`audience`/`brand`/`commercial`
  from the answers; `live_snapshot` is mostly empty (just the setup-checklist state read from the API).
- **running shop**: read the live shop (Haiku sub-agent for the bulk reads — see model-usage rule in CLAUDE.md) and
  **infer** the DNA from what is actually there: taxonomy mix and title vocabulary of active listings, price
  min/median/max, most frequent tags, sections, shipping/processing/return profiles, production partners, review
  themes. Present the inferred DNA to the user as a table, ask them to correct it, then save. Inferred fields that the
  user did not confirm get `dna_source: "inferred-from-live-shop"`.

## Keeping it current

- A shop that pivots (like Anas moving to gothic/vintage jewelry) → update `identity`/`brand`; don't leave the old
  niche in place. Append the change to `rules_for_claude` only if it is a standing constraint.
- Any skill that discovers a contradiction between DNA and reality (e.g. DNA says "no digital" but the shop has a
  digital listing) reports it and asks — it does not silently overwrite the owner's stated intent.
- Account renamed on Etsy → set `shop_name` from the live `get_shop` and record the drift in `live_snapshot` so
  `accounts.json`'s stale name can be fixed (`etsy-sync-check` does this).
