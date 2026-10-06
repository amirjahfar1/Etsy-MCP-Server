# Listing image requirements — official Etsy policy

Confirmed straight from Etsy's own House Rules page "Listing Image Requirements"
(`etsy.com/legal/policy/listing-image-requirements`, last updated 9 Jul 2024, fetched
2026-08-06). Read this alongside CLAUDE.md's existing "verify physical/construction
claims against the actual photo" standing rule and the image section of
[[etsy-seo-standards]] — this file is the underlying Etsy policy those rules exist to
satisfy, and the specific exception rules below aren't currently written down anywhere
else in this project.

## The default rule: real photos of the real product

Sellers must use **their own original photos** — taken by them or someone they had
take them — of the **actual finished product the buyer will receive**. Not renderings,
not stock photos, except in the two limited situations below. Uploading an image is an
implicit confirmation that the seller has rights to it and that it complies with
Etsy's Intellectual Property Policy and Prohibited Items Policy.

## Exception 1 — personalized/customized items

- The **first image must show a finished, customized example** similar to what a buyer
  will actually receive (e.g. a real name embroidered on the item, not a mockup).
- **Prohibited as the main image**: a photo of the blank/unpersonalized product, or a
  mockup with placeholder text like "Your Text Here".
- Computer-generated mockups **are** allowed in the *additional* images, to show off
  customization options — just not as image #1.
- Using a buyer's own review photo as a listing image requires that buyer's permission
  first.

## Exception 2 — items made with a production partner

This exception has **two different rules depending on what the partner actually did**
— this distinction matters a lot for this shop's current sourcing model, see
[[etsy-production-partners-guide]] for the reselling-risk context:

- **Partner manufactures a unique item you designed** (furniture, clothing, a book,
  etc., built from your own design) → must use a **real photo of the actual physical
  end product**. Stock/mockup images are **not** allowed here.
- **Partner prints your original design onto a base item** (e.g. your artwork/pattern
  printed onto a t-shirt or mug) → a **stock photo mockup is allowed** to illustrate
  the end product, since the base item itself is generic and only your applied design
  is what's original.
- Buyer-personalized items made via a production partner still follow the
  personalization rules above, not this section.

**Practical read for this shop**: an AliExpress/Merchize-sourced apparel listing where
the *design itself* also originates from the supplier (not this shop's own artwork)
doesn't clearly fit either exception — it isn't "your unique design manufactured" (rule
1, since the design isn't this shop's) and it isn't cleanly "your original design
printed onto a base item" (rule 2, same reason). When a product's design origin is
ambiguous, treat "use the actual product photo, not a generic supplier stock mockup"
as the safer default, and flag the ambiguity to the user rather than assuming a stock
image is compliant.

## Cross-reference

Every image-upload step in `etsy-create-listing`/`etsy-copy-listing`/
`etsy-optimize-listing` should treat this file as the authoritative source for "is this
specific image allowed to be a mockup or must it be a real photo" — the existing
"verify photo before construction claims" rule in CLAUDE.md covers writing *accurate
copy* about what's visible in a photo; this file covers whether the *photo itself* is
allowed to be used at all.
