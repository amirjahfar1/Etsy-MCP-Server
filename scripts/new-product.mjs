#!/usr/bin/env node
// Create a product folder from the canonical intake template, or refresh the local _template copies from it.
// The canonical template lives in the repo (templates/product-details/product-details.txt) so upgrades from GitHub deliver improvements;
// Add Product/ itself is local-only. Node >= 18, identical on macOS, Windows, Linux. No API calls.
//   node scripts/new-product.mjs <aliexpress|jewelry|custom> "<product name or AliExpress id>" [--category Rings] [--account "<name>"]
//   node scripts/new-product.mjs --refresh-templates          (backs up each existing _template/product-details.txt first)
import fs from "node:fs";
import path from "node:path";
import { ROOT, exists, isDir, flag, arg } from "./_lib.mjs";

const TEMPLATE = path.join(ROOT, "templates", "product-details", "product-details.txt");
if (!exists(TEMPLATE)) { console.error("Canonical template missing: " + TEMPLATE); process.exit(2); }
const base = path.resolve(arg("--add-product") || path.join(ROOT, "Add Product"));
const where = { aliexpress: path.join(base, "AliExpress"), jewelry: path.join(base, "Jewelry Products"), custom: path.join(base, "Custom") };
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

if (flag("--refresh-templates")) {
  let n = 0;
  for (const [kind, dir] of Object.entries(where)) {
    const t = path.join(dir, "_template");
    if (!isDir(t)) { console.log(`- ${kind}: no _template folder, skipped`); continue; }
    const f = path.join(t, "product-details.txt");
    if (exists(f)) fs.copyFileSync(f, path.join(t, `product-details.backup-${stamp}.txt`));
    fs.copyFileSync(TEMPLATE, f);
    if (kind !== "jewelry" && !isDir(path.join(t, "images"))) fs.mkdirSync(path.join(t, "images"), { recursive: true });
    console.log(`✔ ${kind}: ${path.relative(ROOT, f)} refreshed (old one saved as product-details.backup-${stamp}.txt)`); n++;
  }
  process.exit(n ? 0 : 1);
}

const [kind, name] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !["--category", "--account", "--add-product"].includes(all[i - 1]));
if (!where[kind] || !name) { console.error('Usage: node scripts/new-product.mjs <aliexpress|jewelry|custom> "<name>" [--category Rings] [--account "<name>"]\n       node scripts/new-product.mjs --refresh-templates'); process.exit(2); }
let parent = where[kind];
if (kind === "jewelry") { const cat = arg("--category"); if (!cat) { console.error('Jewelry products live in a category folder: add --category Rings (or Necklaces, Bracelets, ...)'); process.exit(2); } parent = path.join(parent, cat); }
const dir = path.join(parent, name);
if (exists(dir)) { console.error("Already exists: " + dir); process.exit(2); }
fs.mkdirSync(path.join(dir, "images"), { recursive: true });
let text = fs.readFileSync(TEMPLATE, "utf8");
const set = (key, value) => { text = text.replace(new RegExp(`^(${key}(?: \\[[^\\]]+\\])?:).*$`, "m"), `$1 ${value}`); };
set("PRODUCT_TYPE", { jewelry: "jewelry", aliexpress: "", custom: "" }[kind]);
set("PHYSICAL_OR_DIGITAL", "physical");
if (/^\d{10,}$/.test(name)) set("ALIEXPRESS_ID", name);
if (arg("--account")) set("ACCOUNT", arg("--account"));
fs.writeFileSync(path.join(dir, "product-details.txt"), text);
console.log(`✔ Created ${path.relative(ROOT, dir)}\n  - put the product photos (and video) in ${path.join(path.relative(ROOT, dir), "images")} (or directly in the folder)\n  - fill product-details.txt, then check it:  node scripts/check-product-details.mjs "${path.relative(ROOT, dir)}"`);
