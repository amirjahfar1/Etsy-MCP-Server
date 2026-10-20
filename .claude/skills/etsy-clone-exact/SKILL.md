---
name: etsy-clone-exact
description: >-
  EXACT clone of an existing listing onto another (or the same) connected Etsy account, 100% as it is: same title, description,
  tags, price, variations, personalization, materials, styles, images in the same order with the same alt text, and the video.
  Only the account-specific ids (shipping profile, return policy, processing profile, shop section, production partner) are
  re-mapped. No rewriting, no price question, no style-match stop, no research, no QA blocks: the system's own rules are
  reported as warnings only, and only Etsy's own hard limits can stop it. One table confirmation for the whole clone.
  Trigger on: "ye listing is account pe as it is copy kar do", "exact clone", "same listing dusre account pe laga do",
  "bilkul waisi hi listing banao", "100% copy", "clone listing X to account Y as is", "copy without changes".
  Use etsy-copy-listing instead when the copy should be rewritten/optimised.
---

# Etsy Clone Exact: the listing, field for field, on another account

**Not** `etsy-copy-listing` (that skill researches and rewrites the copy and asks for price/shipping/personalization). This one is a mechanical, faithful copy.
Everything is planned by scripts from the source listing's **complete local snapshot**, so nothing is forgotten and nothing is invented.

## Which rules still apply, and which don't

| Applies | Does NOT block (warning only) |
|---|---|
| Safety rule: **one table-confirmation** before any write (it covers the draft, inventory, personalization and all image/video uploads) | Copy QA Gate, rank-first title, tag slot model, DELIVERY TIME FRAME recompute (a mismatch is only reported) |
| Target account must be connected and **active** | Price: copied as it is; no price question |
| Etsy hard limits (production partner for `someone_else`, 999 create-time quantity, field formats) | `sources`/style-match/photo-verification/trademark gates: the listing is already live, the copy is mechanical |
| Standing owner rule: no digital listings on `abbas_etsy` (reported as a warning that needs the owner's yes) | Duplicate/cross-account similarity: reported once, not blocking |
| Local bookkeeping afterwards (record, registry, sources) | Branded words: the owner's one-time "list it anyway?" is the only question |

## Steps

1. **Resolve** source account + listing id + target account (ask only what is missing). The source and target may be the same account.
2. **Source snapshot must be complete and fresh.** If `data/listings/<src>/<id>/raw/snapshot.json` is missing, incomplete, or older than a day: delegate a Haiku read-only `Agent`
   to call `get_listing_snapshot` (`account`, `listing_ids: [id]`) and note the saved output path, then run
   `node scripts/ingest-snapshot.mjs <saved output>`. It must print `✔ ... complete` (images N/N, video, variants, personalization).
3. **Target profiles must be known.** If `data/shops/<target>/profiles.json` is missing or older than 7 days: Haiku `Agent` calls `get_shop_profiles` (`account: <target>`), then
   `node scripts/ingest-snapshot.mjs <saved output>`. (An `invalid_grant` error means that account's token has expired: tell the owner to re-authorize it.)
4. **Plan:** `node scripts/clone-plan.mjs <src> <id> <target> --out data/clone-plans/<src>-<id>-to-<target>.json`. Show the owner the whole output:
   blockers, warnings, id mapping, and the **full write table** (every field). Profiles that do not exist on the target are shown as "will be CREATED" with their steps.
5. **Blockers** are only Etsy-hard or missing data (no production partner on the target, deactivated account, media files missing). Help fix them; **never change the content to get around one**
   (do not switch `who_made` to `i_did`, do not drop images).
6. **One confirmation** ("yes" to the table). Ask in the same message whether to **publish** afterwards (default: leave as draft).
7. **Execute the plan's steps in order**, substituting `{{placeholders}}` with ids captured from earlier steps (new shipping profile, return policy, processing profile, section, then the new `listing_id`).
   Stop at the first error; diagnose it with `etsy-docs` and the known gotchas in CLAUDE.md (opaque 400s: quantity cap, production partner, personalization limits...), fix the **plan**, and document a newly discovered
   error per the API-error rule. Never retry blindly.
8. **Verify**: Haiku `Agent` -> `get_listing_snapshot` for the NEW listing on the target -> `node scripts/ingest-snapshot.mjs <saved output>` -> `node scripts/clone-verify.mjs <src> <id> <target> <new id>`.
   Report any difference; fix or explain it.
9. **Bookkeeping, same turn, no confirmation:** the new record exists (step 8); add the listing under the **same `product_id`** in `data/product-registry.json` and copy `sources` to it; jewelry -> "Ready Products" sheet row;
   publish only if the owner said yes (then `update_listing state: active`, record + sheet `Published`).

## Report
`Clone <src>/<id> -> <target>/<new id> [draft|active] | verify: ✔ identical / N differences | created on target: <profiles> | warnings shown: <n> | not tested: <...>`.

## Limits (say them)
- Etsy offers no API to add a production partner, to copy a listing natively, or to read a digital deliverable's file content (digital listings cannot be cloned file-for-file).
- Sale prices (promotions) are not part of a listing and are not cloned; they are a separate shop-level promotion.
- Images are re-uploaded from the saved local copies; Etsy re-encodes them, so image bytes are not identical but the pictures, order and alt text are.
