# "Rings Keyword Research - eRank" Google Sheet — the jewelry keyword source

Used by every jewelry listing flow (`etsy-create-listing`, `etsy-new-listing-copywriter`, `etsy-optimize-listing`, `etsy-seasonal-keywords`,
rank-first title work) as **market evidence**, next to `scripts/keyword-stats.mjs`. It is a Google Sheet reached through the `google-sheets` MCP
server (read and write allowed: it is the owner's own sheet, local-adjacent bookkeeping, not an Etsy write, no confirmation needed).
It is **not** an Etsy account call, so it is allowed even when the owner has said "no account work".

## Where it lives
- Spreadsheet ID: `1wwyTwcAaiGOQ4J3MtbOVBLPnOy08EdcZJz2JEYexVlo` (different from "Etsy Order" and "Ready Products").
- Currently covers **rings** (78 keywords, eRank Pro numbers). Other jewelry types (necklaces, earrings, bracelets) get their own sheet or tabs later; keep the same columns.

## Tabs
| Tab | What it is | Edit by hand? |
|---|---|---|
| `Keywords` | **The source data.** One row per keyword. Columns A:J are the eRank research (Keyword, Style / Type, Avg Searches, Avg Clicks, Avg CTR, KD, Etsy Listings, Status, Note, Round). Columns K:S are the organisation layer (below). | Yes: this is the only tab you add keywords to |
| `By Category` | Live view: summary + one block per category (Ring Type, Signet & Engraved, Stone / Gem, Birthstone / Birth Flower, Design / Motif, Functional / Fidget, Purpose / Occasion, Material / Finish, Style Descriptor, Personalized). Built with QUERY, so it updates itself. | No |
| `By Style` | Live view: 31-style summary with coverage (`covered` / `only as an extra style` / `GAP - not researched yet`), a **style explorer** (pick a style in cell B38), and one block per style group. | Only B38 |
| `Styles & Types`, `Instructions`, `Master` | The original research brief: style groups, the PASS rule, Top 30, empty niches, AVOID list (including branded terms). | Rarely |

## `Keywords` organisation columns (K:S)
`Category` | `Style Group` | `Primary Style` | `Extra Styles` | `Family` | `Flags` | `Ratio (Searches/Listings)` | `Priority` | `Tag-ready`
- **Primary Style** is the style the keyword fits best (judged by what a buyer picturing it expects), **Extra Styles** are other styles it also works for. The old `Style / Type` label in column B is kept untouched as history and is often arbitrary (e.g. "14k gold signet ring" was labelled Witchy/Occult), so use column M, not B.
- Style names come from the 30 styles in `etsy-aesthetic-styles-guide.md` plus `Neutral / any style` (keyword fits any style, e.g. "fidget ring").
- **Priority** (formula, do not type it): `EXCLUDE` if Flags contain EXCLUDE; `TEST`; `A+ Empty niche` = Ratio >= 0.85 and Searches >= 600; `A` = Ratio >= 0.3 and KD <= 30; `B` = Ratio >= 0.12; else `C`. Ratio = Avg Searches / Etsy Listings (demand per competing listing).
- **Tag-ready** (formula): `YES` when the keyword is <= 20 characters and lowercase, so it can be an Etsy tag as is; `NO (N chars)` means use it in the title or shorten it.
- **Flags**: `TOP30`, `EMPTY NICHE`, `EXCLUDE (reason)`, `TEST (reason)`, `BRAND CHECK`, `SHOP NICHE`.

## PASS rule (from the sheet's Instructions tab, unchanged)
A keyword passes only when Searches, Clicks and CTR are green, Etsy Listings are green, KD < 50 and it is jewellery-relevant. Branded terms on the AVOID list (chrome hearts, oura, pandora, disney, swarovski, david yurman, james avery) are never used.

## How a listing flow uses it
1. Read the `Keywords` tab: `get_sheet_data` spreadsheet `1wwyTwcAaiGOQ4J3MtbOVBLPnOy08EdcZJz2JEYexVlo`, sheet `Keywords`, range `A1:S`. (To see only one style or category, read `By Style` / `By Category` instead.)
2. Drop every row whose Priority is `EXCLUDE`. Treat `TEST` and `BRAND CHECK` rows as "ask the owner first / verify".
3. Match the product to its **Category** and to the **Primary/Extra Style** found by the aesthetic match (gate A9). Candidates = rows in that category plus rows whose style matches. Order by Priority (`A+ Empty niche`, `A`, `B`, `C`), then Avg Searches.
4. Use the result as evidence, like a top-40 pull: head term and format in the title's first 40 characters, `Tag-ready = YES` rows as tags (still respecting the 13-tag slot model), `NO` rows as title phrases. Say in the report which keywords came from this sheet and their Searches / Listings / KD, quoted from the sheet, not from memory.
5. This sheet shows **demand and competition per keyword**, not what the top Etsy listings actually do. It does not replace the rank-first top-40 pull for the exact search term; it tells you which terms are worth pulling and building around.
6. If the product's keyword is not in the sheet, say so. Do not invent numbers. Offer to add it (below).

## Adding a keyword (when the owner or the research assistant finds a new winner)
1. Check the `Keywords` tab for the exact keyword first (case-insensitive). If it exists, update its numbers, never add a second row.
2. Append a row at the bottom of `Keywords`: A:J from eRank (numbers as real numbers, CTR as a percent), K:P filled by judgment (Category, Style Group, Primary Style, Extra Styles, Family, Flags). Copy the formulas for Q:S from the row above (Ratio, Priority, Tag-ready).
3. Do not add rows inside the `By Category` / `By Style` tabs; they fill themselves. If a block ever shows `#REF!`, insert empty rows under it.
4. Searches / Clicks / KD / Listings must be **numbers**, not text (text numbers sort wrongly in the views). The `KD` cell may be the text `not shown` when eRank hides it.
5. Per the sheet's Instructions tab, a winner is also saved in eRank's Keyword List "Rings" and a local CSV backup (done by the research assistant, not by this system).

## Known gaps in the research (2026-10-21)
No keywords yet for **Egirl/Eboy, Steampunk, Light Academia**; Cyberpunk, Dark Academia, Emo, Retro decades and Athleisure only appear as an extra style. Two rows are `EXCLUDE` (wrong intent): "engagement ring box" (a box, not a ring) and "septum ring" (body jewellery).

## Honest limits
eRank numbers are monthly estimates from one tool and one date; they are not Etsy's own search data. Do not quote them as exact. Re-check a keyword's row if it is older than ~90 days before building a listing around it.
