#!/usr/bin/env node
// Turn the saved output of the read-only MCP tools into the local data store, so a live listing is captured COMPLETELY:
//   get_listing_snapshot  -> data/listings/<account>/<listing_id>/{record.json, raw/snapshot.json, images/NN.ext, video/video.mp4}
//   get_shop_profiles     -> data/shops/<account>/profiles.json   (all shipping profiles, return policies, processing profiles, sections, partners)
// No Etsy calls: it only reads the saved tool output and (unless --no-download) fetches the public image/video URLs found in it.
// Nothing is lost by construction: the untouched API answers are kept in raw/snapshot.json, the record.json is derived from them,
// and the script reports every part that is missing or failed. Existing local-only fields (sources, product_id, notes, research,
// product_template_ref) are preserved. Node >= 18, identical on macOS, Windows, Linux.
//
//   node scripts/ingest-snapshot.mjs <saved-tool-output.json> [more files] [--data <data-dir>] [--no-download] [--json]
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, exists, flag, arg } from "./_lib.mjs";

const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--data");
if (!files.length) { console.error("Usage: node scripts/ingest-snapshot.mjs <saved-tool-output.json> [...] [--data dir] [--no-download] [--json]"); process.exit(2); }
const DATA = path.resolve(arg("--data") || path.join(ROOT, "data"));
const DOWNLOAD = !flag("--no-download");
const today = new Date().toISOString().slice(0, 10);

function parse(text) {
  for (const t of [text, text.slice(Math.max(0, text.indexOf("{")))]) {
    try { const v = JSON.parse(t); if (Array.isArray(v)) return parse(v.map((x) => x?.text).filter(Boolean).join("")); if (v && v.kind) return v; } catch { /* next */ }
  }
  throw new Error("not a get_listing_snapshot / get_shop_profiles result");
}
const money = (m) => (m && m.amount != null ? m.amount / m.divisor : null);
const part = (p) => (p && p.ok ? p.data : null);
const extOf = (url, fallback) => { const m = /\.([a-z0-9]{3,4})(?:\?|$)/i.exec(url || ""); return (m ? m[1] : fallback).toLowerCase(); };

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

const registryPath = path.join(DATA, "product-registry.json");
const registry = exists(registryPath) ? readJson(registryPath) : { products: [] };
const findProduct = (account, id) => (registry.products || []).find((p) => (p.listings || []).some((l) => l.account === account && String(l.listing_id) === String(id)));

const report = [];

