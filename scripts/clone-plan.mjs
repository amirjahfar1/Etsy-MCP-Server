#!/usr/bin/env node
// EXACT clone plan: copy a listing from one account to another AS IT IS (title, description, tags, price, variations, personalization,
// materials, styles, images in the same order with the same alt text, video, ...). Only account-specific ids (shipping profile, return
// policy, processing profile, section, production partner) are re-mapped. No Etsy calls: it reads the source listing's local snapshot
// (data/listings/<src>/<id>/{record.json,raw/snapshot.json}, made by ingest-snapshot.mjs) and the target's profiles
// (data/shops/<target>/profiles.json), and writes a plan the agent executes step by step after ONE table-confirmation.
//
// "Blocks" policy: this mode never rewrites, re-asks or refuses on the system's own rules (copy QA, rank-first, price, sources, trademark,
// style match...). Those are reported as WARNINGS only. A step is a BLOCKER only when Etsy itself would reject it (e.g. who_made=someone_else
// but the target shop has no production partner, account deactivated, target profiles not read yet).
//
//   node scripts/clone-plan.mjs <source-account> <listing_id> <target-account> [--data <dir>] [--out <plan.json>] [--json]
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, exists, flag, arg } from "./_lib.mjs";

const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--data" && all[i - 1] !== "--out");
const [srcAcc, listingId, tgtAcc] = pos;
if (!srcAcc || !listingId || !tgtAcc) { console.error("Usage: node scripts/clone-plan.mjs <source-account> <listing_id> <target-account> [--data dir] [--out plan.json] [--json]"); process.exit(2); }
const DATA = path.resolve(arg("--data") || path.join(ROOT, "data"));
const srcDir = path.join(DATA, "listings", srcAcc, String(listingId));
if (!exists(path.join(srcDir, "record.json")) || !exists(path.join(srcDir, "raw", "snapshot.json"))) {
  console.error(`No complete local snapshot for ${srcAcc}/${listingId}. Capture it first: call get_listing_snapshot for it, then node scripts/ingest-snapshot.mjs <saved output>.`); process.exit(3);
}
const rec = readJson(path.join(srcDir, "record.json")), raw = readJson(path.join(srcDir, "raw", "snapshot.json"));
const L = raw.listing.data, inv = raw.inventory?.data;
const profPath = path.join(DATA, "shops", tgtAcc, "profiles.json");
const blockers = [], warnings = [], steps = [], mappings = [];
const accounts = (() => { try { return readJson(path.join(ROOT, "etsy-mcp-server", "accounts.json")).accounts || {}; } catch { return {}; } })();
const money = (m) => (m && m.amount != null ? m.amount / m.divisor : null);

if (!accounts[tgtAcc]) blockers.push(`Target account "${tgtAcc}" is not connected (accounts.json).`);
else if (accounts[tgtAcc].status === "deactivated") blockers.push(`Target account "${tgtAcc}" is deactivated: reactivate it (set_account_status) first.`);
if (srcAcc === tgtAcc) warnings.push("Source and target are the same account: this creates a second copy of the listing in the same shop.");
if (!exists(profPath)) { blockers.push(`Target profiles not read yet: call get_shop_profiles for "${tgtAcc}", then node scripts/ingest-snapshot.mjs <saved output>.`); }
const T = exists(profPath) ? readJson(profPath) : { shipping_profiles: [], return_policies: [], processing_profiles: [], sections: [], production_partners: [] };
const isDigital = L.listing_type !== "physical";

// ---------- warnings only (never blocks)
if (tgtAcc === "abbas_etsy" && isDigital) warnings.push("Standing owner rule: abbas_etsy sells physical products only; this listing is digital. Confirm with the owner before executing.");
try {
  const terms = fs.readFileSync(path.join(ROOT, "scripts", "risk-terms.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#"));
  const hay = " " + [L.title, ...(L.tags || []), L.description].join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  const hits = terms.filter((t) => hay.includes(" " + t.replace(/[^a-z0-9]+/g, " ") + " "));
  if (hits.length) warnings.push(`Brand/franchise word(s) found in the copy: ${hits.slice(0, 6).join(", ")}. It is already live on ${srcAcc}, and exact-clone mode does not block; the owner's one-time "list it anyway?" applies.`);
} catch { /* risk terms optional */ }
const prod = (() => { try { return readJson(path.join(DATA, "product-registry.json")).products.find((p) => p.product_id === rec.product_id); } catch { return null; } })();
const onTarget = prod?.listings?.filter((l) => l.account === tgtAcc) || [];
if (onTarget.length) warnings.push(`The registry says this product (${rec.product_id}) is already on ${tgtAcc}: listing ${onTarget.map((l) => l.listing_id).join(", ")}. Identical copy/photos on two live listings of one shop can compete with each other.`);
else warnings.push("Identical title/photos on several accounts is a cross-account correlation risk (see account-risk-guide); exact clone is what was asked, so it proceeds.");

