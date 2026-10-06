---
name: etsy-risk-scan
description: >-
  Account-level risk scan for the connected Etsy shops — finds what could get a listing frozen or an
  account suspended BEFORE it happens: franchise/brand/celebrity/sports names in titles, tags and
  descriptions, products staged in Add Product/ that carry a brand or licensed character, "handmade"
  claims on supplier-made items, buyer-visible sourcing words (AliExpress/dropship), AI-generated
  product images without disclosure, listings stuck in edit/frozen state, near-identical copy or photos
  across accounts, and policy/return-policy contradictions. Produces a per-account risk level and a
  prioritized fix list. READ-ONLY: it flags and explains, it never edits. Trigger on: "risk scan",
  "check my accounts for risk", "kya koi listing freeze ho sakti hai", "IP check", "trademark scan",
  "is account safe", "suspension se kaise bachein", "scan before publishing", "check these staged products",
  and automatically as step 6.2 of the 7-day launch plan and before any batch publish.
---

# Etsy Risk Scan — catch the suspension before Etsy does

Why this exists: `itrat_etsy` was **permanently suspended** for repeated Creativity Standards violations, and two `abbas_etsy`
listings froze (`state: edit`, unpublishable, no API fix) for using the "Avatar: The Last Airbender" franchise name. The existing
trademark screen only runs while a listing is being created. This skill checks **everything already live or staged**, on a schedule
or on demand. Reference docs: `../_shared/account-risk-guide.md` (what each risk means and what to do), plus
`../_shared/etsy-production-partners-guide.md`, `../_shared/etsy-listing-image-requirements-guide.md`,
`../_shared/etsy-ai-disclosure-guide.md`.

**Read-only. No confirmation needed to scan.** The scan is *advisory*: a flag is input to the single "list it anyway?" question; once the user answers yes for a product, that answer is final (CLAUDE.md, 2026-10-07) — report the flag in the scan, but never refuse or re-ask on the same product. Any fix it suggests (title rewrite, delete, unpublish) is a separate write that goes
through the normal table-confirmed flow.

## Scope

Default: every **active** account (`list_accounts`). Deactivated accounts are skipped unless the user names one
(`--account`). Also scans `Add Product/` staging (products not yet listed — the cheapest place to stop a problem).

## Workflow

### 1. Deterministic first pass (free, instant, local)
Run from the project root:
```
python3 scripts/risk-prefilter.py --staging            # all active accounts + staging folders
python3 scripts/risk-prefilter.py --account Anas       # one account (also works for a deactivated one)
```
It matches `scripts/risk-terms.txt` (franchises, fashion/consumer brands, leagues, celebrities — extend that file whenever a new
case is found) against local listing records and staging folder/file names/`product-details.txt`, and flags: brand terms, buyer-visible
sourcing words, handmade claims on `who_made: someone_else`, non-live states, and `ChatGPT/DALL-E/Midjourney`-named images.
It is **evidence, not a verdict** — it over-flags ordinary words (`stitch`, `jordan`, `one piece`, `mario`).

### 2. Live check (reading → Haiku sub-agent)
Local records can be stale. Delegate to a **Haiku** `Agent` (read-only, `account` on every call) to return compact JSON for each
active account: `get_listings_by_shop` (active + draft + edit states), per listing `listing_id, title, tags, description (first 600
chars), state, who_made, production_partner_ids, image count`; `get_shop` (title, announcement, policies); `get_shop_production_partners`;
`get_shop_return_policies`. Re-run the term match on the *live* text — anything that differs from the local record is also an
`etsy-sync-check` finding.

### 3. Judge (main model — judgment, not extraction)
For each flag decide **Real / Context-safe / Needs-owner-answer**, with one line of reasoning:
- **Brand term**: a franchise, character, brand, league, or celebrity name as the product's identity or search hook = Real. A generic
  English word used generically ("stitch" the sewing term, "jordan" as a name in a personalised item) = Context-safe. A *style* inspired by a
  franchise ("kawaii", "gothic") is fine; the literal name is not. Staged product whose artwork *is* the franchise art (Appa, a Nike swoosh,
  a Sp5der web logo) = Real **even if the copy avoids the name** — the image itself is the infringement.
- **Handmade claim vs `someone_else`**: Real (Etsy treats it as a misrepresentation); fix the copy or the `who_made`.
- **AI-generated images**: open 1-2 with Read. If the image is the product photo of a supplier item, it is also an image-requirements problem
  (a generated picture is not a real photo of the actual item — `etsy-listing-image-requirements-guide.md`). If it is original artwork, the
  description needs the AI disclosure line (`etsy-ai-disclosure-guide.md`).
- **Frozen/edit state**: confirm live; if `edit` and the cause was IP, the realistic path is a new listing with clean copy (CLAUDE.md frozen-listing note).

### 4. Cross-account exposure (judgment, from `data/product-registry.json`)
- Products published on **2+ accounts**: list them, compare live titles and first images. Near-identical titles/photos across accounts is a
  correlated-risk signal (one strike can implicate the others) — flag as *Medium*, recommend distinct titles/photos (the project already
  forbids verbatim cloned titles; verify it was followed).
- Shared production partner / supplier across accounts is normal; flag only if combined with identical listings.
- Say plainly: Etsy does not publish how it links accounts; this is risk reduction, not a guarantee.

### 5. Report (always this shape)

```
# Risk Scan — <date>
## Verdict per account
| Account | Level | Real flags | Staged risk | Top action |
## Real flags (must fix)
| Where | Item | Evidence | Why it's risky | Suggested fix |
## Needs your answer
| Item | Question |
## Context-safe flags (dismissed)
| Item | Why dismissed |
## Staging (not yet listed)
| Folder | Problem | Recommendation (drop / re-source / re-shoot) |
## Cross-account exposure
## What this scan cannot see
```
Levels: **High** = a live/staged item with a franchise/brand identity or an unfixed frozen listing; **Medium** = handmade/AI/sourcing-word
issues or cross-account near-duplicates; **Low** = only context-safe flags. A level is never "Safe" — say "no flags found by this method".

### 6. Learn from it
When a **new** real brand/franchise term is found that the list missed, append it to `scripts/risk-terms.txt` (local file — no confirmation),
so the next scan and the create-flow screens catch it. If a new *kind* of risk appears, add it to `../_shared/account-risk-guide.md`.

## Honest limits (state them)
- It cannot see Etsy's internal flags, account health score, or a pending IP complaint — only what's on the listings and in staging.
- A term list misses new/obscure brands; image content can only be judged by looking at specific images, not at scale.
- It cannot judge whether a design is *substantially similar* to someone's copyrighted art; it can only flag obvious names and logos.
