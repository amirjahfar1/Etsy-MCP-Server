#!/usr/bin/env node
// Compare ONE account's live Etsy listings against its local records (data/listings/<account>/).
// Live data comes from a compact JSON file written by a read-only sub-agent in the etsy-sync-check skill: a JSON list of
// { listing_id, state, title, tags, description, price (decimal), quantity, who_made, when_made, taxonomy_id, materials,
//   styles, shipping_profile_id, readiness_state_id, return_policy_id, processing_min, processing_max, image_count,
//   has_video, views, num_favorers, url }. No API calls here. Default is report-only.
// Usage: node scripts/sync-diff.mjs <account> <live.json> [--apply] [--snapshot] [--json]
//   --apply     write live values into the local record for drifted fields (+ a sync_log entry). Local bookkeeping only.
//   --snapshot  append today's views/num_favorers/price/state per listing to data/metrics/<account>.jsonl
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, exists, isDir, listDir, flag } from "./_lib.mjs";

const pos = process.argv.slice(2).filter((x) => !x.startsWith("--"));
if (pos.length !== 2) { console.error("Usage: node scripts/sync-diff.mjs <account> <live.json> [--apply] [--snapshot] [--json]"); process.exit(2); }
const [account, livePath] = pos;
const apply = flag("--apply"), snapshot = flag("--snapshot");
const today = new Date().toISOString().slice(0, 10);

const live = new Map(readJson(livePath).map((x) => [String(x.listing_id), x]));
const adir = path.join(ROOT, "data", "listings", account);
const records = new Map();
for (const e of listDir(adir)) {
  const full = path.join(adir, e);
  const p = isDir(full) ? path.join(full, "record.json") : full;
  if (p.endsWith(".json") && exists(p)) records.set(e.replace(/\.json$/, ""), [p, readJson(p)]);
}

const norm = (s) => (s || "").trim().replace(/\s+/g, " ");
const lowerArr = (a) => (a || []).map((x) => String(x).toLowerCase());
function same(f, r, l) {
  if (f === "tags") return JSON.stringify(lowerArr(r)) === JSON.stringify(lowerArr(l));
  if (f === "materials" || f === "styles") return JSON.stringify(lowerArr(r).sort()) === JSON.stringify(lowerArr(l).sort());
  if (f === "description") return norm(r) === norm(l);
  if (f === "price") return r != null && l != null && Math.abs(Number(r) - Number(l)) < 0.005;
  return r === l;
}
const FIELDS = ["title", "tags", "description", "price", "who_made", "when_made", "taxonomy_id", "materials", "styles", "shipping_profile_id", "readiness_state_id", "return_policy_id", "processing_min", "processing_max"];
// Etsy's API reports an unpublished draft as "inactive" (verified live 2026-10-07), so draft == inactive here.
const eqState = (s) => (s === "draft" ? "inactive" : s);

const findings = [];
for (const [lid, [p, rec]] of records) {
  if (!live.has(lid)) { findings.push({ listing_id: lid, kind: "record-only", detail: `local state=${rec.state}, not returned by Etsy (deleted? other state filter?)` }); continue; }
  const lv = live.get(lid), ld = rec.listing_data || {}, drift = {};
  for (const f of FIELDS) if (f in lv && lv[f] != null && !same(f, ld[f], lv[f])) drift[f] = { local: ld[f], live: lv[f] };
  if (lv.state && eqState(lv.state) !== eqState(rec.state)) drift.state = { local: rec.state, live: lv.state };
  // Image/video counts come from a sub-agent and proved unreliable (a live video was reported missing): reported as
  // UNVERIFIED and never applied. Confirm with get_listing_images / get_listing_videos first.
  const nImg = (rec.images || []).length;
  if ("image_count" in lv && lv.image_count !== nImg) drift["image_count(unverified)"] = { local: nImg, live: lv.image_count };
  if ("has_video" in lv && Boolean(lv.has_video) !== Boolean(rec.video)) drift["video(unverified)"] = { local: Boolean(rec.video), live: Boolean(lv.has_video) };
  if (Object.keys(drift).length) {
    findings.push({ listing_id: lid, kind: "drift", fields: drift });
    if (apply) {
      for (const [f, d] of Object.entries(drift)) { if (FIELDS.includes(f)) ld[f] = d.live; else if (f === "state") rec.state = d.live; }
      rec.listing_data = ld; rec.last_updated = today;
      (rec.sync_log ||= []).push({ date: today, applied_from_live: Object.keys(drift).filter((k) => FIELDS.includes(k) || k === "state").sort() });
      fs.writeFileSync(p, JSON.stringify(rec, null, 2));
    }
  }
}
for (const [lid, lv] of live) if (!records.has(lid)) findings.push({ listing_id: lid, kind: "live-only", detail: `on Etsy (state=${lv.state}) '${(lv.title || "").slice(0, 60)}' but no local record` });

if (snapshot) {
  const mdir = path.join(ROOT, "data", "metrics");
  fs.mkdirSync(mdir, { recursive: true });
  const lines = [...live].map(([lid, lv]) => JSON.stringify({ date: today, listing_id: lid, state: lv.state, views: lv.views, num_favorers: lv.num_favorers, price: lv.price }));
  fs.appendFileSync(path.join(mdir, `${account}.jsonl`), lines.join("\n") + "\n");
}

if (flag("--json")) console.log(JSON.stringify({ account, live: live.size, records: records.size, findings, applied: apply }, null, 2));
else {
  console.log(`${account}: live ${live.size} | local records ${records.size} | findings ${findings.length}${apply ? " | APPLIED to records" : ""}`);
  const cut = (v) => JSON.stringify(v === undefined ? null : v).slice(0, 40);
  for (const x of findings) {
    if (x.kind === "drift") console.log(`- drift     ${x.listing_id}: ` + Object.entries(x.fields).map(([k, v]) => `${k}: local=${cut(v.local)} live=${cut(v.live)}`).join("; "));
    else console.log(`- ${x.kind.padEnd(10)} ${x.listing_id}: ${x.detail}`);
  }
}
