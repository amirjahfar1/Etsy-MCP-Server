# System changelog

Every system change (skills, guides, scripts, server code, rules) bumps `system-version.json` and adds an entry here. The upgrade script
(`scripts/upgrade.mjs`) prints the entries between the installed version and the new one, so each entry says what changed **and what, if
anything, must be done by hand** ("Migration"). Format: `## [version] - date`.

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
