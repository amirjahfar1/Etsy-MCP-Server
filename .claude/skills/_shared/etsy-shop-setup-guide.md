# Etsy shop setup & policies — official Etsy Help Center facts

Confirmed straight from Etsy's own Help Center (fetched 2026-08-06):
"How to Edit Your Shop's About Section", "How to Display Team Members in your Shop
About Section", and "How to Set Up Your Shop Policies". Reference this when auditing
a shop's storefront completeness (`etsy-audit-account`, `etsy-storefront-audit`) or
when the user asks what their About section / shop policies should contain.

## Important: none of this is API-writable

**`update_shop` (the only shop-settings write tool this project has) only writes
`title`, `announcement`, `sale_message`, `digital_sale_message`, and `policy_additional`
(EU shops only).** Everything below — the About section's story/logo/video/photos, shop
team members, and the Returns/Cancellations/Privacy policy tabs — has **no write endpoint
in Etsy's Open API at all**. A skill can read shop state (`get_shop`,
`get_shop_return_policies`) and tell the user exactly what to add/fix, but must never
imply it can write these fields directly — hand the user the exact text to paste into
Shop Manager instead (same pattern CLAUDE.md already documents for `policy_payment`/
`policy_shipping`/etc.).

## About section — what it's for and what it holds

The About section is the shop homepage story: creative process, workspace, team,
collaborators. Buyers reach it by scrolling the shop homepage or the About tab in the
app. Edited in Shop Manager → Settings → Your shop → Shop home editor (or the pencil
icon next to the shop name under Sales Channels).

**Shop basics:**
- **Shop name** — can be changed up to 5 times total; further changes need Etsy Support
  approval. Capitalization-only changes or reverting to a previous name don't count
  against the limit.
- **Tagline** — a few words describing the shop.
- **Logo** — `.jpg`/`.png`/`.gif`, under 10MB, at least 500×500px.
- **About your shop** — up to 5,000 characters: founding story, process, future plans.
- **Featured video** — `.mp4`/`.mov`/`.avi`/`.mpeg`/`.m4v`, up to 300MB.
- **Featured photos** — up to 5, `.jpg`/`.png`/`.gif`, up to 2MB each, cropped for
  display at 760×468px.
- **Links** — website/blog/social profiles.
- Also configurable from this screen: **listing sort order** (custom vs. recency) and
  whether the **Sold listings** page is visible to buyers.

**Shop team:**
- **Location** — where the shop is based, shown to buyers.
- **Shop team** — name, role, bio, and photo per member. Owners also show up on
  individual listing pages, not just the About page.

## Shop team roles (preset, or write a custom one)

| Role | Meaning |
|---|---|
| Owner | Must also be making/designing/handpicking/sourcing qualifying items per Etsy's Creativity Standards. Responsible for all account activity under the Terms of Use. |
| Assistant | Full/part-time/seasonal helper with making or shop management. If a third-party freelancer helps with admin tasks, that falls under Etsy's Freelance Administrative Help policy. |
| Maker | Anyone who physically creates items — **distinct from a production partner** (see [[etsy-production-partners-guide]]). |
| Curator | Helps select items meeting the Handpicked/Sourced-By criteria (vintage, craft supplies). |
| Customer Service | Helps the owner communicate with buyers — owner must still stay actively involved in running the shop. |
| Designer | Came up with an original design/pattern/sketch/template/prototype produced in-house or by a production partner. **Using mass-market templates or outsourcing all design work does not qualify as this role.** If someone outside the business physically produces what this person designed, that must be disclosed on the applicable listings (see the Manufacturing Policy / production-partner rules). |
| Marketer | Promotes the shop across channels. |
| Photographer | Takes the listing/shop photos. |
| Shipper | Packs and ships sold orders. |

**Account security note from this article**: Etsy does not recommend sharing
passwords with freelance assistants — if login info is shared, that's at the shop
owner's own risk, and it can make 2FA impossible to use properly. Whoever holds the
password can view/change anything, and the account owner remains responsible for all
of it under the Terms of Use.

## Shop policies (Settings → Policy Settings — 4 tabs)

Not editable from the Etsy Seller mobile app — desktop or mobile web only.

- **Returns & exchanges** — set **per-listing**, not shop-wide, for non-digital items.
  Sellers outside the EU **must** set a return policy on every physical listing, even
  if it's explicitly "no returns/exchanges" — this is exactly why this shop keeps both
  an accepts-returns and a no-returns `return_policy_id` (CLAUDE.md's DELIVERY TIME
  FRAME footer rule already depends on this). EU sellers: buyers get a 14-day
  right-of-withdrawal by regulation; setting a return window under 14 days shows an EU
  right-of-withdrawal reminder banner.
- **Cancellations** — one shop-wide toggle (on/off) plus an accepted time window.
- **Privacy policy** — a free-text policy describing how buyer data is handled. Legally
  **required** for sellers based in the EU or selling to EU/EEA buyers (GDPR), and
  recommended for everyone else since many other regions have similar laws. Etsy
  provides a sample privacy policy to start from. This is genuinely a legal-compliance
  text, not marketing copy — if a skill is ever asked to help write one, treat it as
  something to hand to the user for their own legal judgment, not something to
  auto-generate and publish.
- **Fixed policies** — Etsy's own preset delivery policies (estimated delivery dates,
  customs/import taxes, digital-item instant-download terms). Shop-wide, not editable
  by sellers at all.

**What does NOT belong in shop policies**: copyright/IP/licensing information (that's
item-specific, not shop-wide — put it in FAQs if needed) and sales tax (Etsy's own tax
tool handles buyer-facing tax display; no need to restate rates in policy text).

Policies can be edited any time; each edit is timestamped, and a buyer's receipt email
shows a snapshot of the policies as they stood at the moment of purchase — so an old
order can legitimately reference a policy that's since changed.
