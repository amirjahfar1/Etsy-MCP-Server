#!/usr/bin/env node
// Merge actual buyer-facing prices (list price, SALE price after an active promotion, discount %, promotion end) into
// the per-term research files, by listing_id. No API calls. Node >= 18, identical on macOS, Windows and Linux.
//   node scripts/merge-buyer-prices.mjs <research-folder> <raw-result-file> [<raw-result-file> ...]
// A raw result file is the saved output of either the `get_buyer_prices` tool (compact) or `get_listings_by_ids` called with
// includes:"BuyerPrice" and buyer_country (full listing objects with a `buyer_price` block); plain JSON or the
// [{"type":"text","text":"..."}] wrapper Claude uses when it saves an oversized tool result. Adds to every matching result:
//   list_price, sale_price (null when no active promotion), effective_price, discount_pct, discount_end, free_shipping
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./_lib.mjs";

const [, , dir, ...raws] = process.argv;
if (!dir || !raws.length) { console.error("Usage: node scripts/merge-buyer-prices.mjs <research-folder> <raw-result-file> [more files]"); process.exit(2); }
const money = (m) => (m && m.amount != null ? m.amount / m.divisor : null);
function parseRaw(text) {
  for (const t of [text, text.slice(Math.max(0, text.indexOf("{")))]) {
    try { const v = JSON.parse(t); if (Array.isArray(v)) return parseRaw(v.map((x) => x?.text).filter(Boolean).join("")); if (v && Array.isArray(v.results)) return v.results; } catch { /* next */ }
  }
  throw new Error("no results[] found in a raw file");
}
const byId = new Map();
for (const f of raws) {
  for (const l of parseRaw(fs.readFileSync(f, "utf8"))) {
    let rec;
    if ("effective_price" in l || "list_price" in l) rec = { list_price: l.list_price, sale_price: l.sale_price, effective_price: l.effective_price, discount_pct: l.discount_pct, discount_end: l.discount_end, free_shipping: l.free_shipping };
    else {
      const bp = l.buyer_price || {}; const list = money(bp.original_price) ?? money(l.price); const sale = bp.has_discount ? money(bp.discounted_price) : null;
      rec = { list_price: list, sale_price: sale, effective_price: sale ?? list, discount_pct: bp.discount_percentage ?? (list && sale ? Math.round((100 * (list - sale)) / list) : null), discount_end: bp.discount_end_epoch ?? null, free_shipping: bp.is_free_shipping ?? null };
    }
    byId.set(String(l.listing_id), { ...rec, currency: (l.currency || l.buyer_price?.original_price?.currency_code || l.price?.currency_code || null) });
  }
}
let merged = 0, total = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  let d; try { d = readJson(path.join(dir, f)); } catch { continue; }
  if (!d.term || !Array.isArray(d.results)) continue;
  for (const r of d.results) { total++; const b = byId.get(String(r.listing_id)); if (b) { Object.assign(r, { list_price: b.list_price, sale_price: b.sale_price, effective_price: b.effective_price, discount_pct: b.discount_pct, discount_end: b.discount_end, free_shipping: b.free_shipping, price_currency: b.currency }); merged++; } }
  fs.writeFileSync(path.join(dir, f), JSON.stringify(d, null, 2));
}
console.log(`prices for ${byId.size} listings; merged into ${merged}/${total} research rows`);
