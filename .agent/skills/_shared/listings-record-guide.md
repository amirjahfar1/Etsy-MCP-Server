# Listings Record — shared save workflow

Referenced by every skill that calls `create_draft_listing`
(`etsy-create-listing`, and `etsy-new-listing-copywriter` when it creates a
bare draft directly) **and by every skill that calls `update_listing` on an
already-recorded listing** (`etsy-optimize-listing`, `etsy-seasonal-keywords`,
or any ad-hoc title/tags/description/price edit) — this store isn't
write-once at creation, it stays current for the listing's whole life. This
is a **local data store**, not an Etsy API resource — read/write it with the
ordinary Read/Write/Edit file tools, never through an `etsy` MCP tool.

## Why this exists, and how it differs from product templates

This is **mandatory, not opt-in** — unlike `product-templates-guide.md`
(which is a reusable *recipe* for a product, saved only if the user says yes
and only really useful for supplier-sourced products), every listing this
system creates gets an as-built record automatically, no asking, and that
record is kept in sync for as long as the listing exists. The two stores
serve different purposes and are not a replacement for each other:

- **`data/products/<Supplier> products/<slug>.json`** (product templates) —
  the reusable recipe, keyed by *product* (source URL), spans every account
  it's ever been published to.
- **`data/listings/<account>/<listing_id>.json`** (this store) — the
  as-built, kept-current record of one specific live Etsy listing, keyed by
  *account* then *listing_id*, one file per listing regardless of whether it
  came from a saved template, fresh research, or a simple no-variant draft.

If a listing was built from a product template, cross-reference it
(`product_template_ref`) rather than duplicating the whole recipe — this file
is the *instance* record, not a second copy of the reusable data.

## File location — one folder per listing, nested under one folder per connected account

**Updated 2026-07-31 (explicit user instruction): this store is now
folder-based, not a flat file per listing.** Every physical listing gets its
own folder so its record and its actual media (images/video) live together
as one self-contained, portable unit, decoupled from wherever the source
image files were originally staged (`Add Product/AliExpress/`,
`Add Product/Merchize/`, `Add Product/Custom/`, or any other path given at
upload time):

```
../../../data/listings/<account>/<listing_id>/
  record.json      (this file's schema, unchanged in shape — see below)
  images/
    01.jpg
    02.jpg
    ...
  video/
    video.mp4       (only present if the listing has one)
```

`<account>` is the exact connected-account name from `accounts.json`/
`list_accounts` (e.g. `itrat_etsy`) — every account still gets its own
subfolder, so a shop with 3 connected accounts ends up with 3 subfolders
under `data/listings/`, never one flat mixed folder.

**Why this exists:** the old flat-file schema recorded an image's Etsy-side
`listing_image_id` but never the local file it was uploaded from — so if a
listing's account ever went offline/suspended, Etsy's own hosted copies
become unreachable too, and there was no way to recover the actual photo
without manually re-matching listings to whatever staging folder they might
still sit in. Copying the file into the listing's own `images/`/`video/`
folder at upload time, and pointing `source_path` at that copy (not the
original), means the listing survives regardless of what happens to the
original staging folder or the Etsy account itself.

**The sync rule this replaces:** any time `upload_listing_image`/
`upload_listing_video` succeeds, download or copy that exact file into this
folder (not just record its Etsy CDN URL) — the copy is the durable one,
never a live URL. Naming convention: images as `01.jpg`, `02.jpg`, ... in
rank order; video as `video.mp4`.

**Digital listings stay on the old flat-file convention**
(`data/listings/<account>/<listing_id>.json`, no folder). Etsy's API has no
way to fetch a digital listing's actual buyer-download file content
(`get_all_listing_files`/`get_listing_file` return only filename/size, never
a download URL) — so there is nothing to put in an `images`-style local
media folder for the deliverable itself. Don't invent a `files/` folder or a
download URL for these; a missing local copy of the deliverable is an Etsy
API limitation, not a bug in this store.

