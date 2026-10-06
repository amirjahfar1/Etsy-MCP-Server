# Rank-first title formula

Explicit user instruction (2026-10-07): a title is **not** written from the supplier text or from memory. It starts
from what the top-ranking listings for the buyer's search term actually lead with. Etsy weights the first ~40
characters of a title most heavily (see `etsy-seo-standards.md` → Title), so those 40 characters are decided by data;
the remaining ~100 characters add distinct buyer angles.

Applies to: `etsy-new-listing-copywriter`, `etsy-create-listing`, `etsy-copy-listing`, `etsy-optimize-listing`,
`etsy-seasonal-keywords` (when it edits a title), and any ad-hoc title.

## Procedure

**1. Pick the buyer's search term** (not the supplier's product name). Ask what a buyer types:
`gothic skull ring`, not `Vintage Punk Zinc Alloy Finger Ring Men Hip Hop`. If unsure, run the term through
`etsy-keyword-research`'s autocomplete-style variants first (2-3 candidates).

**2. Pull the top 20.** *Reading task → Haiku sub-agent* (CLAUDE.md model-usage rule). `search_listings` with the
term, `sort_on: score`, `limit: 20` (page again if fewer than 20 come back). Per listing return only:
`listing_id, title, price, taxonomy_id, tags, shop_id, num_favorers (if present), views (if present)`.
Drop any listing that is clearly off-intent (wrong product type) and note how many were dropped. If fewer than 12 usable
listings remain, say the sample is thin and widen the term rather than inventing a pattern.

**3. Cut each title at 40 characters** (end on the last whole word at or before char 40). Then:
- Count the **lead phrase**: the first 2-4 meaningful words (skip nothing; keep order). Group identical/near-identical
  leads (`gothic skull ring` / `skull ring gothic` = same cluster).
- Count the **head noun** position: does the product type come first, or does a modifier (style/material/occasion)?
- Count which **modifier slots** appear inside the 40 chars: style, material, recipient, occasion, size/variant.
- Note the separator habit (`|`, `,`, none) — match the market's habit when it is consistent, otherwise use `|`.

**4. Report the pattern as a table** (always shown before any title is proposed):

| Rank-first evidence (top 20 for "<term>") | Result |
|---|---|
| Usable listings / dropped off-intent | 18 / 2 |
| Most common lead phrase (count of 18) | `gothic skull ring` (9) |
| 2nd / 3rd lead phrase | `skull ring men` (4), `vintage skull ring` (3) |
| Product type appears in first 40 chars | 17 of 18 |
| Typical structure | `[Style] [Product] [Recipient/Material] | …` |
| Average price (landed if shipping varies) | $27.40 → suggest below this (CLAUDE.md step 3b) |
| Dominant taxonomy_id | 1234 (11 of 18) |

**5. Write the title:**
- Characters 1-40 = the winning lead phrase **in the shape the data shows**, containing the exact buyer term.
  If the data shows the top results lead with a modifier, lead with the modifier; do not force "product first" because a rule of thumb says so.
- Characters ~41-140 = **distinct** angles not already used (material, recipient, occasion, style #2, finish, size).
  No repeated words (2026 guidance in the SEO standards), target 130-139 total.
- Never copy a competitor's title or a long run of it — borrow the *lead phrase and structure*, not the sentence.
- Shop DNA (`shop-dna-guide.md`) overrides pure market mimicry on voice and on `never_sell` terms.
- Still subject to the trademark screen and the Copy QA Gate. A lead phrase that is a franchise/brand/celebrity name is dropped, not "used because the data says so".

**6. Verify before showing** (mechanical): first 40 chars contain the buyer term; no `% : & +` used twice; ≤140; no
uppercase-shouting; the 40-char cut does not split a word awkwardly in the *final* title.

**7. Save the pattern** so the next listing in the same niche skips step 2: append to `data/title-patterns.json`:

```json
{"<category-slug>": {"term": "gothic skull ring", "checked": "2026-10-07", "sample": 18,
  "lead_phrases": [{"phrase": "gothic skull ring", "count": 9}], "structure": "[Style] [Product] [Recipient] | ...",
  "avg_price": 27.4, "dominant_taxonomy_id": 1234}}
```

Patterns older than **30 days** are re-checked (search results drift); newer ones are shown and reused with the date
stated. Local bookkeeping — no confirmation needed. Reuse the same category slug as `tags-database.json`.

## Honest limits (say them, don't hide them)

- The API's `score` ordering approximates Etsy's relevance ranking; it is **not** the personalised page a buyer sees
  and may include paid placements the API doesn't flag. Treat the pattern as strong evidence, not proof.
- A 20-listing sample is a signal. A lead phrase that appears in 3 of 20 is a minority pattern — say so rather than presenting it as "the" formula.
- This formula improves *relevance matching*; it does not fix weak photos, price or reviews, which drive conversion.
  After publishing, the only way to learn if a title worked is the owner's Etsy Stats export (no API for views).
