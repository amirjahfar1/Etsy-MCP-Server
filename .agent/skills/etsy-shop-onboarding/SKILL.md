---
name: etsy-shop-onboarding
description: >-
  Onboards an Etsy shop onto this system and builds its "Shop DNA" (niche, buyer, brand voice,
  price band, suppliers, rules) saved to data/shops/<account>/shop-dna.json so every other skill
  knows what the shop is. First asks whether the shop is NEW or already RUNNING. NEW shop: asks a
  short set of high-value questions (category/niche, what it sells and how it is sourced, buyer,
  style, price tier, shipping origin, shop name, owner facts), then writes the full setup kit
  (shop title, announcement, About story, tagline, section names, policies text, FAQ, sale
  message, logo/banner brief) and starts the 7-day launch plan. RUNNING shop: reads the live shop
  (listings, sections, policies, profiles, reviews) and infers the DNA from what is actually
  there, then confirms it with the user. Trigger on: "onboard this shop", "new shop setup",
  "shop setup karo", "naya shop add kiya hai", "register the shop and set it up", "about section
  likho", "shop ka about/policies/announcement likh do", "shop ka DNA save karo", "is shop ko
  samjho", "7 day launch plan", "aaj launch plan me kya karna hai", "launch day N", and right after
  a new account is connected with oauth-setup. Also trigger when another skill finds the account
  has no shop-dna.json. Reads are free; every Etsy write (update_shop, create_shop_section,
  shipping/processing/return profiles) is confirmed first with a full table.
---

# Etsy Shop Onboarding — Shop DNA + Setup Kit + 7-Day Launch

Goal: after this skill runs, (1) the system **knows the shop** — `data/shops/<account>/shop-dna.json`
(schema in `../_shared/shop-dna-guide.md`) — and (2) a new shop has a complete, honest, copy-ready storefront
and a 7-day plan (`../_shared/launch-7day-playbook.md`).

**Standing limits to keep in mind, and say plainly when relevant:**
- `update_shop` writes only `title`, `announcement`, `sale_message`, `digital_sale_message` (and `policy_additional` for EU
  shops). **About story, logo, banner, team, policies (returns/cancellations/privacy), and production partners have no
  API write** — hand the user exact text/briefs to paste into Shop Manager. Never imply otherwise.
- Etsy's docs give **no numeric limit** for shop `title`/`announcement`. Keep the title ≤55 chars and announcement ≤160
  chars (conservative, unverified; if `update_shop` rejects a length, record the real limit in CLAUDE.md per the
  "API error → document it" rule). Section names: **≤20 chars** (confirmed live).
- Never invent owner facts. The About story is built **only** from facts the owner gave. If the owner gave none, write
  a values/process story from the DNA and mark every sentence that needs a real fact as `[OWNER TO CONFIRM]`.
- Etsy's Creativity Standards matter: a shop that resells supplier items must use production-partner disclosure
  (`../_shared/etsy-production-partners-guide.md`) and must not claim "handmade by me". Don't write copy that claims it.
- The 2026-10-07 data: two earlier accounts were permanently suspended/deactivated for IP and reselling issues. In new-shop
  mode, say once, briefly, which niches carry that risk (licensed characters, brands, celebrity/sports names) before the
  product list is chosen.

Pass `account` on every Etsy tool call (CLAUDE.md "Session account context").

## Step 0 — Which account, and is it already onboarded?

1. `list_accounts` → confirm the account is `active`. A deactivated account stops here (tell the user how to reactivate:
   `set_account_status`).
2. Look for `data/shops/<account>/shop-dna.json`.
   - **Exists** → show a 6-line summary (niche, buyer, price band, voice, last_updated, checklist % done) and ask:
     *update it / re-read the live shop and refresh the snapshot / just continue the launch plan.* Don't re-interview.
   - **Missing** → continue.
3. **Ask first, before anything else:** *"Is this a new shop (not set up yet) or a running shop (already has listings/setup)?"*
   Use `AskUserQuestion` (options: New shop · Running shop). If `get_shop` shows `listing_active_count` > 0 but the user
   says "new", mention the count and confirm — it may be half set up (treat as **running**, it avoids re-writing live text).

## Step 1A — NEW shop: the question set

Ask in **two short rounds with `AskUserQuestion`** (max 4 questions each), then one free-text round. Only these — each
one changes what gets written. Don't ask what `get_shop`/`list_accounts` already answers (name, currency, country).

**Round 1 — what the shop is**
1. **Category / niche** (multi-select; the "other" box covers anything): Jewelry · Clothing & apparel · Home decor / wall
   art · Personalized gifts · Accessories & bags · Digital products · Other. Then ask for the **specific niche in a few
   words** ("gothic silver rings for men", "cottagecore dresses") — the category alone is too broad to write copy for.
   *Digital:* check CLAUDE.md first — `abbas_etsy` may not list digital products; apply that rule, don't just proceed.