// ---------- mapping helpers
const destKey = (d) => `${d.destination_country_iso || d.destination_region || "ALL"}|${money(d.primary_cost)}|${money(d.secondary_cost)}|${d.min_delivery_days ?? ""}|${d.max_delivery_days ?? ""}`;
const shapeOf = (sp) => (sp.shipping_profile_destinations || sp.destinations || []).map(destKey).sort().join(";");
const ref = (name) => `{{${name}}}`;

// shipping profile
let shipId = L.shipping_profile_id ? null : undefined;
if (L.shipping_profile_id) {
  const sp = raw.shipping_profile?.data;
  if (!sp) blockers.push("Source shipping profile was not captured in the snapshot (re-run get_listing_snapshot).");
  else {
    const want = shapeOf(sp), hit = T.shipping_profiles.find((p) => shapeOf(p) === want) || T.shipping_profiles.find((p) => p.title === sp.title && shapeOf(p) === want);
    if (hit) { shipId = hit.shipping_profile_id; mappings.push(`shipping profile "${sp.title}" -> existing "${hit.title}" (${hit.shipping_profile_id}), identical destinations/costs/delivery days`); }
    else {
      shipId = ref("shipping_profile_id"); mappings.push(`shipping profile "${sp.title}" -> NO identical profile on ${tgtAcc}: will be CREATED with the same destinations, costs and delivery days`);
      const dests = sp.shipping_profile_destinations || [], base = dests.find((d) => d.destination_country_iso) || dests.find((d) => d.destination_region && d.destination_region !== "none") || dests[0];
      const dArg = (d) => ({ ...(d.destination_country_iso ? { destination_country_iso: d.destination_country_iso } : d.destination_region && d.destination_region !== "none" ? { destination_region: d.destination_region } : {}), primary_cost: money(d.primary_cost), secondary_cost: money(d.secondary_cost), min_delivery_days: d.min_delivery_days, max_delivery_days: d.max_delivery_days });
      steps.push({ tool: "create_shop_shipping_profile", account: tgtAcc, capture: "shipping_profile_id", note: "verify field names with etsy-docs get_endpoint createShopShippingProfile before running", args: { title: sp.title, origin_country_iso: sp.origin_country_iso, origin_postal_code: sp.origin_postal_code || "10001", ...dArg(base), ...(L.processing_min != null ? { min_processing_time: L.processing_min, max_processing_time: L.processing_max } : {}) } });
      for (const d of dests) if (d !== base) steps.push({ tool: "create_shipping_profile_destination", account: tgtAcc, args: { shipping_profile_id: ref("shipping_profile_id"), ...dArg(d) }, note: d.destination_country_iso || d.destination_region !== "none" ? undefined : "catch-all (everywhere else): no country/region, create this one last" });
    }
  }
}
// return policy
let retId = L.return_policy_id ? null : undefined;
if (L.return_policy_id) {
  const rp = raw.return_policy?.data;
  if (!rp) blockers.push("Source return policy was not captured in the snapshot.");
  else {
    const hit = T.return_policies.find((p) => !!p.accepts_returns === !!rp.accepts_returns && !!p.accepts_exchanges === !!rp.accepts_exchanges && (p.return_deadline ?? null) === (rp.return_deadline ?? null));
    if (hit) { retId = hit.return_policy_id; mappings.push(`return policy (returns ${rp.accepts_returns}, exchanges ${rp.accepts_exchanges}) -> existing ${hit.return_policy_id}`); }
    else { retId = ref("return_policy_id"); mappings.push("return policy -> will be CREATED on the target (same returns/exchanges/deadline)"); steps.push({ tool: "create_shop_return_policy", account: tgtAcc, capture: "return_policy_id", args: { accepts_returns: !!rp.accepts_returns, accepts_exchanges: !!rp.accepts_exchanges, ...(rp.return_deadline ? { return_deadline: rp.return_deadline } : {}) } }); }
  }
}
// processing profile
const srcReady = L.readiness_state_id ?? raw.processing_profile_id;
let readyId = srcReady ? null : undefined;
if (srcReady) {
  const pr = raw.processing_profile?.data;
  if (!pr) blockers.push("Source processing profile was not captured in the snapshot.");
  else {
    const hit = T.processing_profiles.find((p) => p.readiness_state === pr.readiness_state && p.min_processing_days === pr.min_processing_days && p.max_processing_days === pr.max_processing_days);
    if (hit) { readyId = hit.readiness_state_id; mappings.push(`processing profile ${pr.processing_days_display_label || ""} (${pr.readiness_state}) -> existing ${hit.readiness_state_id}`); }
    else { readyId = ref("readiness_state_id"); mappings.push("processing profile -> will be CREATED on the target (same type and days)"); steps.push({ tool: "create_processing_profile", account: tgtAcc, capture: "readiness_state_id", note: "field names differ from the tool description: min_processing_time/max_processing_time and readiness_state (CLAUDE.md)", args: { readiness_state: pr.readiness_state, min_processing_time: pr.min_processing_days, max_processing_time: pr.max_processing_days } }); }
  }
}
// section
let sectionId;
if (L.shop_section_id) {
  const title = raw.shop_section?.data?.title;
  if (!title) warnings.push("Source section title was not captured; the clone is created without a shop section.");
  else {
    const hit = T.sections.find((s) => s.title.trim().toLowerCase() === title.trim().toLowerCase());
    if (hit) { sectionId = hit.shop_section_id; mappings.push(`section "${title}" -> existing ${hit.shop_section_id}`); }
    else { sectionId = ref("shop_section_id"); mappings.push(`section "${title}" -> will be CREATED on the target`); if (title.length > 20) warnings.push(`Section title "${title}" is ${title.length} characters; Etsy rejects titles over ~20 ("Your shop section name is too long").`); steps.push({ tool: "create_shop_section", account: tgtAcc, capture: "shop_section_id", args: { title } }); }
  }
}
// production partner (the one thing Etsy itself enforces)
let partnerIds;
if (L.who_made !== "i_did") {
  const partners = T.production_partners || [];
  if (!partners.length) blockers.push(`Etsy rejects who_made="${L.who_made}" on a shop without a declared production partner (opaque HTTP 400), and there is no API to add one. Add one on ${tgtAcc} in Shop Manager (Settings > Production Partners), then re-read profiles. The listing is NOT changed to "i_did" because the clone must stay as it is.`);
  else { partnerIds = [partners[0].production_partner_id]; mappings.push(`production partner -> ${partners[0].partner_name} (${partners[0].production_partner_id}) on ${tgtAcc}`); }
}

