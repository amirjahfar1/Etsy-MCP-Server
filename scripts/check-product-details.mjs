#!/usr/bin/env node
// Check a product's intake file BEFORE a listing is created: what is missing, what is inconsistent, what is ready.
// Reads the product folder (product-details.txt in the v2 "KEY: value" format + the image files). No API calls, no writes.
// Node >= 18, identical on macOS, Windows and Linux.
//   node scripts/check-product-details.mjs "<product folder or product-details.txt>" [--json]
import fs from "node:fs";
import path from "node:path";
import { ROOT, tryJson, exists, isDir, listDir, flag } from "./_lib.mjs";

const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!target) { console.error('Usage: node scripts/check-product-details.mjs "<product folder or product-details.txt>" [--json]'); process.exit(2); }
const file = isDir(target) ? path.join(target, "product-details.txt") : target;
const folder = path.dirname(file);
if (!exists(file)) { console.error("No product-details.txt found at " + file); process.exit(2); }

// ---- parse "KEY [TAG]: value" lines (+ continuation lines)
const KEY = /^([A-Z][A-Z0-9_]{2,})(?:\s*\[([^\]]+)\])?\s*:\s*(.*)$/;
const fields = new Map(), order = [];
let cur = null;
for (const line of fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n")) {
  if (/^\s*#/.test(line) || /^===/.test(line)) { cur = null; continue; }
  const m = KEY.exec(line);
  if (m) { cur = { key: m[1], tag: m[2] || "", value: m[3].trim() }; fields.set(cur.key, cur); order.push(cur.key); continue; }
  if (cur && line.trim()) cur.value += (cur.value ? "\n" : "") + line.trim();
}
if (!fields.size) { console.log("✘ This file is in the OLD format (no KEY: value lines).\n  Create the new one with: node scripts/new-product.mjs --refresh-templates   then copy your answers across, or ask Claude to migrate this file.\n  Old files are still readable by Claude; the checker just cannot score them."); process.exit(1); }

const val = (k) => (fields.get(k)?.value || "").trim();
const has = (k) => val(k) !== "";
const lower = (k) => val(k).toLowerCase();
const type = lower("PRODUCT_TYPE"), digital = /digital|download/.test(lower("PHYSICAL_OR_DIGITAL"));
const appliesTo = (tag) => { const m = /REQUIRED\s+for\s+(.+)/i.exec(tag); if (!m) return /REQUIRED/i.test(tag); const types = m[1].toLowerCase().split(/[\/,]/).map((x) => x.trim()); return types.some((t) => t === type || (t === "digital" && digital)); };

const missingRequired = [], missingBest = [], warnings = [], notes = [];
const APPAREL_ONLY = new Set(["FIT_AND_STYLE", "PRINT_OR_EMBROIDERY_METHOD", "SIZE_RANGE", "FABRIC_COMPOSITION"]), DIGITAL_ONLY = new Set(["FILE_TYPES", "LICENSE_TERMS"]);
for (const k of order) { const f = fields.get(k); if (/^(STYLE_MATCH|VISUAL_CUES|PRODUCT_ANALYSIS)$/.test(k)) continue; if ((APPAREL_ONLY.has(k) && type !== "apparel") || (DIGITAL_ONLY.has(k) && !digital)) continue; if (!has(k)) { if (appliesTo(f.tag)) missingRequired.push(k); else if (/BEST/i.test(f.tag)) missingBest.push(k); } }

// ---- media on disk
const imgDirs = [folder, path.join(folder, "images")].filter(isDir);
const files = imgDirs.flatMap((d) => listDir(d).filter((f) => !isDir(path.join(d, f))).map((f) => f));
const images = files.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)), videos = files.filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f));
if (!images.length) { if (!missingRequired.includes("IMAGES_IN_FOLDER")) missingRequired.push("IMAGES_IN_FOLDER (no image files found in the folder or images/)"); else missingRequired[missingRequired.indexOf("IMAGES_IN_FOLDER")] = "IMAGES_IN_FOLDER (no image files found in the folder or images/)"; }
else if (images.length < 5) warnings.push(`Only ${images.length} image(s): target is 8-10; under 5 is a conversion risk.`);
else notes.push(`${images.length} image(s) found${videos.length ? `, ${videos.length} video` : ""}.`);
if (images.length && !images.some((f) => /featured/i.test(f)) && lower("FEATURED_MARKED") !== "yes") warnings.push('No image has "Featured" in its filename: say which one is the thumbnail (rename it, e.g. "Featured").');
if (/^yes/.test(lower("VIDEO")) && !videos.length) warnings.push("VIDEO says yes but no video file is in the folder.");
if (/ai|yes/.test(lower("AI_GENERATED_IMAGES")) === false && images.some((f) => /chatgpt|dall[- ]?e|midjourney|gemini_generated|firefly/i.test(f))) warnings.push("Image filenames look AI-generated (ChatGPT/Midjourney...) but AI_GENERATED_IMAGES is not yes: check, because the description needs an AI disclosure if the artwork itself is AI-made.");
const isApparel = type === "apparel";
if (isApparel && !/^yes/.test(lower("SIZE_CHART")) && !images.some((f) => /size.?chart/i.test(f))) warnings.push("Clothing needs a size chart image (it is always rank 2 in the gallery).");

