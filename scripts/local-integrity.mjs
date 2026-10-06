#!/usr/bin/env node
// Local-only integrity check for the Etsy data store (no API calls, no writes).
// Cross-checks data/listings/<account>/*  <->  data/product-registry.json  <->  etsy-mcp-server/accounts.json,
// and validates each listing record's own fields. Live-vs-local comparison is scripts/sync-diff.mjs (etsy-sync-check skill).
// Usage: node scripts/local-integrity.mjs [--verbose] [--json]
import path from "node:path";
import { ROOT, tryJson, exists, isDir, listDir, flag, sevRank } from "./_lib.mjs";

const issues = [];
const add = (severity, account, listing_id, code, message) => issues.push({ severity, account, listing_id, code, message });
const accounts = tryJson(path.join(ROOT, "etsy-mcp-server", "accounts.json")).accounts || {};
const registry = tryJson(path.join(ROOT, "data", "product-registry.json"));
const regProducts = registry.products || [];

const regIndex = new Map();
for (const p of regProducts) for (const l of p.listings || []) {
  const key = `${l.account}\u0000${l.listing_id}`;
  if (regIndex.has(key) && regIndex.get(key) !== p.product_id) add("high", l.account, String(l.listing_id), "registry-dup", `listed under two product_ids: ${regIndex.get(key)} and ${p.product_id}`);
  regIndex.set(key, p.product_id);
}

const records = new Map();
const listingsDir = path.join(ROOT, "data", "listings");
for (const acct of listDir(listingsDir)) {
  const adir = path.join(listingsDir, acct);
  if (!isDir(adir)) continue;
  if (!(acct in accounts)) add("high", acct, null, "unknown-account", "data/listings folder has no matching account in accounts.json");
  for (const e of listDir(adir)) {
    const full = path.join(adir, e);
    let p, lid;
    if (isDir(full)) {
      p = path.join(full, "record.json"); lid = e;
      if (!exists(p)) { add("high", acct, lid, "no-record", "listing folder has no record.json"); continue; }
    } else if (e.endsWith(".json")) { p = full; lid = e.slice(0, -5); } else continue;
    const rec = tryJson(p);
    if (rec.__error__) { add("high", acct, lid, "bad-json", rec.__error__); continue; }
    records.set(`${acct}\u0000${lid}`, [p, rec]);
  }
}

for (const [key, [p, rec]] of records) {
  const [acct, lid] = key.split("\u0000");
  if (String(rec.listing_id) !== lid) add("high", acct, lid, "id-mismatch", `record.listing_id=${rec.listing_id} but filed as ${lid}`);
  if (rec.account != null && rec.account !== acct) add("high", acct, lid, "acct-mismatch", `record.account=${rec.account}`);
  const pid = rec.product_id;
  if (!pid) add("high", acct, lid, "no-product-id", "record has no product_id");
  else if (!regIndex.has(key)) add("high", acct, lid, "not-in-registry", `product_id=${pid} but listing missing from product-registry`);
  else if (regIndex.get(key) !== pid) add("high", acct, lid, "pid-mismatch", `record=${pid} registry=${regIndex.get(key)}`);
  if (!rec.sources || !rec.sources.length) add("high", acct, lid, "no-sources", "sources array empty/missing (hard rule: every product needs a source)");

  const ld = rec.listing_data || {};
  if (Array.isArray(ld.tags)) {
    if (ld.tags.length !== 13) add("med", acct, lid, "tag-count", `${ld.tags.length} tags (expected 13)`);
    for (const t of ld.tags) if (t.length > 20 || t !== t.toLowerCase() || /[^a-z0-9 '\-™©®]/.test(t)) add("med", acct, lid, "tag-rule", `tag breaks field rules: '${t}'`);
    if (new Set(ld.tags.map((t) => t.toLowerCase())).size !== ld.tags.length) add("med", acct, lid, "tag-dup", "duplicate tags");
  }
  if (ld.title && ld.title.length > 140) add("high", acct, lid, "title-len", `title is ${ld.title.length} chars`);
  if (!rec.state) add("med", acct, lid, "no-state", "record has no state");
  if (["edit", "inactive", "expired"].includes(rec.state)) add("low", acct, lid, "non-live-state", `state=${rec.state} (frozen/deactivated? check live)`);
  const base = path.dirname(p);
  for (const img of rec.images || []) {
    const rel = img && typeof img === "object" ? img.source_path || img.local_path || img.path : null;
    if (rel && !exists(path.join(base, rel)) && !exists(path.join(ROOT, rel))) add("low", acct, lid, "missing-image-file", rel);
  }
}
for (const [key, pid] of regIndex) if (!records.has(key)) { const [a, l] = key.split("\u0000"); add("med", a, l, "registry-orphan", `registry points at ${pid} but no local record exists`); }

const summary = {};
for (const i of issues) summary[i.code] = (summary[i.code] || 0) + 1;
if (flag("--json")) console.log(JSON.stringify({ records: records.size, registry_products: regProducts.length, summary, issues }, null, 2));
else {
  console.log(`records: ${records.size} | registry products: ${regProducts.length} | issues: ${issues.length}`);
  for (const [c, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
  console.log();
  if (flag("--verbose")) {
    for (const i of [...issues].sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || String(a.account).localeCompare(String(b.account)) || String(a.listing_id).localeCompare(String(b.listing_id))))
      console.log(`[${i.severity.padEnd(4)}] ${i.account}/${i.listing_id}  ${i.code}: ${i.message}`);
  } else {
    const groups = new Map();
    for (const i of issues) { const k = `${i.severity}\u0000${i.account}\u0000${i.code}`; (groups.get(k) || groups.set(k, []).get(k)).push(i); }
    for (const [k, items] of [...groups].sort((a, b) => { const [sa, aa, ca] = a[0].split("\u0000"), [sb, ab, cb] = b[0].split("\u0000"); return sevRank[sa] - sevRank[sb] || aa.localeCompare(ab) || ca.localeCompare(cb); })) {
      const [sev, acct, code] = k.split("\u0000");
      const ids = items.slice(0, 3).map((x) => x.listing_id).join(", ") + (items.length > 3 ? " ..." : "");
      console.log(`[${sev.padEnd(4)}] ${acct}: ${code} x${items.length}  e.g. ${ids}  -- ${items[0].message}`);
    }
    console.log("\n(use --verbose for every listing)");
  }
}
process.exit(issues.some((i) => i.severity === "high") ? 1 : 0);