// ---------- create_draft_listing (exactly the source fields)
const create = {
  title: L.title, description: L.description, price: money(L.price), quantity: Math.min(L.quantity || 999, 999), who_made: L.who_made, when_made: L.when_made,
  taxonomy_id: L.taxonomy_id, type: L.listing_type, tags: L.tags || [], materials: L.materials || [], styles: L.style || [],
  ...(shipId !== undefined ? { shipping_profile_id: shipId } : {}), ...(retId !== undefined ? { return_policy_id: retId } : {}), ...(readyId !== undefined ? { readiness_state_id: readyId } : {}),
  ...(sectionId !== undefined ? { shop_section_id: sectionId } : {}), ...(partnerIds ? { production_partner_ids: partnerIds } : {}),
  ...(L.processing_min != null ? { processing_min: L.processing_min, processing_max: L.processing_max } : {}),
  is_supply: !!L.is_supply, ...(L.is_customizable != null ? { is_customizable: L.is_customizable } : {}), should_auto_renew: !!L.should_auto_renew, ...(L.is_taxable != null ? { is_taxable: L.is_taxable } : {}),
  ...(L.item_weight != null ? { item_weight: L.item_weight, item_weight_unit: L.item_weight_unit } : {}),
  ...(L.item_length != null ? { item_length: L.item_length, item_width: L.item_width, item_height: L.item_height, item_dimensions_unit: L.item_dimensions_unit } : {}),
};
const createStep = { tool: "create_draft_listing", account: tgtAcc, capture: "listing_id", args: create };
steps.push(createStep);
if (L.quantity > 999) warnings.push(`Source quantity ${L.quantity} is above the 999 create-time cap; created with 999 (per-variant quantities are set in the inventory step).`);

