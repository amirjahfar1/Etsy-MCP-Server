# Rank-first title formula

Explicit user instruction (2026-10-07), upgraded 2026-10-21 with a 16-term / 640-listing study: a title is **not** written from the
supplier text or from memory. It starts from what the top-ranked listings for the buyer's search term actually do. Etsy weights the
first ~40 characters of a title most heavily (see `etsy-seo-standards.md` → Title), so those 40 characters are decided by data; the rest
of the title adds distinct buyer angles. **The model never counts by eye: every number in the report comes from
`scripts/keyword-stats.mjs`.**

Applies to: `etsy-new-listing-copywriter`, `etsy-create-listing`, `etsy-copy-listing`, `etsy-optimize-listing`, `etsy-seasonal-keywords`
(when it edits a title), and any ad-hoc title. The tags are built from the same data (`etsy-seo-standards.md` → Tag slot model,
`tag-templates.md`).

## Procedure

**1. Pick the buyer's search term** (not the supplier's product name): what a buyer types for the *motif + product noun*
(`octopus ring`, `skeleton necklace`), not the supplier's `Vintage Punk Zinc Alloy Finger Ring Men Hip Hop`. Choose 2-4 candidate terms: the
motif head term, one style variant (`gothic ring`), one format variant (`adjustable wrap ring`). Use `etsy-keyword-research` if unsure.

**2. Pull the top 40 per term and save one file per term.** *Reading task → Haiku sub-agent* (or a direct read-only pull on hosts without
sub-agents, see `AGENTS.md`). One `search_listings` call per term: `keywords: <term>`, `sort_on: "score"`, `limit: 40`,
`currency: "USD"`, `include_description: false`. If the result overflows into a tool-result file, convert it:
`node scripts/term-file.mjs <raw-result-file> "<term>" data/research/<category-slug>/<YYYY-MM-DD>/<term-slug>.json`
(`<term-slug>` = the term in kebab-case). Keep dated folders: old ones are the trend history. Add the shop's own listings as
`own.json` in the same folder when you want the gap comparison (fields: `listing_id, state, title, tags, price, views, num_favorers, created`).

**3. Run the statistics** (same command on macOS, Windows, Linux):
```
node scripts/keyword-stats.mjs data/research/<category-slug>/<YYYY-MM-DD> --exclude "<noise regex>" --out data/research/<category-slug>/<YYYY-MM-DD>/stats.json
node scripts/keyword-stats.mjs data/research/<category-slug>/<YYYY-MM-DD> --exclude "<noise regex>" --md      # the table below, ready to paste
```
Noise regex for rings: `dish|holder|box|tray|decor|trinket|figurine` (ring dishes were ~30% of some samples and distort price). The script
reports, per term: usable sample after noise, exact phrase in first 40 chars, title-starts-with %, exact head term as a tag %, **term type**
(motif vs style/format), lead 2/3-grams, tag tiers and slots, like-for-like price quartiles, title-length histogram, rank gradient (top 10 vs
ranks 31-40), and (with `own.json`) the shop's gaps. **If fewer than 25 listings are usable, say the sample is thin and add a broader term.**

**4. Report the pattern as a table** (copy the numbers from `stats.json` / `--md`; never recount):

| Rank-first evidence ("<term>", top 40, <date>) | Result |
|---|---|
| Usable / dropped as noise | 38 / 2 |
| Exact phrase in first 40 chars / title starts with it | 68% / 24% |
| Term type | motif (leads the title) / style or format (tag + later segment) |
| Top lead 2-grams (count) | skeleton necklace (28), halloween skeleton (6) |
| Exact head term used as a tag | 100% |
| Title length: market median / share 130-140 (context only; we use 135-140) | 122 / 35% |
| Like-for-like price p25 / median / p75 (n) | $17 / $45.37 / $69.99 (14) |

Also state the *price recommendation* per CLAUDE.md step 3b (average + a suggested price) and add the like-for-like median and p25-p75 next
to the plain average, because sterling/solid-gold listings inflate the average for plated-alloy pieces.

**5. Write the title:**
- **Characters 1-40**: follow the term type. *Motif* term: the exact phrase, verbatim, first or after one modifier (`Silver Dragon Ring, …`).
  *Style/format* term: keep the motif + product noun in the lead and carry the style/format word in later segments and in a tag; do not force it first.
- **After character 40**: add a segment only if it is an evidenced phrase (>=10% of the sample's tags or titles) covering a new buyer angle
  (material, recipient, occasion, motif synonym). **Use the full length** (owner decision 2026-10-21): target 135-140 characters, never above 140, by adding genuine keyword angles, never padding. (The sample's median was 109; that is context, not the target.)
- The product noun may appear twice; no word three times; no back-to-back rephrasing of the same phrase.
- Never copy a competitor's title or a long run of it: borrow the *lead phrase and structure*, not the sentence.
- Shop DNA (`shop-dna-guide.md`) overrides pure market mimicry on voice and on `never_sell` terms. The trademark screen and Copy QA Gate still apply: a
  lead phrase that is a franchise/brand/celebrity name is dropped, not "used because the data says so". Brand tags (e.g. `pandora`) are removed from the script's output.

**6. Verify before showing** (mechanical): the motif head term is in the first 40 chars; `% : & +` each used at most once; <=140; the 40-char cut
does not split a word awkwardly in the *final* title; then build the 13 tags from the slot model and report "n/13 tags evidenced" (>=10 required, <=3 "own angle").

**7. Save the pattern** so the next listing in the same niche skips steps 2-3: append to `data/title-patterns.json`
```json
{"<category-slug>": {"term": "skeleton necklace", "checked": "2026-10-21", "sample": 40, "usable": 38,
  "term_type": "motif", "lead_phrases": [{"phrase": "skeleton necklace", "count": 28}],
  "stats_file": "data/research/<category-slug>/2026-10-21/stats.json", "like_for_like_median": 45.37, "dominant_taxonomy_id": 1234}}
```
Patterns older than **30 days** are re-checked (search results drift weekly). Local bookkeeping: no confirmation needed. Use the same category
slug as `tags-database.json`.

## Honest limits (say them, don't hide them)

- The API's `score` ordering approximates Etsy's relevance ranking; it is **not** the personalised, location-aware, ad-mixed page a buyer sees,
  and the `keywords` filter forces every result to contain the term (so "winners contain the term" is partly selection).
- A 40-listing, one-day sample is a signal. A phrase on 4 of 40 is a minority pattern; say so.
- The search data has no sales or conversion. "Top-ranked" is not "selling". Competitor favorites/views are not in the search results
  (`num_favorers` is, since 2026-10-21).
- "Listing age" in the sample is probably *last renewed/sold*, not first listed (see Blind spots in `etsy-seo-standards.md`).
- This improves *relevance matching*; it does not fix weak photos, price or reviews, which drive conversion. After publishing, the way to learn
  whether a title worked is the weekly views/favorites snapshots judged under `measurement-guide.md` (and the owner's Etsy Stats export).