2. **What it sells and how it's produced**: AliExpress/other supplier dropship · Merchize/Printify print-on-demand ·
   handmade by the owner · in-house print/embroidery · digital files · mix. This decides `who_made`, the production-partner
   requirement, the shipping profile pattern, and the image rules.
3. **Target buyer**: who buys (women / men / unisex / gift buyers), age range, and main countries (default US/UK/CA/AU).
4. **Price tier**: budget (<$20) · mid ($20-50) · premium ($50+). Ask for the target margin only if they volunteer it;
   otherwise default to "price below the researched competitor average" (CLAUDE.md step 3b).

**Round 2 — brand and logistics**
5. **Style / vibe**: pick up to **two** from `../_shared/etsy-aesthetic-styles-guide.md` (offer the 4 most likely for the
   chosen niche as options; the rest via "other"). Explain it feeds the listings' `styles` field.
6. **Ships from + speed**: country the parcels ship from, and processing time (default 3-5 days) / transit expectation.
7. **Shop name**: *already chosen* (give it) · *need ideas*. If ideas: produce 8, each checked with `get_shop_by_name`
   (a `found:false` means no exact match — still tell the user Etsy does the final availability check at registration;
   the tool uses fuzzy search). Avoid brand/trademark-adjacent names.
8. **Assets on hand**: logo · banner · product photos · a video · none. Decides which Day-2 tasks are `user` vs brief-only.

**Round 3 — free text (one message, all optional)**
9. *"Owner facts for the About page: who is behind the shop, why this niche, anything real about the process (2-3 lines is
   enough)."* and *"Anything we must never sell or never say?"* → `identity.never_sell`, `brand.avoid_words`,
   `rules_for_claude`.

**Category-specific follow-up (one extra question, only for the chosen category):**
- Jewelry: metal/finish and stones, men/women/unisex, sizes offered. (Jewelry rules in CLAUDE.md apply: shared jewelry
  shipping profile, `someone_else` + production partner, style matching.)
- Clothing: men/women/unisex, size range, print method (DTG / embroidery / supplier-printed).
- Home decor / personalized gifts: is personalization offered, what the buyer enters (name/date/photo).
- Digital: file types, license terms, instant-download delivery message.

Stop asking once these are answered. If an answer is unclear, ask **that one** question again — never guess a niche.

## Step 1B — RUNNING shop: read it, infer the DNA

**Reading is delegated to a Haiku sub-agent** (CLAUDE.md model-usage rule) — `Agent` with `model: "haiku"`, told to make only
read-only calls with `account: <account>` and return compact JSON, not raw dumps:
`get_shop`, `get_shop_sections`, `get_shop_shipping_profiles` (+ `get_shipping_profile_destinations` per profile),
`get_processing_profiles`, `get_shop_return_policies`, `get_shop_production_partners`, `get_listings_by_shop`
(`state: active`, page through up to 100), `get_shop_reviews` (limit 50), and a count-only `get_shop_receipts` (last 90 days).
From listings return per listing: `listing_id, title, price, taxonomy_id, tags, who_made, state, views, num_favorers, section`.

