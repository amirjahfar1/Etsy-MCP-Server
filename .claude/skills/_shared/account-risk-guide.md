# Account-level risk — what can get an Etsy account frozen or suspended, and what to do

Companion to `etsy-risk-scan`. Built from this project's own incidents, not general folklore:

| Incident (real) | What it taught |
|---|---|
| `itrat_etsy` permanently suspended (2026-08) — repeated Creativity Standards violations | Supplier-sourced and licensed/IP-adjacent catalogs are the main exposure; repeated violations end the account, not just a listing |
| `abbas_etsy` listings 4542392204 / 4542411318 / 4542415525 stuck in `edit`, "frozen" | Using a franchise name (Avatar: The Last Airbender) freezes a listing **permanently**; editing the copy afterwards does not unfreeze it, no API fix |
| Spec-sheet "zipper" claim on a ribbon-tie top | Copy that contradicts the photo is a listing-accuracy risk (see photo-verification rule) |

## Risk classes

| Class | Examples | Severity | Fix |
|---|---|---|---|
| **IP / brand** | franchise, character, brand, team, celebrity name in title/tags/description; artwork that *is* the franchise (logo, character) even if the text is clean | High | Don't list. Re-source an original design. Frozen listing → replacement listing with clean copy, then ask to delete the dead one (CLAUDE.md replacement rule) |
| **Misrepresentation** | "handmade"/"I make" on a `someone_else` item; claims the photo contradicts | High | Correct copy or `who_made`; declare a production partner |
| **Image authenticity** | AI-generated or stock picture presented as the real item; supplier watermark/logo on photos | Medium-High | Real photos for production-partner items that are unique designs; AI disclosure when AI art is the design (`etsy-listing-image-requirements-guide.md`, `etsy-ai-disclosure-guide.md`) |
| **Sourcing words** | "AliExpress", "dropship", "1688" in buyer-visible text | Medium | Remove (Copy QA rule 9b) |
| **Reselling** | listing a supplier's own catalog item as if original design, without production-partner disclosure | High | `etsy-production-partners-guide.md` — disclosure satisfies disclosure, not the underlying reselling question |
| **Cross-account correlation** | same design, near-identical title/photos on several accounts | Medium | Distinct titles, distinct photos; don't clone verbatim |
| **Policy contradiction** | description says "no returns" while the listing's `return_policy_id` accepts returns, or the reverse | Medium | Match the footer to the actual policy id |
| **Stuck state** | listing in `edit`/`inactive` after a takedown | Info/High | Confirm live; replace rather than wait |

## Operating rules
1. A flag from the prefilter is a **review item**, never an automatic verdict. Many brand words are ordinary words.
2. The image can be the infringement even when the text is clean. Look at staged images before approving a product.
3. When a new brand/franchise slips through, add its term to `scripts/risk-terms.txt` the same day.
4. Scan cadence: before every batch publish, at the end of launch week, and **monthly** for each active account.
5. The scan informs the owner; it does not overrule them. After the one-time "list it anyway?" question, a yes is final for that product (CLAUDE.md, 2026-10-07). The owner carries the account risk knowingly — so state the risk clearly in that one question (precedent: the frozen abbas_etsy listings, the suspended itrat_etsy).
6. Never use this guide or skill to disguise a flagged product (re-wording "Appa" as "flying bison hoodie" while keeping the franchise art) —
   disguising a flagged product is never the fix; the honest options are to list it as it is (after the one-time yes) or not to list it.
