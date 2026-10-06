# Etsy fees & payments — official policy summary

Confirmed straight from Etsy's House Rules "Fees & Payments Policy"
(`etsy.com/legal/fees`, fetched 2026-08-06). All figures are USD unless noted;
non-US sellers see local-currency equivalents and may have different payment-processing
rates (see the Etsy Payments Policy's per-country table for those specifics — not
reproduced here). Reference this for `etsy-financial-report`, `etsy-pricing-audit`, and
`etsy-fee-watchdog` when explaining *why* a ledger line exists, and for
`etsy-listing-qa-check`/pricing skills when reasoning about true landed cost per sale.

## Set-up fee
One-time fee, charged during shop onboarding once the shop can receive orders.
Non-refundable once paid; may be waived during promotions at Etsy's discretion.

## Listing fees — $0.20 per listing
- Charged once per listing when it's **published or renewed** — never for editing an
  existing listing.
- Charged whether or not the item ever sells (unless it's a **private listing**, which
  is only charged when it actually sells).
- Etsy.com listings **expire after 4 months**; Pattern-only listings never expire and
  never incur this fee at all.
- **Auto-renew** re-charges $0.20 every time a listing renews, until turned off
  per-listing or shop-wide (Listings Manager → Renewal Options → Manual). This is the
  same "auto-renew fee leak" already flagged in [[etsy-seo-standards]]'s merchandising
  checklist for dead/neglected listings.
- Multi-quantity listings: first listing fee is $0.20, then another $0.20 fires each
  time one of the quantities sells (that's a renewal event, not a fresh listing fee).

## Transaction fee — 6.5%
Charged on **(displayed price + shipping charge + gift-wrap charge)** for every sale.
US sellers: doesn't apply to sales tax. Non-US sellers: applies to the full displayed
price (which is expected to already include any taxes the seller is responsible for)
plus postage and gift wrap. Paid personalization add-on fees count toward the taxed
amount too.

## Advertising fees
- **Etsy Ads**: seller sets their own daily budget; never charged more than that budget
  per day.
- **Offsite Ads**: only charged when Etsy's own off-platform ad **directly causes a
  sale** within a 30-day click-to-order window ("Attributed Order"). Rate:
  - **15%** by default.
  - **12%** once the shop's trailing-365-day sales reach **$10,000 USD** — and once a
    shop crosses that threshold, it's **locked in at 12% for the lifetime of the
    shop**, even if sales later drop back below $10k.
  - Shops under the $10k threshold **can opt out** of Offsite Ads entirely; a shop that
    later crosses $10k is required into the program and loses the opt-out permanently,
    even retroactively for that opt-out period.
  - Capped at **$100 per single Attributed Order**, no matter the order size.

## Etsy Plus subscription — $10/month
- Auto-renews monthly on the signup date (or the last day of the month if signed up on
  the 31st of a shorter month).
- Includes per-cycle credits: **15 listing credits (~$3 value)** and **$5 in Etsy Ads
  credit** — both **expire at cycle end, do not roll over**.
- Cancel any time from Shop Manager → Settings → Your Subscription; access continues
  through the end of the paid cycle.

## Payment processing fees
Vary by the country of the seller's linked bank account (see Etsy Payments Policy for
the actual per-country rate table — not reproduced here since it's a large lookup
table, not a single number). Charged on the **full sale amount including tax and
postage**. Some markets also charge a fixed deposit fee for small payouts under a
per-market threshold.

## Instant Transfer fee
Eligible US sellers only — transfers from the Etsy Payments balance straight to a bank
account, available 24/7, funds typically settle within 30 minutes, for a fee charged
at transfer time.

## In-person (Square) selling
Square-reader sales aren't subject to the 6.5% transaction fee or Etsy payment
processing fees — they're subject to **Square's own processing fees** instead. If
listings are synced to Square, multi-quantity items get the same $0.20 renewal-style
fee as on Etsy itself; non-synced in-person sales get a flat $0.20 "Square manual" fee
line in the payment account.