// ---- account
try {
  const accounts = tryJson(path.join(ROOT, "etsy-mcp-server", "accounts.json")).accounts || {};
  const a = val("ACCOUNT"); if (a) {
    const hit = Object.keys(accounts).find((n) => n.toLowerCase() === a.toLowerCase() || (accounts[n].shop_name || "").toLowerCase() === a.toLowerCase());
    if (!hit) warnings.push(`ACCOUNT "${a}" does not match a connected account (use the name from list_accounts: ${Object.keys(accounts).join(", ") || "none"}).`);
    else if (accounts[hit].status === "deactivated") warnings.push(`Account "${hit}" is deactivated: reactivate it (set_account_status) or choose another account.`);
    else if (digital && /abbas/i.test(hit)) warnings.push("abbas_etsy sells physical products only (owner rule): this is digital.");
  }
} catch { /* optional */ }

// ---- consistency
const ret = lower("RETURN_POLICY");
if (ret && /(\d+\s*day|accept|allow|return(s)? ok)/.test(ret) && !/no return|no exchange|not accept/.test(ret)) warnings.push("RETURN_POLICY accepts returns, but the description's DELIVERY TIME FRAME footer says 'we do not accept returns or exchanges'. Either keep 'no returns' or the footer must change; they cannot disagree.");
if (/925|sterling|solid gold|\b1[048]k\b/.test(lower("MATERIAL_AND_FINISH")) && !/925|sterling|solid gold|\b1[048]k\b/.test(lower("SPEC_SHEET_PASTE"))) warnings.push("MATERIAL_AND_FINISH claims 925/sterling/solid gold but SPEC_SHEET_PASTE does not confirm it. A plated alloy sold as 925 is a misleading-claim risk: verify against the supplier spec.");
if (lower("SHIPPING_EXCEPTION") && /(\$\s*\d|uk free|europe|rest of world)/.test(lower("SHIPPING_EXCEPTION"))) notes.push("SHIPPING_EXCEPTION is set: it overrides the account's standard shipping profile for this product.");
if (/^(yes|y)\b/.test(lower("BRAND_OR_CHARACTER_IN_PRODUCT"))) notes.push("Brand/character present: Claude will ask ONE time 'list it anyway?'; your yes is final for this product.");
if (/^(yes|y)\b/.test(lower("AI_GENERATED_IMAGES"))) notes.push("AI-generated artwork: the description will carry the AI disclosure line.");
if (/^(yes|y)\b/.test(lower("PERSONALIZED")) && !has("PERSONALIZATION_DETAILS")) warnings.push("PERSONALIZED is yes but PERSONALIZATION_DETAILS is empty: the buyer questions cannot be built.");
if (has("SELLING_PRICE") && !/\d/.test(val("SELLING_PRICE"))) warnings.push("SELLING_PRICE has no number.");
const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
const cost = nums(val("COST_PRICE")), price = nums(val("SELLING_PRICE"));
if (cost.length && price.length) { const c = Math.max(...cost), p = Math.min(...price); const m = (x) => Math.round(100 * (x - c) / x); notes.push(`Margin at the lowest list price: ${m(p)}% (cost ${c}, price ${p}); at 30% off: ${m(p * 0.7)}%${m(p * 0.7) < 15 ? "  <- thin once a 30% sale runs" : ""}. Reported only: the price stays your decision.`); }
if (digital && isApparel) warnings.push("PRODUCT_TYPE apparel but PHYSICAL_OR_DIGITAL digital: check.");
if (!has("SOURCE") && !missingRequired.includes("SOURCE")) missingRequired.push("SOURCE");

const out = { file, product_type: type || null, ready: missingRequired.length === 0, missing_required: missingRequired, missing_recommended: missingBest, warnings, notes, filled: order.filter((k) => has(k)).length, total: order.length };
if (flag("--json")) { console.log(JSON.stringify(out, null, 2)); process.exit(out.ready ? 0 : 1); }
console.log(`${out.ready ? "✔ READY to create" : "✘ NOT READY"}: ${path.basename(folder)}  (${out.filled}/${out.total} fields filled, type: ${type || "not set"})`);
if (missingRequired.length) { console.log("\nREQUIRED, still missing:"); missingRequired.forEach((k) => console.log("  - " + k)); }
if (warnings.length) { console.log("\nFix or confirm:"); warnings.forEach((w) => console.log("  ! " + w)); }
if (missingBest.length) { console.log("\nNot required, but each one makes the listing better:"); console.log("  " + missingBest.join(", ")); }
if (notes.length) { console.log("\nNotes:"); notes.forEach((n) => console.log("  - " + n)); }
process.exit(out.ready ? 0 : 1);
