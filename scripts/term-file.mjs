#!/usr/bin/env node
// Convert the raw output of one `search_listings` call into the per-term file that scripts/keyword-stats.mjs reads.
// No API calls. Node >= 18, identical on macOS, Windows and Linux.
//   node scripts/term-file.mjs <raw-result-file> "<search term>" <out-file.json>
// <raw-result-file> may be: the JSON the tool returned, the JSON wrapped as [{"type":"text","text":"..."}] (how Claude saves an
// oversized tool result to disk), or text containing that JSON after some preamble. Prefer calling search_listings with
// include_description:false (+ currency:"USD") so the result does not overflow in the first place.
import fs from "node:fs";
import path from "node:path";

const [, , rawPath, term, outPath] = process.argv;
if (!rawPath || !term || !outPath) { console.error('Usage: node scripts/term-file.mjs <raw-result-file> "<term>" <out-file.json>'); process.exit(2); }

function extract(text) {
  const attempts = [() => JSON.parse(text), () => JSON.parse(text.slice(text.indexOf("{")))];
  for (const a of attempts) { try { const v = a(); if (Array.isArray(v)) { const t = v.map((x) => x?.text).filter(Boolean).join(""); return extract(t); } if (v && Array.isArray(v.results)) return v; } catch { /* next */ } }
  throw new Error("could not find a search_listings result object in " + rawPath);
}
const data = extract(fs.readFileSync(rawPath, "utf8"));
const parsePrice = (p) => { const m = /^([\d.,]+)\s*([A-Z]{3})$/.exec(String(p || "").trim()); return m ? { price: Number(m[1].replace(/,/g, "")), currency: m[2] } : { price: null, currency: null }; };
const results = data.results.map((r, i) => {
  const { price, currency } = parsePrice(r.price);
  const desc = typeof r.description === "string" ? r.description : "";
  return {
    rank: i + 1, listing_id: r.listing_id, shop_id: r.shop_id, title: r.title, tags: r.tags || [], price, currency,
    price_converted: r.price_converted, price_converted_currency: r.price_converted_currency,
    quantity: r.quantity, created: r.created, original_created: r.original_created, updated: r.updated,
    num_favorers: r.num_favorers, taxonomy_id: r.taxonomy_id,
    desc_len: r.desc_len ?? desc.length, desc_first_200: (r.desc_first_300 ?? desc).replace(/\s+/g, " ").slice(0, 200),
  };
});
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ term, total_count: data.count, results }, null, 2));
console.log(`${term}: ${results.length} results -> ${outPath}`);
