---
name: etsy-sync-check
description: >-
  Keeps the local record system honest. Compares what is saved locally (data/listings/<account>/ records,
  data/product-registry.json, accounts.json, shop DNA, the Google Sheets) against what is actually live on Etsy and
  reports drift: listings that exist on Etsy with no local record, records for listings that are gone, fields that
  changed on Etsy (title, tags, price, state, images, shipping/return ids), missing sources/product_id, tag-rule
  violations, registry orphans, and renamed shops. Can write the live values back into the local records
  (local bookkeeping only) and snapshots each listing's views/favorites weekly so there is a real performance trend.
  READ-ONLY on Etsy. Trigger on: "sync check", "records update hain?", "local records live se match karte hain?",
  "data drift", "record sync optimize", "kya koi listing record se reh gayi", "check the registry", "weekly snapshot",
  "views save karo", "accounts.json ka naam sahi hai?", and automatically after any batch of edits/publishes and at
  the end of launch week.
---

# Etsy Sync Check — local records vs. live Etsy

**Problem it solves:** the system keeps ~150 local listing records, a product registry, tag bank and two sheets, all updated by
"remember to write it" instructions. Anything done outside a skill (an edit in Shop Manager, an Etsy takedown, a partial failure
mid-flow) makes them drift silently — e.g. `accounts.json` still calls the Anas shop "LovelyClothingAnas" while Etsy says "Duskfang".
This skill finds the drift cheaply (scripts do the comparing, not the model) and can repair the local side.

Never writes to Etsy. Writing to local records (`--apply`) is local bookkeeping, same standing as the listings-record rule — but
**show the drift report first and apply only after the user says yes**, because "Etsy is right" is usually true but not when a
frozen/rolled-back listing is the cause (see Judge step).

## Layers (run in order; stop early if the user only wants one)

### Layer 1 — Local integrity (free, instant, no API)
```
python3 scripts/local-integrity.py            # grouped summary
python3 scripts/local-integrity.py --verbose  # every listing
```
Checks every record against the registry and `accounts.json`: `product_id` present and matching, **`sources` non-empty** (hard rule),
registry ↔ record orphans, unknown account folders, bad JSON, id/account mismatches, tag rules (13 tags, ≤20 chars, lowercase, no
duplicates), title ≤140, missing state, media files referenced but missing. Exit code 1 when any *high* issue exists.
Group the results for the user: **active accounts first**; legacy findings on deactivated accounts (`abbas_etsy`, `itrat_etsy`) are
reported as a separate "legacy debt" line, not mixed into current problems.

### Layer 2 — Live vs local (per account)
1. `list_accounts` → active accounts (or the one the user names).
2. **Delegate the read to a Haiku `Agent`** (model-usage rule): read-only tools, `account: <name>`; it fetches all states
   (`active`, `draft`, `inactive`, `expired`; `edit` shows as inactive/draft-like — record whatever the API returns) and
   writes `scratchpad/<account>-live.json` — a compact JSON list with keys `listing_id, state, title, tags, description, price`
   (decimal = `amount/divisor`), `quantity, who_made, when_made, taxonomy_id, materials, styles` (API field `style`),
   `shipping_profile_id, readiness_state_id, return_policy_id, processing_min, processing_max, image_count, has_video, views,
   num_favorers, url`. It must validate the file parses and reply with only a count — never paste listings into chat.
3. Compare (deterministic):
```
python3 scripts/sync-diff.py <account> <scratchpad>/<account>-live.json            # report only
python3 scripts/sync-diff.py <account> <live.json> --snapshot                      # also append views/favorites snapshot
python3 scripts/sync-diff.py <account> <live.json> --apply                         # write live values into local records
```
Finding kinds: **live-only** (on Etsy, no record — create one from live state per the listings-record rule, don't just flag it),
**record-only** (record but Etsy didn't return it — deleted, or in a state not fetched), **drift** (field-level local vs live).

### Layer 3 — Shop-level drift (cheap, main model)
- `get_shop` per active account: compare `shop_name`/`shop_id` to `accounts.json`. A mismatch is reported (and `shop-dna.json`'s
  `live_snapshot.etsy_shop_name_drift` set); **ask before editing `accounts.json`** (it holds credentials; only the `shop_name` field changes).
  Known case: Anas = Duskfang on Etsy vs "LovelyClothingAnas" in `accounts.json`.
- Registry: any listing whose live state is gone/frozen but still marked live in `product-registry.json` → apply the "collapse to one current
  record per product" rule from CLAUDE.md (update the registry entry; ask before deleting dead Etsy listings).
- Sheets (only if the user asks or after jewelry publishes): spot-check "Ready Products" `Status` against record state (`Draft` ↔ draft,
  `Published` ↔ active) and the "Etsy Order" `Index` account list against active accounts.

## Judge the drift (main model — not everything "live wins")
| Drift | Usual cause | Action |
|---|---|---|
| title/tags/description differ | edited in Shop Manager, or a skill's write didn't sync the record | apply live → record; if a skill failed to sync, say which write |
| price differs | `update_listing_inventory` price change not recorded | apply |
| `state` active→edit/inactive | Etsy takedown/freeze, or sold out/expired | **flag loudly**, run `etsy-risk-scan` on it; don't "fix" by re-activating |
| record-only | listing deleted on Etsy | if the user confirms, apply the replacement rule (remove local folder, note in registry) — destructive, ask |
| live-only | listing made in Shop Manager | create the record from live state + ask for `sources` (hard rule) |
| `shipping_profile_id`/`return_policy_id` changed | profile recreated or reassigned | apply; check the DELIVERY TIME FRAME text still matches |
| `image_count(unverified)` / `video(unverified)` | sub-agents get these wrong (a live video was once reported missing) | **never apply**; confirm with `get_listing_images` / `get_listing_videos` on that one listing first; media files are not auto-downloaded |
| `draft` vs `inactive` | Etsy's API reports an unpublished draft as `inactive` (verified live) | not drift — the script treats them as equal |

## Weekly performance snapshot (the only trend data this system can get)
`getListing` returns cumulative `views` and `num_favorers` for active listings (a snapshot, directional, not exact — `views` can read 0 for
reasons unrelated to traffic). `--snapshot` appends one row per listing to `data/metrics/<account>.jsonl` each run. Run it **weekly** (or
via `/schedule`). After 2+ snapshots, compute per-listing view/favorite **deltas** and report the movers: top 3 gaining, top 3 stalled with
age > 14 days. This is the feedback loop for the rank-first title test (compare the delta before vs after a title/thumbnail change; note the
date of every change so effects aren't misread). Say plainly it is a small, noisy signal and not conversion data; the owner's Etsy Stats CSV
is the richer source.

## Report shape
```
# Sync Check — <date>
| Account | Records | Live | Drift | Live-only | Record-only | Integrity (high/med) |
## Needs attention (state changes, live-only, record-only)
## Safe to apply (field drift → local records)   [apply on user's yes]
## Shop-level drift (names, registry, sheets)
## Legacy debt (deactivated accounts)
## Snapshot delta (if 2+ snapshots)
```
After applying, re-run the diff and confirm zero drift on the applied fields; report any that remain.

## Honest limits
- It cannot detect edits made *and reverted* between runs, or changes to fields the live fetch doesn't return (e.g. variant-level inventory
  prices beyond the listing-level price, personalization questions) — spot-check those with `get_listing_inventory`/`get_listing_personalization`
  when a listing is suspect.
- Description comparison normalizes whitespace only; an em-dash or curly-quote difference counts as drift (usually Etsy's own re-encoding —
  judge before applying).