// ---------- inventory / variations
const customSlots = [513, 514, 515], slotFor = new Map();
const mapProp = (pv) => {
  if (pv.property_id < 1e7) return { property_id: pv.property_id, property_name: pv.property_name, value_ids: pv.value_ids || [], values: pv.values || [] };
  if (!slotFor.has(pv.property_id)) slotFor.set(pv.property_id, customSlots[slotFor.size]);
  return { property_id: slotFor.get(pv.property_id), property_name: pv.property_name, value_ids: [], values: pv.values || [] };
};
if (inv && (L.has_variations || (inv.products || []).length > 1)) {
  if (slotFor.size > customSlots.length) warnings.push("More than 3 custom variation properties: not representable.");
  const products = (inv.products || []).filter((p) => !p.is_deleted).map((p) => ({
    sku: p.sku || "", property_values: (p.property_values || []).map(mapProp),
    offerings: (p.offerings || []).filter((o) => !o.is_deleted).map((o) => ({ price: money(o.price), quantity: o.quantity, is_enabled: o.is_enabled !== false, readiness_state_id: readyId })),
  }));
  const remap = (arr) => (arr || []).map((id) => (id < 1e7 ? id : slotFor.get(id) ?? id));
  steps.push({ tool: "update_listing_inventory", account: tgtAcc, args: { listing_id: ref("listing_id"), products, price_on_property: remap(inv.price_on_property), quantity_on_property: remap(inv.quantity_on_property), sku_on_property: remap(inv.sku_on_property), readiness_state_on_property: remap(inv.readiness_state_on_property) },
    note: "price is a decimal (not cents); product_id/offering_id are NOT sent; every offering carries is_enabled and readiness_state_id; custom (listing-specific) property ids are re-mapped to the generic slots 513/514/515 (CLAUDE.md)" });
  mappings.push(`variations: ${products.length} product(s), ${slotFor.size} custom propert${slotFor.size === 1 ? "y" : "ies"} re-mapped to slot ids ${[...slotFor.values()].join(", ") || "-"}`);
}
// ---------- personalization (the server splits multi-question calls itself)
const qs = L.personalization?.personalization_questions || [];
if (qs.length) {
  const clean = qs.map(({ question_id, ...q }) => q);
  for (const q of clean) {
    if (q.instructions && q.instructions.length > 120) warnings.push(`Personalization "${q.question_text}": instructions are ${q.instructions.length} characters (Etsy limit 120).`);
    if (q.question_type === "dropdown" && q.instructions) warnings.push(`Personalization "${q.question_text}": dropdown with instructions fails with an opaque 400 on Etsy; send it without instructions if it does.`);
  }
  steps.push({ tool: "update_listing_personalization", account: tgtAcc, args: { listing_id: ref("listing_id"), personalization_questions: clean }, note: "a fresh multi-question POST can fail with an opaque 400: the server retries one question at a time" });
}
// ---------- media, in the same order, same alt text
const missingFiles = [];
// media files live inside the listing folder; resolve relative to it so a custom --data folder works too
const mediaPath = (sp) => { const rel = String(sp || ""); const i = rel.indexOf(`/${listingId}/`); return i >= 0 ? path.join(srcDir, ...rel.slice(i + listingId.length + 2).split("/")) : path.join(DATA, "..", ...rel.split("/")); };
for (const im of [...(rec.images || [])].sort((a, b) => a.rank - b.rank)) {
  const local = mediaPath(im.source_path);
  if (!im.source_path || !exists(local)) missingFiles.push(`image rank ${im.rank}`);
  steps.push({ tool: "upload_listing_image", account: tgtAcc, args: { listing_id: ref("listing_id"), image_path: local, rank: im.rank, alt_text: im.alt_text ?? "" }, capture: `image_rank_${im.rank}` });
}
if (rec.video) { const local = mediaPath(rec.video.source_path); if (!exists(local)) missingFiles.push("video"); steps.push({ tool: "upload_listing_video", account: tgtAcc, args: { listing_id: ref("listing_id"), video_path: local } }); }
if (missingFiles.length) blockers.push(`Local media files missing for: ${missingFiles.join(", ")}. Re-run node scripts/ingest-snapshot.mjs on a fresh get_listing_snapshot (it downloads the files).`);
const vi = rec.variation_images;
if (vi && (Array.isArray(vi) ? vi.length : Object.keys(vi).length)) steps.push({ tool: "update_variation_images", account: tgtAcc, args: { listing_id: ref("listing_id"), source_variation_images: vi }, note: "map each source listing_image_id to the NEW image id by rank (capture image_rank_N), then send" });

