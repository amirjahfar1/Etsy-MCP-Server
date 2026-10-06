#!/usr/bin/env node
// Deterministic first pass of the etsy-risk-scan skill (no API calls, no writes).
// Scans local listing records (title, tags, description, materials, styles) and the Add Product/ staging folder names
// against scripts/risk-terms.txt, plus a few mechanical risk checks. Output is evidence for Claude to judge, not a verdict.
// Usage: node scripts/risk-prefilter.mjs [--account NAME] [--staging] [--json]
import fs from "node:fs";
import path from "node:path";
import { ROOT, tryJson, exists, isDir, listDir, arg, flag } from "./_lib.mjs";

const only = arg("--account");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const terms = fs.readFileSync(path.join(ROOT, "scripts", "risk-terms.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((t) => t.toLowerCase());
const pats = terms.map((t) => [t, new RegExp(`(?<![a-z0-9])${esc(t)}(?![a-z0-9])`)]);
const BUYER_BANNED = /(?<![a-z0-9])(aliexpress|alibaba|1688|dropship\w*|temu|dhgate)(?![a-z0-9])/;
const HANDMADE = /(?<![a-z0-9])(hand[- ]?made|handcrafted|hand[- ]crafted|made by hand|i make|we make|made by me)(?![a-z0-9])/;
const AI_FILE = /chatgpt|dall[- ]?e|midjourney|gemini_generated|firefly/i;

const hits = [];
const hit = (kind, where, ref, detail) => hits.push({ kind, where, ref, detail });
function scanText(text, where, ref) {
  const low = (text || "").toLowerCase();
  for (const [t, p] of pats) if (p.test(low)) hit("brand-term", where, ref, t);
  const m = low.match(BUYER_BANNED);
  if (m) hit("sourcing-word-buyer-visible", where, ref, m[0]);
}

const accounts = tryJson(path.join(ROOT, "etsy-mcp-server", "accounts.json")).accounts || {};
const listingsDir = path.join(ROOT, "data", "listings");
for (const acct of listDir(listingsDir)) {
  if (only && acct !== only) continue;
  if (!only && accounts[acct]?.status === "deactivated") continue; // legacy; scan explicitly with --account
  const adir = path.join(listingsDir, acct);
  for (const e of listDir(adir)) {
    const full = path.join(adir, e);
    const p = isDir(full) ? path.join(full, "record.json") : full;
    if (!p.endsWith(".json") || !exists(p)) continue;
    const r = tryJson(p);
    if (r.__error__) continue;
    const ld = r.listing_data || {};
    const ref = `${acct}/${r.listing_id ?? e}`;
    for (const f of ["title", "description"]) scanText(ld[f], f, ref);
    for (const t of ld.tags || []) scanText(t, "tag", ref);
    for (const f of ["materials", "styles"]) for (const v of ld[f] || []) scanText(v, f, ref);
    if (ld.who_made === "someone_else" && HANDMADE.test(`${ld.description || ""} ${ld.title || ""}`.toLowerCase())) hit("handmade-claim-vs-someone_else", "copy", ref, "copy claims handmade but who_made=someone_else");
    if (["edit", "inactive"].includes(r.state)) hit("non-live-state", "state", ref, r.state);
  }
}

if (flag("--staging")) {
  const walk = (dir) => {
    for (const n of listDir(dir)) {
      const full = path.join(dir, n);
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      const low = n.toLowerCase();
      const skip = n === "_template" || (n.endsWith(".txt") && !low.startsWith("product-details"));
      if (!skip) {
        for (const [t, p] of pats) if (p.test(low)) hit("brand-term", "staging-name", rel, t);
        if (AI_FILE.test(n)) hit("ai-generated-image-filename", "staging-image", rel, "check AI-disclosure + image-requirements guides");
        if (low === "product-details.txt") {
          try { const txt = fs.readFileSync(full, "utf8").toLowerCase(); for (const [t, p] of pats) if (p.test(txt)) hit("brand-term", "staging-details", rel, t); } catch { /* unreadable */ }
        }
      }
      if (isDir(full)) walk(full);
    }
  };
  walk(path.join(ROOT, "Add Product"));
}

if (flag("--json")) console.log(JSON.stringify(hits, null, 2));
else {
  console.log(`${hits.length} flag(s)`);
  const seen = new Map();
  for (const h of hits) { const k = `${h.kind}\u0000${h.ref}`; (seen.get(k) || seen.set(k, []).get(k)).push(h.detail); }
  for (const [k, d] of [...seen].sort((a, b) => (a[0] < b[0] ? -1 : 1))) { const [kind, ref] = k.split("\u0000"); console.log(`- ${kind.padEnd(34)} ${ref}  -> ${[...new Set(d)].sort().join(", ")}`); }
}