async function ingestListing(snap, entry) {
  const id = entry.listing_id, account = snap.account;
  const dir = path.join(DATA, "listings", account, String(id));
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  const L = part(entry.listing), inv = part(entry.inventory);
  const missing = [];
  if (!L) { report.push({ account, listing_id: id, complete: false, missing: ["listing (" + (entry.listing?.error || "no data") + ")"] }); return; }

  // 1. keep the untouched API answers (the source of truth for cloning)
  fs.writeFileSync(path.join(dir, "raw", "snapshot.json"), JSON.stringify({ fetched_at: snap.fetched_at, account, shop_id: snap.shop_id, buyer_country: snap.buyer_country, production_partners: part(snap.production_partners), ...entry }, null, 2));

  const prev = exists(path.join(dir, "record.json")) ? readJson(path.join(dir, "record.json")) : {};
  const reg = findProduct(account, id);

  // 2. variants from the inventory
  const variants = [], props = new Map();
  for (const p of inv?.products || []) {
    if (p.is_deleted) continue;
    const o = (p.offerings || []).filter((x) => !x.is_deleted);
    const values = {}; for (const pv of p.property_values || []) { values[pv.property_name] = (pv.values || []).join(", "); props.set(pv.property_id, { property_id: pv.property_id, property_name: pv.property_name, scale_id: pv.scale_id ?? null }); }
    variants.push({ sku: p.sku || "", values, price: money(o[0]?.price), quantity: o[0]?.quantity ?? null, enabled: o[0]?.is_enabled ?? null, readiness_state_id: o[0]?.readiness_state_id ?? null });
  }
  if (!entry.inventory?.ok) missing.push("inventory (" + (entry.inventory?.error || "?") + ")");
  if (L.has_variations && !variants.length) missing.push("variants (listing says has_variations but inventory has none)");

  // 3. media: record every image/video and download the files
  const images = [];
  const sorted = [...(L.images || [])].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < sorted.length; i++) {
    const im = sorted[i], rel = `images/${String(i + 1).padStart(2, "0")}.${extOf(im.url_fullxfull, "jpg")}`;
    const old = (prev.images || []).find((x) => x.listing_image_id === im.listing_image_id && x.source_path && exists(path.join(DATA, "..", x.source_path)));
    const rec = { listing_image_id: im.listing_image_id, rank: im.rank, alt_text: im.alt_text ?? "", source_path: path.posix.join("data", "listings", account, String(id), rel), url: im.url_fullxfull, width: im.full_width, height: im.full_height };
    const dest = path.join(dir, ...rel.split("/"));
    if (DOWNLOAD && !(exists(dest) && old)) {
      try { await download(im.url_fullxfull, dest); } catch (e) { rec.download_error = String(e.message || e); missing.push(`image ${i + 1} download (${rec.download_error})`); }
    }
    rec.downloaded = exists(dest);
    if (DOWNLOAD && !rec.downloaded && !rec.download_error) missing.push(`image ${i + 1} file`);
    images.push(rec);
  }
  let video = null;
  const v = (L.videos || [])[0];
  if (v) {
    const rel = "video/video.mp4", dest = path.join(dir, "video", "video.mp4");
    video = { video_id: v.video_id, state: v.video_state, source_path: path.posix.join("data", "listings", account, String(id), rel), url: v.video_url, width: v.width, height: v.height };
    if (DOWNLOAD && !exists(dest)) { try { await download(v.video_url, dest); } catch (e) { video.download_error = String(e.message || e); missing.push(`video download (${video.download_error})`); } }
    video.downloaded = exists(dest);
  }

  // 4. surrounding objects
  const sp = part(entry.shipping_profile), rp = part(entry.return_policy), pr = part(entry.processing_profile), sec = part(entry.shop_section);
  if (L.shipping_profile_id && !sp) missing.push("shipping profile (" + (entry.shipping_profile?.error || "?") + ")");
  if (L.return_policy_id && !rp) missing.push("return policy (" + (entry.return_policy?.error || "?") + ")");
  if ((L.readiness_state_id || entry.processing_profile_id) && !pr) missing.push("processing profile (" + (entry.processing_profile?.error || "?") + ")");
  if (L.shop_section_id && !sec) missing.push("shop section (" + (entry.shop_section?.error || "?") + ")");
  if (L.has_variations && entry.variation_images && !entry.variation_images.ok) missing.push("variation images (" + entry.variation_images.error + ")");
  const bp = entry.buyer_price;
  const buyer = bp ? { fetched: snap.fetched_at, country: snap.buyer_country, list_price: money(bp.original_price), sale_price: bp.has_discount ? money(bp.discounted_price) : null, discount_pct: bp.discount_percentage ?? null, discount_start: bp.discount_start_epoch ?? null, discount_end: bp.discount_end_epoch ?? null, free_shipping: bp.is_free_shipping ?? null } : null;

  const record = {
    ...prev,
    listing_id: String(id), account, shop_id: String(snap.shop_id), url: L.url, state: L.state, type: L.listing_type,
    product_template_ref: prev.product_template_ref ?? null,
    product_id: prev.product_id ?? reg?.product_id ?? null,
    sources: (prev.sources && prev.sources.length ? prev.sources : reg?.sources) || [],
    created_date: prev.created_date ?? new Date((L.original_creation_timestamp || L.created_timestamp) * 1000).toISOString().slice(0, 10),
    last_updated: today,
    listing_data: {
      title: L.title, tags: L.tags || [], description: L.description, price: money(L.price), quantity: L.quantity,
      who_made: L.who_made, when_made: L.when_made, taxonomy_id: L.taxonomy_id, materials: L.materials || [], styles: L.style || [],
      shipping_profile_id: L.shipping_profile_id, readiness_state_id: L.readiness_state_id ?? entry.processing_profile_id ?? null, return_policy_id: L.return_policy_id,
      shop_section_id: L.shop_section_id ?? null, processing_min: L.processing_min, processing_max: L.processing_max,
      is_supply: L.is_supply, is_customizable: L.is_customizable, is_personalizable: L.is_personalizable, is_taxable: L.is_taxable, should_auto_renew: L.should_auto_renew,
      has_variations: L.has_variations, item_weight: L.item_weight, item_weight_unit: L.item_weight_unit, item_length: L.item_length, item_width: L.item_width, item_height: L.item_height,
      item_dimensions_unit: L.item_dimensions_unit, language: L.language, is_private: L.is_private, featured_rank: L.featured_rank,
      production_partner_ids: (L.production_partners || []).map((x) => x.production_partner_id),
    },
    variants,
    inventory_meta: inv ? { properties: [...props.values()], price_on_property: inv.price_on_property || [], quantity_on_property: inv.quantity_on_property || [], sku_on_property: inv.sku_on_property || [], readiness_state_on_property: inv.readiness_state_on_property || [] } : null,
    variation_images: part(entry.variation_images)?.results ?? part(entry.variation_images) ?? null,
    images, video,
    personalization: L.personalization?.personalization_questions || [],
    shipping_profile: sp ? { shipping_profile_id: sp.shipping_profile_id, title: sp.title, origin_country_iso: sp.origin_country_iso, origin_postal_code: sp.origin_postal_code, profile_type: sp.profile_type, destinations: sp.shipping_profile_destinations || [], upgrades: sp.shipping_profile_upgrades || [] } : null,
    return_policy: rp ? { return_policy_id: rp.return_policy_id, accepts_returns: rp.accepts_returns, accepts_exchanges: rp.accepts_exchanges, return_deadline: rp.return_deadline } : null,
    processing_profile: pr ? { readiness_state_id: pr.readiness_state_id, readiness_state: pr.readiness_state, min_processing_days: pr.min_processing_days, max_processing_days: pr.max_processing_days, label: pr.processing_days_display_label } : null,
    section: sec ? { shop_section_id: sec.shop_section_id, title: sec.title } : null,
    production_partners: L.production_partners || [],
    stats: { views: L.views, num_favorers: L.num_favorers, created_timestamp: L.created_timestamp, original_creation_timestamp: L.original_creation_timestamp, last_modified_timestamp: L.last_modified_timestamp, ending_timestamp: L.ending_timestamp },
    buyer_price: buyer,
  };
  const todo = [];
  if (!record.product_id) todo.push("product_id not in the registry yet (resolve it, then add the listing to data/product-registry.json)");
  if (!record.sources.length) todo.push("sources missing: ask the owner (hard rule: every product needs a source)");
  record.snapshot = { source: "live", fetched_at: snap.fetched_at, images_live: sorted.length, images_local: images.filter((i) => i.downloaded).length, video_live: !!v, video_local: !!video?.downloaded, variants: variants.length, personalization_questions: record.personalization.length, complete: missing.length === 0, missing, todo };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2));
  report.push({ account, listing_id: id, state: L.state, complete: missing.length === 0, missing, todo, images: `${record.snapshot.images_local}/${sorted.length}`, video: v ? (video.downloaded ? "yes" : "FAILED") : "none", variants: variants.length, personalization: record.personalization.length });
}

