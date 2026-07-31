# Product Registry — cross-account publish tracking

Referenced by every skill that creates or clones a listing on any connected
account (`etsy-create-listing`, `etsy-copy-listing`, `etsy-new-listing-copywriter`
when it drafts directly) — and by anyone asking "has product X been published
to account Y yet?" before starting a new publish. This is a **local data
store**, not an Etsy API resource — read/write it with the ordinary
Read/Write/Edit file tools, never through an `etsy` MCP tool.

## Why this exists

`product-templates-guide.md` already tracks `published_listings` per saved
recipe, but only for products that were explicitly saved as a reusable
template (opt-in, and only worth the overhead for supplier-sourced products
with real variant/pricing structure). Most listings in this shop were never
turned into a full template — they're one-off drafts, or the copy was cloned
by hand. Those still need a fast answer to "is this product already on
account X" without re-reading dozens of individual listing records every
time. The registry below is that fast index: **one row per underlying
product design, with every account/listing_id it's been published to** —
lighter than a product template (no recipe/pricing data), but covers every
listing, not just templated ones.

- **`data/products/<Supplier> products/<slug>.json`** — the reusable recipe
  for supplier-sourced products (opt-in).
- **`data/listings/<account>/<listing_id>.json`** — the as-built record of
  one specific live listing (mandatory, every listing).
- **`data/product-registry.json`** (this file) — the cross-account index:
  which `product_id` values exist, and which accounts/listing_ids carry each
  one. Mandatory, every listing gets a `product_id`, whether or not it also
  has a product template.

## File location

`../../../data/product-registry.json`, relative to any
skill's own folder — same resolution pattern as the other shared data
stores. Gitignored, like the other data stores under `data/`.

## Schema

```json
{
  "schema_note": "<plain-language description>",
  "last_built": "<ISO date of last full rebuild>",
  "connected_accounts": ["itrat_etsy", "abbas_etsy"],
  "products": [
    {
      "product_id": "<stable kebab-case slug, e.g. \"welcome-sign\">",
      "product_name": "<human name>",
      "product_template_ref": "<data/products/<Supplier> products/<slug>.json, omit if no template>",
      "listings": [
        {"account": "<connected account name>", "listing_id": 0, "state": "draft | active | inactive | not_found_on_etsy"}
      ],
      "accounts_published": ["<every distinct account name in listings, for a quick membership check>"],
      "needs_resync": true,
      "note": "<flag uncertain matches, duplicates, or anything a human should double-check>"
    }
  ]
}
```

`product_id` is also stamped onto **every** listing record
(`data/listings/<account>/<listing_id>.json`) as a `product_id` field
(placed right after `product_template_ref`) — this is the "every file
carries an ID" half of the system: given just a listing record, you can see
its `product_id` immediately without opening the registry; given the
registry, you can see every account a `product_id` has reached without
opening 92 listing files. Both directions should always agree — if a listing
record's `product_id` doesn't match the registry entry that lists it,
something drifted; fix whichever side is stale.

## When to check it — before starting a new publish

Before running `etsy-create-listing`/`etsy-copy-listing` (or any ad-hoc
"publish this to account X" request), search `product-registry.json` for a
`product_id` whose `product_name` or a member listing's title obviously
matches the product being requested. If found:

- Show the user: which accounts already carry it (`accounts_published`),
  and the specific `listing_id`/state per account.
- If the target account is already in `accounts_published`, say so plainly
  before proceeding — the user may not have intended a duplicate.
- If the target account is missing, this is exactly the gap the user is
  trying to fill — proceed with the publish flow normally (this registry
  doesn't skip any research/confirmation step, it's just the lookup that
  tells you the gap exists).

If no match exists, say so and proceed — nothing to reuse from the registry
side (a matching product template, if one exists, may still apply per
`product-templates-guide.md`).

## When to update it — every successful create/clone, no confirmation needed

