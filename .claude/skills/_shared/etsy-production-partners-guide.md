# Production partners — official Etsy Help Center facts

Confirmed straight from Etsy's Help Center article "Working with Production Partners
on Etsy" (fetched 2026-08-06). Read this alongside CLAUDE.md's `who_made`/
`production_partner_ids` section — that section covers the *API mechanics* (when the
draft-listing call requires `who_made: "someone_else"` + a partner id); this file
covers the *policy* those mechanics exist to satisfy, and it's worth reading in full
given itrat_etsy's 2026-08-06 permanent suspension for repeated Creativity Standards
violations.

## What a production partner actually is

A production partner is a company or person **outside your Etsy shop** that
**physically produces items from your own, original design**, start to finish — e.g. a
printing service, an apparel producer, an engraver. Cannot be added to supplies or
vintage listings (those categories don't use production partners at all).

Legitimate reasons to use one: no equipment/technical ability to make the item
yourself, need a specialized application step (printing/embroidery/engraving), or the
order volume has outgrown what you can produce in-house.

**Partner types Etsy explicitly names as valid:**
| Type | Examples |
|---|---|
| Print-on-Demand (POD) | Printful, Printify, Gooten |
| Cut-and-sew manufacturers | Local sewing studios, textile factories |
| Contract manufacturers | Small-batch manufacturers, custom jewelry producers |
| Specialized production services | Laser cutting services, professional printers |

## Who does NOT qualify as a production partner — read this carefully

Etsy's own wording: **"Working with non-qualifying businesses to source products for
your Etsy shop violates our marketplace policies on reselling, and may result in
penalties up to and including account suspension."**

The load-bearing distinction: a production partner **manufactures a design that is
genuinely yours** — you (or your shop) came up with the artwork/pattern/prototype, and
the partner is just the manufacturing arm. If the actual product design itself
originates from the supplier/marketplace listing (i.e. the seller is picking an
already-existing product from a catalog — an AliExpress product page, a generic
Printify/Merchize catalog item with someone else's stock design — and just relisting
it under `who_made: someone_else` + a `production_partner_id`), that is **reselling**,
not a production-partner relationship, regardless of what the API technically accepts.
The `who_made`/`production_partner_ids` fields being present and valid on a
`create_draft_listing` call is a **necessary disclosure mechanic**, not proof the
underlying sourcing model itself is policy-compliant — Etsy's Trust & Safety review
looks at the actual design origin, not just whether the disclosure fields were filled
in correctly.

**This is directly relevant to this shop's current AliExpress/Merchize sourcing
workflow** (`Add Product/AliExpress/`, `Add Product/Merchize/`, the product-templates
store) — those flows already correctly set `who_made`/`production_partner_ids` per
CLAUDE.md's existing rule, which satisfies the *disclosure* requirement, but that is a
distinct question from whether each specific product actually originates from this
shop's own design (a genuinely new pattern/graphic/text layout this shop created,
manufactured by the supplier) versus a supplier's own pre-existing catalog design being
relisted as-is. When in doubt about a specific product, flag this distinction to the
user rather than assuming disclosure fields alone make the listing safe.

## Disclosure requirements once a partner is in use

- Must be disclosed **on every applicable listing** (the `who_made`/
  `production_partner_ids` mechanic).
- Buyers can also see production-partner info from the shop's **About section** — this
  is a *separate* disclosure surface from the listing itself, and per
  [[etsy-shop-setup-guide]] the About section has no API write path, so this part is
  manual-only: the user should actually fill in the About section's story to reflect
  real partner use, not just rely on the listing-level field.
- Items produced with a production partner must independently comply with Etsy's
  Creativity Standards — the partner disclosure doesn't exempt the item from that
  policy.

## After disclosing a production partner (3 follow-up actions Etsy expects)

1. **Shipping locations** — listings should reflect the partner's actual shipping
   origin if that's where the item ships from, not a generic/default location.
2. **About Section** — tell the real story of how items are designed and produced
   (manual edit, see above).
3. **Listing images** — must follow [[etsy-listing-image-requirements-guide]], which
   has different rules depending on whether the partner made *your unique design* vs.
   *printed your design onto a base item*.

Production partners only apply to items **you designed**, or items you sourced that
the **buyer then customizes**. They don't apply to anything your own shop members
physically make in-house — that's just a Maker (see [[etsy-shop-setup-guide]]'s team
roles), not a production partner.