function ingestProfiles(snap) {
  const out = { fetched_at: snap.fetched_at, account: snap.account, shop_id: snap.shop_id, errors: [] };
  const take = (key, label, pick) => { const d = part(snap[key]); if (!d) { out.errors.push(`${label}: ${snap[key]?.error || "no data"}`); return []; } return pick(d); };
  out.shipping_profiles = take("shipping_profiles", "shipping profiles", (d) => d.results || []);
  out.return_policies = take("return_policies", "return policies", (d) => d.results || []);
  out.processing_profiles = take("processing_profiles", "processing profiles", (d) => d.results || []);
  out.sections = take("sections", "sections", (d) => d.results || []);
  out.production_partners = take("production_partners", "production partners", (d) => d.results || []);
  const dir = path.join(DATA, "shops", snap.account); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "profiles.json"), JSON.stringify(out, null, 2));
  report.push({ account: snap.account, profiles: true, shipping: out.shipping_profiles.length, returns: out.return_policies.length, processing: out.processing_profiles.length, sections: out.sections.length, partners: out.production_partners.length, errors: out.errors });
}

for (const f of files) {
  const snap = parse(fs.readFileSync(f, "utf8"));
  if (snap.kind === "etsy-listing-snapshot") for (const e of snap.listings) await ingestListing(snap, e);
  else if (snap.kind === "etsy-shop-profiles") ingestProfiles(snap);
  else console.error("unknown kind in", f, snap.kind);
}

if (flag("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const r of report) {
    if (r.profiles) console.log(`profiles ${r.account}: ${r.shipping} shipping, ${r.returns} return policies, ${r.processing} processing, ${r.sections} sections, ${r.partners} partners${r.errors.length ? "  ERRORS: " + r.errors.join("; ") : ""}`);
    else console.log(`${r.complete ? "✔" : "✘"} ${r.account}/${r.listing_id} [${r.state}] images ${r.images} | video ${r.video} | variants ${r.variants} | personalization ${r.personalization}${r.missing.length ? "\n    MISSING: " + r.missing.join("; ") : ""}${r.todo?.length ? "\n    TODO: " + r.todo.join("; ") : ""}`);
  }
  const bad = report.filter((r) => r.complete === false).length;
  console.log(bad ? `\n${bad} listing(s) incomplete: fix the MISSING items (re-run the snapshot or download) before treating the local copy as complete.` : "\nAll ingested listings are complete.");
}
process.exit(report.some((r) => r.complete === false) ? 1 : 0);
