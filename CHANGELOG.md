# System changelog

Every system change (skills, guides, scripts, server code, rules) bumps `system-version.json` and adds an entry here. The upgrade script
(`scripts/upgrade.mjs`) prints the entries between the installed version and the new one, so each entry says what changed **and what, if
anything, must be done by hand** ("Migration"). Format: `## [version] - date`.

## [2.4.0] - 2026-10-21
- **Every new listing starts by asking for the product folder path** (CLAUDE.md STRICT rule, gate A0, Step 0 of `etsy-create-listing`): never guessed, and everything in the folder (images, video, text/instruction files, sheets, documents) is used. New `scripts/product-folder.mjs` resolves the path on any OS (absolute, `~`, relative, or just the folder name under `Add Product/`, also with `[draft]`/`[active]`/` - created`) and prints the full inventory, all text, the featured/size-chart/AI-looking files and the intake check.
- Migration: none.

## [2.3.0] - 2026-10-21
One better intake template for every product, checked before listing.
- `templates/product-details/product-details.txt` (v2, "KEY: value", [REQUIRED]/[BEST]/[CLAUDE] tags) replaces the separate AliExpress and Jewelry templates and adds source, buyer/occasions, USPs, keywords, risk answers (brand/AI/watermark), dimensions, cost/price, personalization details, media notes and apparel/digital extras. The stale shipping/return lines are removed.
- `scripts/check-product-details.mjs` (missing required fields, conflicts, margin), `scripts/new-product.mjs` (create a product folder, `--refresh-templates` for the local `_template` copies).
- Migration: run `node scripts/new-product.mjs --refresh-templates` to refresh your local `Add Product/*/_template` files (old ones are saved as `product-details.backup-<time>.txt`); products already filled in the old format keep working, Claude reads them as before.

## [2.2.0] - 2026-10-21
Complete live-listing sync, exact clone to another account, new-listing checklist.
- **Complete local copy of live listings**: new MCP tools `get_listing_snapshot` (everything about up to 10 listings in one labelled call) and `get_shop_profiles`; `scripts/ingest-snapshot.mjs` builds
  `raw/snapshot.json`, a full `record.json` (variants, personalization, profiles, buyer price...) and **downloads the image/video files**; `local-integrity` flags `no-snapshot` / `snapshot-incomplete` / `media-not-downloaded`.
- **Exact clone** (`etsy-clone-exact`, `scripts/clone-plan.mjs`, `scripts/clone-verify.mjs`): a listing is copied to another account field for field; only Etsy's own hard limits can stop it, everything else is a warning.
- `_shared/new-listing-requirements.md`: one page of what a new listing needs (owner vs system vs Etsy).
- Migration: rebuild the MCP server (`node scripts/setup.mjs`) and **restart Claude/Antigravity** so `get_listing_snapshot` / `get_shop_profiles` appear. Existing records stay valid; run a deep sync (`etsy-sync-check`, Layer 2b) to turn legacy records into complete ones.

## [2.1.0] - 2026-10-21
Evidence-based listing optimization, actual sale prices, upgrade system.
- **Titles use the full allowed length** (target 135-140, never above 140), filled with distinct evidenced keyword phrases, never padding (owner decision).
- **Rank-first titles are data-driven**: `scripts/keyword-stats.mjs` (exact-phrase metrics, term type, tag tiers/slots, like-for-like and **sale-price** statistics,
  rank gradient, own-shop gaps), `scripts/term-file.mjs`, `scripts/merge-buyer-prices.mjs`; research lives in `data/research/<category>/<date>/`.
- **Tag slot model** + ready-made 13-tag templates (`_shared/tag-templates.md`); tag tiers replace the "half the sample" bar; tags database gets `source: market|own`.
- **Actual sale price**: new MCP tool `get_buyer_prices` (list price, sale price after promotions, discount %, end date) and upgraded `search_listings`
  (`currency`, `taxonomy_id`, `buyer_country`, `include_description`, `original_created`, `num_favorers`...). Every price analysis reports list AND sale price. The pricing rule itself is unchanged: the owner decides prices.
- **Measurement loop**: `_shared/measurement-guide.md`, weekly snapshots now carry `title_hash`/`tags_hash`, change log `data/metrics/<account>-changes.jsonl`.
- **Compatibility rule** (macOS + Windows, Claude + Antigravity) in CLAUDE.md; `setup.mjs --check` verifies both skill copies match.
- **Upgrade system**: `scripts/upgrade.mjs`, `UPGRADE.md`, skill `etsy-system-upgrade`.
- Migration: rebuild the MCP server (`node scripts/setup.mjs`) and **restart Claude/Antigravity** so the new `get_buyer_prices` / `search_listings` arguments appear. No data migration needed (all new data files are created on first use).

## [2.0.0] - 2026-10-07
Shop lifecycle, risk and cross-platform setup.
- New skills: `etsy-shop-onboarding` (Shop DNA, setup kit, 7-day launch plan), `etsy-risk-scan`, `etsy-sync-check`, `etsy-setup`; `_shared/listing-gates.md` (one ordered gate checklist).
- Helper scripts ported to Node (`local-integrity`, `sync-diff`, `risk-prefilter`); cross-platform `scripts/setup.mjs` (+ `setup.sh`, `setup.cmd`), `SETUP.md`, `AGENTS.md`/`GEMINI.md`/`.agent/rules` for Antigravity.
- Branded-product rule: ask once, the user's yes is final. Media is uploaded by Claude as part of listing creation.
- Migration: run `node scripts/setup.mjs` (Python helper scripts are gone; Node >= 18 required). New data folders (`data/shops`, `data/metrics`...) are created on first use.

## [1.0.0] - 2026-07
Initial system: Etsy MCP server (multi-account), 23 skills, local data store (`data/`), Windows + Claude only.
- Layout change 2026-07-31: the data store moved from `etsy-mcp-server/data/` to `data/` at the project root and staging to `Add Product/`.
  `scripts/upgrade.mjs` moves a leftover `etsy-mcp-server/data/` to `data/` when `data/` does not exist.