Gitignored, like `accounts.json`/`tags-database.json`/`data/products/`.

## Schema (`record.json`, or the flat `<listing_id>.json` for digital listings)

```json
{
  "listing_id": 0,
  "account": "<connected account name>",
  "shop_id": 0,
  "url": "<etsy listing URL>",
  "state": "draft | active | inactive",
  "type": "physical | download | both",
  "product_template_ref": "<data/products/<Supplier> products/<slug>.json filename, or null if not template-sourced>",
  "created_date": "<ISO date>",
  "last_updated": "<ISO date>",
  "listing_data": {
    "title": "...",
    "tags": ["..."],
    "description": "...",
    "price": 0,
    "quantity": 0,
    "who_made": "...",
    "when_made": "...",
    "taxonomy_id": 0,
    "materials": ["..."],
    "styles": ["..."],
    "shipping_profile_id": 0,
    "readiness_state_id": 0,
    "return_policy_id": 0,
    "processing_min": 0,
    "processing_max": 0
  },
  "variants": [
    {"sku": "...", "values": {"<axis name>": "<value>"}, "price": 0, "quantity": 0}
  ],
  "images": [
    {"listing_image_id": 0, "rank": 1, "alt_text": "...", "source_path": "data/listings/<account>/<listing_id>/images/01.jpg"}
  ],
  "video": {"video_id": 0, "source_path": "data/listings/<account>/<listing_id>/video/video.mp4"},
  "research": {
    "avg_price": 0,
    "landed_price_band": "<e.g. \"$18-24\">",
    "suggested_price": 0,
    "researched_at": "<ISO date>"
  }
}
```

`research` is optional — only present when the listing was created via a
path that ran `etsy-new-listing-copywriter`'s Phase 1 (directly, or reused
by `etsy-create-listing`/`etsy-copy-listing`). Omit the whole object (or
leave it `null`) for listings created without research. This turns the
one-time price recommendation in the copy report into a durable reference:
`etsy-listing-qa-check` can warn later if the live price has drifted well
outside the recorded band with no explanation, instead of the research
being forgotten the moment the report scrolled away.

`variants: null` for a no-variant listing. `images: []` for a photo-less
draft (still write the file — an incomplete listing is still worth a record,
and it makes "which drafts still need photos" answerable by scanning this
folder later).

## When to write it — at creation, incrementally

Write/update this file **after every successful write** in the creation flow,
not only once at the very end — a listing built across several turns (or
interrupted mid-flow) should still have an accurate partial record at
whatever point it stopped:

1. **Right after `create_draft_listing` succeeds** (Step 4 of
   `etsy-create-listing`, or the equivalent point in
   `etsy-new-listing-copywriter`'s own draft-creation path): for a physical
   listing, create the folder `data/listings/<account>/<listing_id>/` and
   write `record.json` inside it with `listing_data` filled in,
   `variants: null`, `images: []`; for a digital listing, create the flat
   file `data/listings/<account>/<listing_id>.json` instead (see the
   digital-listings note above). If Phase 1 research ran for this listing,
   also fill in `research` from its price findings
   (`avg_price`/`landed_price_band`/`suggested_price`, `researched_at` =
   today); otherwise omit the field.
2. **After `update_listing_inventory` succeeds** (Step 5, if the listing has
   variants): update `variants` with the full combination list.
3. **After each `upload_listing_image` succeeds** (Step 6): copy/download
   the exact uploaded file into that listing's `images/` folder (named by
   rank, e.g. `03.jpg`), then append `{listing_image_id, rank, alt_text,
   source_path}` to `images` in `record.json` — the `source_path` must point
   at that copy, not the original upload path. Same pattern for
   `upload_listing_video` into `video/video.mp4`.
4. **After `state` changes** (e.g. publishing to `active` via
   `update_listing`): update `state`.

## Keeping it current — sync on every later update too, not just creation