Same local-bookkeeping reasoning as the listings-record store: this is never
an Etsy write, so no separate user confirmation is needed, but do it in the
same turn as the confirmed Etsy write it followed, every time:

1. **New product, first listing anywhere**: add a new entry with a freshly
   slugged `product_id` (kebab-case from the product name; if the slug
   collides with an existing one, disambiguate — e.g. append a short
   distinguishing word, not a number), one `listings` entry, and
   `accounts_published` set to that one account.
2. **Existing product, new account**: append to that product's `listings`
   array and `accounts_published`, don't create a second entry for the same
   design.
3. **Either way**: stamp the same `product_id` onto the new listing's own
   record file (`data/listings/<account>/<listing_id>.json`).
4. Bump `last_built` only on a full rebuild (see below); a single incremental
   add doesn't need it, though it's harmless to bump.

## Matching products across accounts — judgment, not string equality

Titles are **never** cloned verbatim across accounts (every create/copy flow
runs fresh research per `etsy-seo-standards.md`), so "same product" has to be
recognized by overlapping distinctive phrases, shared images, or a common
`product_template_ref`/`cloned_from` field — not an exact title match. When
building or updating this registry:

- A shared `product_template_ref` across two listing records is the
  strongest signal — always the same product_id.
- A `cloned_from` field on a listing record (present when a listing was
  bulk-cloned from another account) is equally strong — same product_id as
  the source listing.
- Absent either, match on distinctive repeated phrases between titles (e.g.
  "Breathable Mesh Dog Clothes Game Day Outfit" appearing in both titles,
  just reordered) — generic phrases shops reuse everywhere ("gift for her",
  "unisex", "streetwear") don't count as a match signal by themselves.
- **When genuinely unsure** (e.g. same theme but a different garment
  construction — a zip hoodie vs. a pullover hoodie), do NOT merge into one
  product_id. Keep them as separate entries and add a `note` on each cross-
  referencing the other, flagging it for the user to confirm. A false merge
  is worse than two entries that turn out to be the same thing later — a
  missed "this account doesn't have it yet" is exactly the failure mode this
  registry exists to prevent.
- A listing record with a placeholder title (e.g. `"Listing 4493991466"` or
  `"Digital SVG Listing <id>"`) hasn't been synced with its live Etsy state —
  set `needs_resync: true` and don't guess a `product_id` beyond
  `unresolved-<listing_id>`; resync the record first (see
  `listings-record-guide.md`'s manual resync section), then re-run the match.

## Full rebuild — on-demand, not automatic

Unlike the incremental update above, a full rebuild (re-deriving every
`product_id` from scratch across every account's `data/listings/` folder) is
a heavier, judgment-driven pass — only do it when explicitly asked ("rebuild
the registry", "recheck all my listings for cross-account matches") or when
a new account is connected and its whole listing history needs folding in
for the first time. Read every listing record's title (and
`product_template_ref`/`cloned_from` if present) across every connected
account, group by the matching rules above, and write the whole
`products` array fresh — then re-stamp `product_id` on every listing record
file so both sides of the system agree. Report the itrat_etsy-vs-abbas_etsy
(or whichever accounts) coverage gap plainly: which products exist on one
account but not the other, and flag any uncertain merges for the user to
confirm rather than silently deciding.

## Blind spots — state plainly

- Matching is judgment-based text similarity, not a guaranteed-correct
  algorithm — a handful of entries in any given build will be genuinely
  ambiguous (see the "when genuinely unsure" rule above). Always surface
  those via `note`, never silently pick a side.
- A product's `listings` array can include a `not_found_on_etsy` or
  deleted/inactive state — a listing that no longer exists live still counts
  as "this account has tried this product before," which is useful context,
  so don't drop it from the registry just because it's not currently active.
- This registry doesn't replace `product-templates-guide.md` — a product can
  (and often will) have both a `product_template_ref` in its registry entry
  *and* a full recipe file; the registry is the fast index, the template is
  the reusable recipe.
