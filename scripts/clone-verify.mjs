#!/usr/bin/env node
// After an exact clone: compare the SOURCE listing's local record with the NEW listing's local record (built by ingest-snapshot.mjs from what
// Etsy really holds) and report every difference. Expected differences (ids, dates, stats, account-specific profile ids) are listed separately.
// No API calls. Node >= 18, identical on macOS, Windows, Linux.
//   node scripts/clone-verify.mjs <source-account> <source-listing> <target-account> <new-listing> [--data <dir>]
import path from "node:path";
import { ROOT, readJson, arg } from "./_lib.mjs";

const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--data");
if (pos.length !== 4) { console.error("Usage: node scripts/clone-verify.mjs <src-account> <src-listing> <tgt-account> <new-listing> [--data dir]"); process.exit(2); }
const DATA = path.resolve(arg("--data") || path.join(ROOT, "data"));
const load = (a, id) => readJson(path.join(DATA, "listings", a, String(id), "record.json"));
const A = load(pos[0], pos[1]), B = load(pos[2], pos[3]);
const norm = (s) => String(s ?? "").replace(/\r\n/g, "\n").trim();
const diffs = [], expected = [];
const cmp = (label, a, b, norm2 = (x) => x) => { const x = JSON.stringify(norm2(a)), y = JSON.stringify(norm2(b)); if (x !== y) diffs.push({ field: label, source: norm2(a), clone: norm2(b) }); };

const la = A.listing_data, lb = B.listing_data;
for (const f of ["title", "description", "price", "who_made", "when_made", "taxonomy_id", "processing_min", "processing_max", "is_supply", "is_customizable", "is_taxable", "should_auto_renew", "item_weight", "item_weight_unit", "item_length", "item_width", "item_height", "item_dimensions_unit"]) cmp(f, la[f], lb[f], f === "title" || f === "description" ? norm : (x) => x ?? null);
cmp("tags", la.tags, lb.tags); cmp("materials", [...la.materials].sort(), [...lb.materials].sort()); cmp("styles", [...la.styles].sort(), [...lb.styles].sort());
cmp("type", A.type, B.type);
cmp("variants (values, price, quantity, enabled)", (A.variants || []).map((v) => [v.values, v.price, v.quantity, v.enabled]), (B.variants || []).map((v) => [v.values, v.price, v.quantity, v.enabled]));
cmp("images (count, rank, alt_text)", (A.images || []).map((i) => [i.rank, i.alt_text]), (B.images || []).map((i) => [i.rank, i.alt_text]));
cmp("video present", !!A.video, !!B.video);
cmp("personalization (type, text, required, limits, options)", (A.personalization || []).map(({ question_id, ...q }) => q), (B.personalization || []).map(({ question_id, ...q }) => q));
cmp("shipping profile shape", (A.shipping_profile?.destinations || []).map((d) => [d.destination_country_iso || d.destination_region, d.primary_cost?.amount, d.secondary_cost?.amount, d.min_delivery_days, d.max_delivery_days]).sort(), (B.shipping_profile?.destinations || []).map((d) => [d.destination_country_iso || d.destination_region, d.primary_cost?.amount, d.secondary_cost?.amount, d.min_delivery_days, d.max_delivery_days]).sort());
cmp("return policy", [A.return_policy?.accepts_returns, A.return_policy?.accepts_exchanges, A.return_policy?.return_deadline], [B.return_policy?.accepts_returns, B.return_policy?.accepts_exchanges, B.return_policy?.return_deadline]);
cmp("processing days", [A.processing_profile?.min_processing_days, A.processing_profile?.max_processing_days], [B.processing_profile?.min_processing_days, B.processing_profile?.max_processing_days]);
cmp("section title", A.section?.title ?? null, B.section?.title ?? null);
cmp("product_id", A.product_id, B.product_id);
cmp("sources", (A.sources || []).map((s) => s.value), (B.sources || []).map((s) => s.value));
expected.push("listing_id, url, account, shop_id, created/updated dates, views/favorites, image/video ids and URLs, shipping_profile_id, return_policy_id, readiness_state_id, shop_section_id, production_partner_ids (all account-specific)");

if (!diffs.length) console.log("✔ The clone matches the source on every compared field.");
else { console.log(`✘ ${diffs.length} difference(s):`); for (const d of diffs) console.log(`- ${d.field}\n    source: ${JSON.stringify(d.source)?.slice(0, 220)}\n    clone : ${JSON.stringify(d.clone)?.slice(0, 220)}`); }
console.log("\nExpected to differ: " + expected.join("; "));
process.exit(diffs.length ? 1 : 0);