This is the part that makes the store worth trusting: **any time
`update_listing`, `update_listing_inventory`, `upload_listing_image`,
`delete_listing_image`, or `upload_listing_video` succeeds against a
`listing_id` — check whether a record exists (`data/listings/<account>/
<listing_id>/record.json` for physical, `data/listings/<account>/
<listing_id>.json` for digital — it will, for anything this system created)
and update the changed fields in place.** This applies regardless of which
skill made the call:

- `etsy-optimize-listing` rewrites title/tags/description/price → update
  `listing_data.title`/`tags`/`description`/`price` in that listing's record.
- `etsy-seasonal-keywords` rotates seasonal tags in and back out → update
  `listing_data.tags` both times (the record should reflect what's live
  *right now*, not what was live when the listing was first created).
- Any other ad-hoc `update_listing` call (price change, description tweak,
  publishing a draft, deactivating a listing, etc.) → update whichever
  `listing_data`/`state` fields actually changed.

Only touch the fields that were actually part of the update call — don't
overwrite the rest of the record with stale assumptions. If a record doesn't
exist yet for a listing being updated (e.g. it predates this store, or was
created outside this system), create one from the listing's current full
state (`get_listing`) rather than skipping the sync — a late-started record
is better than no record.

Each of these writes is a plain file write alongside the already-confirmed
Etsy API call — it needs no separate user confirmation of its own (it's not a
write to Etsy, it's local bookkeeping), but do mention briefly that the
record was synced so the user knows it's happening (a short aside is enough,
not a whole report section). Always bump `last_updated`.

## Manual resync from live Etsy state — a standing, on-demand capability

Beyond the automatic sync-on-write above, the user can explicitly ask to
resync a record (or every record) against Etsy's actual current state at
any time — most commonly after editing a listing by hand in Etsy's own UI
(title/tags/price changed outside this system entirely). Both forms below
are read-only against Etsy (no confirmation needed, same as any `get_*`
call) and end in a local file overwrite (also no confirmation needed — this
store's writes are local bookkeeping, never an Etsy API write):

- **Single listing** — "update/sync `<listing_id>`'s file", "check listing X
  against Etsy": re-fetch the listing's full current state (`get_listing`
  with `includes: [Images, Videos, Inventory]`, plus
  `get_listing_personalization`) and overwrite `listing_data`, `variants`,
  `images`, `personalization`, and `state` in that listing's record to match
  exactly. State what actually changed (e.g. "tags and title were edited
  manually on Etsy since last sync — updated") rather than silently
  rewriting the file with no summary.
- **Whole catalog** — "check all my listings for updates", "sync anything
  that's out of date": enumerate every record already on disk under
  `data/listings/<account>/` plus every currently active/draft listing from
  `find_all_active_listings_by_shop` that has no record file yet (create
  those fresh, per the "if missing, create" rule above) — then re-fetch each
  listing's live state and diff it against the recorded state field by
  field. Only rewrite records that actually drifted; report a short summary
  (which `listing_id`s changed and roughly what changed in each — title,
  tags, price, state, etc.), not a wall of per-listing detail for listings
  that hadn't drifted at all. For a shop with many listings, batch the reads
  (`get_listings_by_ids`/`get_listings_inventory_by_ids` take multiple IDs
  per call) or fan out a few parallel calls rather than one listing at a
  time serially — mind the 5 req/s rate limit either way.

## Blind spots — state plainly

- If the listing is edited directly in Etsy's UI or by another tool/session
  outside this system, this file goes stale until either the next update
  made *through* this system syncs it, or the user explicitly asks for a
  manual resync (see above). Treat it as a fast local reference for *this
  system's own history*, not an unconditional live source of truth —
  re-fetch from Etsy (`get_listing`/`get_listing_inventory`) before relying
  on exact current values for anything consequential.
- Numeric IDs recorded here (`shipping_profile_id`, `readiness_state_id`) are
  specific to this one listing's account/shop — never reuse them when
  building a *different* listing on a *different* account, even if it's the
  "same" product (that's what `product_template_ref` and the product
  template's own account-agnostic shape are for).