Then **you (the main model) infer the DNA** — judgment, not extraction:
- `niche_primary` / `categories` / `sub_niches`: dominant taxonomy + most frequent title/tag vocabulary.
- `product_types`, `physical_or_digital`, `business_model` (infer from `who_made`, production partners, profile names), `suppliers` (cross-check `data/product-registry.json` `sources` for this account's listings).
- `audience`: from tags (recipient/occasion words), review text, shipping countries.
- `commercial.price_band`: min / median / max of active listings; processing and shipping defaults from profiles.
- `brand.aesthetic_styles`: match the dominant look to the aesthetic guide (open 2-3 listing images with Read when the style isn't obvious from text).
- `live_snapshot` + `setup_checklist`: from what exists (announcement present? sections? banner/logo url? policies non-null?).
- **Drift**: compare live `shop_name` to `accounts.json`; if different, record it and tell the user (don't edit `accounts.json` without asking).

Show the inferred DNA as one table (`Field | Inferred value | Evidence`), flag low-confidence rows, ask the user to correct
anything wrong **and** to fill only the fields that can't be inferred (typically `never_sell`, voice, owner story facts).
Save with `dna_source: "both"` for corrected fields. A running shop does **not** get the 7-day plan unless the user asks;
instead run `etsy-storefront-audit` / `etsy-audit-account` afterward and offer them.

## Step 2 — Write `shop-dna.json`

Create/update `data/shops/<account>/shop-dna.json` per the schema. Local bookkeeping — no confirmation. Unknown = `null`.
Tell the user one line: where it was saved and which three fields most affect future listings.

## Step 3 — NEW shop: the Setup Kit

Present **one table per asset**, copy-ready, grounded in the DNA (voice, buyer, styles). All text passes the Copy QA Gate in
`../_shared/etsy-seo-standards.md` (no em dashes, plain grade 5-7 English, no AI-tell phrases, no "AliExpress/dropshipping/1688"
anywhere buyer-visible). Give every asset an `Etsy field | Writable via API?` column so the user sees what Claude will apply vs. what
they paste.

| Asset | Content | API-writable? |
|---|---|---|
| Shop title (≤55) | one line with the niche keyword + brand promise | yes — `update_shop` |
| Announcement (≤160) | what the shop sells, who for, shipping/processing promise | yes — `update_shop` |
| Sale message | thank-you + what happens next + delivery expectation + invite to message | yes — `update_shop` |
| Section names (≤20 chars each, 4-6) | derived from `sub_niches`, buyer-friendly, not keyword-stuffed | yes — `create_shop_section` |
| Tagline | few words | no — Shop Manager |
| About story (≤5,000 chars) | brand story, process, why trust us; `[OWNER TO CONFIRM]` for unconfirmed facts | no — paste |
| FAQ (5-7 Q&As) | processing/shipping time, sizing or care, personalization, returns, contact | no — paste |
| Policies: shipping · returns · cancellations | short, consistent with the actual profiles/return policy ids; matches the DELIVERY TIME FRAME block wording | no — paste |
| Policies: privacy | a **sample for the owner's own legal judgment** — never presented as legal advice (setup guide) | no — paste |
| Vacation / auto-reply message | polite, states return date placeholder | no — paste |
| Logo brief | 500×500 min, mood, colours, no brand marks | no — upload |
| Banner / featured-photo brief | 760×468 crop, up to 5 shots with what each should show (workshop/process/product/packaging) | no — upload |
| Shop-name ideas (if requested) | 8, each `get_shop_by_name`-checked | n/a |

Check consistency before showing: title, announcement, About, and FAQ must tell **one** story (same buyer, same promise);
shipping/returns wording must match the real profile and `return_policy_id` (read them; if none exist yet, say they are Day-1 tasks).

**Applying (the only Etsy writes in this step):** after the user approves the kit, confirm each write with the table format
(`Field | Old | New`) and wait for an explicit yes — `update_shop` (title, announcement, sale_message) and `create_shop_section`
(one section per call; ≤20 chars; a batch may be approved as one table). Then update `setup_checklist` in the DNA.

## Step 4 — NEW shop: start the 7-day launch plan

1. Ask for the start date (default: tomorrow) and confirm.
2. Create `data/shops/<account>/launch-plan.json` from `../_shared/launch-7day-playbook.md` (all tasks `todo`, `current_day: 1`).
3. Show **Day 1 only**: the tasks, who owns each, and the first thing to do now. Mark tasks already satisfied by what the
   live shop already has (e.g. payments onboarded, a profile exists) as `done`.
4. From then on, whenever the user says "launch plan / aaj ka task / day N / next", read `launch-plan.json`, show only the
   current day's open tasks, name the next one, and run the corresponding skill. When a `user`-owned task comes up, ask whether
   it's done — never tick it yourself.

## Step 5 — Hand-offs (offer, don't auto-run)

- Products to list → `etsy-create-listing` (reads the DNA first; title via the rank-first guide).
- Price/niche questions → `etsy-niche-scanner`, `etsy-pricing-audit`.
- Finished shop → `etsy-storefront-audit` + `etsy-audit-account` for the baseline (Day 7).
- Before publishing → `etsy-risk-scan`, `etsy-listing-qa-check`.

## Output shape (keep it scannable)

1. One-line verdict ("Anas = running jewelry shop, 11 listings, inferred DNA ready to confirm").
2. The question round **or** the inferred-DNA table.
3. Setup-kit tables (new shop) with the API-writable column.
4. "Saved:" line (paths), then **Today's tasks** (Day 1) or the audit offer.

## Honest limits

- No traffic/conversion API: the DNA captures *what the shop is*, not what is working. Per-listing `views`/`num_favorers`
  snapshots (via `etsy-sync-check`) and the owner's Etsy Stats CSV are the only performance signal.
- DNA built from a live shop is an inference — it is shown, corrected, then saved; it is never saved unreviewed.
- Banner/logo/About/policies cannot be written by this system; the skill drafts, the owner pastes.