// ---------- bookkeeping (same turn, no confirmation)
const bookkeeping = [
  `get_listing_snapshot for the NEW listing on ${tgtAcc}, then node scripts/ingest-snapshot.mjs <saved output>  (the target's local record is built from what Etsy actually holds)`,
  `data/product-registry.json: add {account: "${tgtAcc}", listing_id: <new>, state} under product_id "${rec.product_id ?? "(resolve first)"}"; copy sources ${JSON.stringify((rec.sources || []).map((s) => s.value))}`,
  "tags are unchanged: nothing new for data/tags-database.json (increment own_uses only if you track it)",
  "jewelry: set the 'Ready Products' sheet row to Draft (and Published after activation)",
  "run node scripts/sync-diff.mjs / etsy-sync-check later to confirm zero drift",
];
steps.push({ tool: "(optional, only if the owner says so) update_listing", account: tgtAcc, args: { listing_id: ref("listing_id"), state: "active" }, note: "the clone is created as a draft; publishing is a separate yes" });

// ---------- delivery-time block check (informational)
const m = /around (\d+)-(\d+) business days within US/.exec(L.description || "");
const tp = T.processing_profiles.find((p) => p.readiness_state_id === (typeof readyId === "number" ? readyId : -1));
const tsp = T.shipping_profiles.find((p) => p.shipping_profile_id === (typeof shipId === "number" ? shipId : -1));
if (m && tp && tsp) { const us = (tsp.shipping_profile_destinations || []).find((d) => d.destination_country_iso === "US") || (tsp.shipping_profile_destinations || [])[0]; if (us) { const lo = tp.min_processing_days + us.min_delivery_days, hi = tp.max_processing_days + us.max_delivery_days; if (`${lo}-${hi}` !== `${m[1]}-${m[2]}`) warnings.push(`The copied DELIVERY TIME FRAME says ${m[1]}-${m[2]} days (US) but the target profiles give ${lo}-${hi}. Kept as it is; say so if you want it recomputed.`); } }

const plan = { kind: "etsy-exact-clone-plan", generated: new Date().toISOString(), source: { account: srcAcc, listing_id: String(listingId), product_id: rec.product_id, state: L.state }, target: { account: tgtAcc }, status: blockers.length ? "BLOCKED_BY_ETSY_OR_MISSING_DATA" : "READY", blockers, warnings, mappings, steps: steps.map((s, i) => ({ n: i + 1, ...s })), bookkeeping };
if (arg("--out")) fs.writeFileSync(arg("--out"), JSON.stringify(plan, null, 2));
if (flag("--json")) { console.log(JSON.stringify(plan, null, 2)); process.exit(blockers.length ? 1 : 0); }

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
console.log(`# Exact clone: ${srcAcc}/${listingId} -> ${tgtAcc}   [${plan.status}]\n`);
if (blockers.length) { console.log("## BLOCKERS (Etsy itself would reject, or data is missing)"); blockers.forEach((b) => console.log("- " + b)); console.log(); }
if (warnings.length) { console.log("## Warnings (reported, never blocking)"); warnings.forEach((w) => console.log("- " + w)); console.log(); }
console.log("## Id mapping"); mappings.forEach((x) => console.log("- " + x)); console.log();
console.log("## Everything that will be written to " + tgtAcc + " (copy of the source, field for field)\n\n| Field | Value |\n|---|---|");
for (const [k, v] of Object.entries(create)) console.log(`| ${k} | ${cell(Array.isArray(v) ? v.join(", ") : v)} |`);
const inventoryStep = steps.find((s) => s.tool === "update_listing_inventory");
if (inventoryStep) console.log(`| variations | ${inventoryStep.args.products.length} products: ${inventoryStep.args.products.slice(0, 6).map((p) => p.property_values.map((v) => v.values.join("/")).join(" + ") + " $" + p.offerings[0]?.price + " x" + p.offerings[0]?.quantity).join("; ")}${inventoryStep.args.products.length > 6 ? "; ..." : ""} |`);
if (qs.length) console.log(`| personalization | ${qs.map((q) => `${q.question_type}: ${q.question_text}${q.required ? " (required)" : ""}`).join("; ")} |`);
console.log(`| images | ${(rec.images || []).length} in the same order, same alt text (rank 1: ${cell(rec.images?.[0]?.alt_text)}) |`);
console.log(`| video | ${rec.video ? "yes" : "none"} |`);
console.log(`| state | draft (publish only on a separate yes) |`);
console.log(`\n## Steps (${steps.length}) and bookkeeping`); steps.forEach((s, i) => console.log(`${i + 1}. ${s.tool}${s.capture ? ` -> ${s.capture}` : ""}${s.note ? "  // " + s.note : ""}`)); bookkeeping.forEach((b) => console.log("- " + b));
process.exit(blockers.length ? 1 : 0);
