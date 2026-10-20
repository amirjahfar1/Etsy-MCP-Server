#!/usr/bin/env node
// Deterministic keyword / title / tag statistics for the rank-first title formula, tag slot model and listing optimization.
// The model never counts by eye: it quotes numbers from this script's output.
//
// Input: a folder of per-term JSON files (one per search term), as produced by scripts/term-file.mjs from a `search_listings` pull:
//   { term, total_count, results: [ { rank, listing_id, shop_id, title, tags[], price, currency, price_converted?, quantity,
//     created, original_created?, updated, num_favorers?, taxonomy_id?, desc_len } ] }
// Optional: own.json (the shop's own listings: listing_id, state, title, tags[], price, views, num_favorers, created, styles[]) for a gap
// comparison, and --map <file> {listing_id: "term"} to say which researched term each own listing competes in (the automatic
// guess is only a hint and mis-assigns ~1/3 of listings).
// No API calls. No writes unless --out. Node >= 18, identical on macOS, Windows and Linux.
//
// Usage: node scripts/keyword-stats.mjs <folder> [--exclude "<regex>"] [--own own.json] [--map map.json] [--json] [--md] [--out file]
//   --exclude  drop noise titles before any statistic (e.g. "dish|holder|box|tray|decor|trinket" for rings)
import fs from "node:fs";
import path from "node:path";
import { ROOT, flag, arg, readJson } from "./_lib.mjs";

const VALUE_FLAGS = new Set(["--exclude", "--own", "--map", "--out"]);
const pos = []; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (VALUE_FLAGS.has(a)) i++; else if (!a.startsWith("--")) pos.push(a); }
const dir = pos[0];
if (!dir) { console.error('Usage: node scripts/keyword-stats.mjs <folder> [--exclude "<regex>"] [--own file] [--map file] [--json] [--md] [--out file]'); process.exit(2); }
const exclude = arg("--exclude") ? new RegExp(arg("--exclude"), "i") : null;
const ownName = arg("--own") || (fs.existsSync(path.join(dir, "own.json")) ? "own.json" : "anas-own.json");
const ownFile = path.join(dir, ownName);
const NOW = Date.now() / 1000;

// ---------- helpers ----------
const STOP = new Set(["for", "the", "and", "a", "of", "with", "to", "in", "on", "an", "or", "your", "her", "his", "him", "she", "you", "is", "by", "my", "at", "it"]);
const tok = (s) => (s || "").toLowerCase().replace(/&#39;|'/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const norm = (s) => tok(s).join(" ");
const cut40 = (title) => { const t = title.trim(); if (t.length <= 40) return t; const c = t.slice(0, 41); const i = c.lastIndexOf(" "); return (i > 15 ? c.slice(0, i) : t.slice(0, 40)).trim(); };
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const q = (arr, p) => { const a = arr.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return +(a[lo] + (a[hi] - a[lo]) * (i - lo)).toFixed(2); };
const inc = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
const top = (map, n, min = 1) => [...map].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
const contains = (hay, needle) => (" " + hay + " ").includes(" " + needle + " ");
function ngrams(tokens, n) { const out = []; for (let i = 0; i + n <= tokens.length; i++) { const g = tokens.slice(i, i + n); if (STOP.has(g[0]) || STOP.has(g[n - 1])) continue; out.push(g.join(" ")); } return out; }

const PRECIOUS = /sterling|925|solid gold|\b(10|14|18|22)\s?k\b|tungsten|moissanite|diamond|gemstone|platinum/i;
const SLOTS = [
  ["audience", /\b(for her|for him|for men|for women|mens|men's|womens|unisex|boyfriend|girlfriend)\b/],
  ["gift", /\bgift/],
  ["occasion", /\b(christmas|halloween|valentine|birthday|anniversary|wedding|mother|father|graduation|easter)\b/],
  ["material", /\b(silver|925|sterling|gold|brass|copper|steel|titanium|bronze|alloy|plated|zinc|crystal|cz)\b/],
  ["format", /\b(adjustable|open|wrap|dangle|choker|stud|hoop|huggie|cuff|band|stacking|chain|drop|statement|thumb|pinky|signet)\b/],
  ["style", /\b(goth|gothic|punk|witchy|boho|bohemian|vintage|retro|victorian|minimalist|grunge|alt|alternative|dark|celestial|occult|medieval|fantasy|cottagecore|y2k|edgy|biker|norse)\b/],
];
const slotOf = (tag) => { const t = tag.toLowerCase(); for (const [name, re] of SLOTS) if (re.test(t)) return name; return "motif"; };
const tier = (p) => (p >= 50 ? "core" : p >= 10 ? "standard" : p >= 5 ? "niche" : "noise");

// brand/franchise terms must never be offered as tag suggestions
const brands = (() => { try { return fs.readFileSync(path.join(ROOT, "scripts", "risk-terms.txt"), "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")); } catch { return []; } })();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const brandRe = brands.length ? new RegExp(`(?<![a-z0-9])(${brands.map(esc).join("|")})(?![a-z0-9])`) : null;

// ---------- per-term statistics ----------
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== ownName && f !== "stats.json" && f !== "map.json").sort();
const terms = [];
for (const f of files) {
  let d; try { d = readJson(path.join(dir, f)); } catch { continue; }
  if (!d.term || !Array.isArray(d.results)) continue; // not a per-term search file
  const all = d.results;
  const R = exclude ? all.filter((r) => !exclude.test(r.title)) : all;
  const N = R.length, droppedNoise = all.length - N;
  const termN = norm(d.term), termToks = tok(d.term);

  // price: prefer converted USD, else native USD; both reported
  const priceOf = (r) => (typeof r.price_converted === "number" && (r.price_converted_currency || "USD") === "USD" ? r.price_converted : (r.currency || "USD") === "USD" && typeof r.price === "number" ? r.price : null);
  const prices = R.map((r) => ({ r, p: priceOf(r) })).filter((x) => x.p !== null);
  const pAll = prices.map((x) => x.p), pLfl = prices.filter((x) => !PRECIOUS.test(x.r.title + " " + (x.r.tags || []).join(" "))).map((x) => x.p);

  const leads = new Map(), lead2 = new Map(), lead3 = new Map(), tagc = new Map(), tagWords = new Map(), gramAny = new Map(), sep = { comma: 0, pipe: 0, dash: 0 };
  let inFirst40 = 0, startsWith = 0, headTag = 0, repeatWord = 0, brandDropped = new Set();
  for (const r of R) {
    const lead = cut40(r.title), lt = tok(lead);
    if (contains(lt.join(" "), termN)) inFirst40++;
    if (lt.join(" ").startsWith(termN)) startsWith++;
    inc(leads, lt.slice(0, 3).join(" "));
    for (const g of ngrams(lt, 2)) inc(lead2, g);
    for (const g of ngrams(lt, 3)) inc(lead3, g);
    for (const g of new Set([...ngrams(tok(r.title), 2), ...ngrams(tok(r.title), 3)])) inc(gramAny, g);
    const seen = new Set();
    for (const t of r.tags || []) {
      const k = t.toLowerCase().trim();
      if (seen.has(k)) continue; seen.add(k);
      if (brandRe && brandRe.test(k)) { brandDropped.add(k); continue; }
      inc(tagc, k);
      for (const w of new Set(tok(k))) if (!STOP.has(w)) inc(tagWords, w);
    }
    if ([...seen].some((t) => norm(t) === termN)) headTag++;
    if (r.title.includes(",")) sep.comma++; if (r.title.includes("|")) sep.pipe++; if (/ - /.test(r.title)) sep.dash++;
    const words = tok(r.title).filter((w) => w.length >= 4); if (new Set(words).size < words.length) repeatWord++;
  }
  const tl = R.map((r) => r.title.length);
  const hist = (lo, hi) => pct(tl.filter((x) => x >= lo && x <= hi).length, N);
  const ageOf = (r) => { const t = r.original_created ?? r.created; return t ? (NOW - t) / 86400 : null; };
  const ages = R.map(ageOf).filter((x) => x !== null && x >= 0);
  const ageField = R.some((r) => r.original_created) ? "original_created" : "created_or_renewed";
  const fav = R.map((r) => r.num_favorers).filter((x) => typeof x === "number");

  // rank gradient: do the patterns strengthen toward the top?
  const slice = (a, b) => R.filter((r) => r.rank >= a && r.rank <= b);
  const grad = (rows) => rows.length ? ({ n: rows.length, median_title_len: q(rows.map((r) => r.title.length), 0.5), in_first40_pct: pct(rows.filter((r) => contains(tok(cut40(r.title)).join(" "), termN)).length, rows.length), head_tag_pct: pct(rows.filter((r) => (r.tags || []).some((t) => norm(t) === termN)).length, rows.length) }) : null;

  const exactInFirst40 = pct(inFirst40, N), exactHeadTag = pct(headTag, N);
  const termType = exactInFirst40 >= 65 ? "motif (term leads the title)" : exactHeadTag >= 60 ? "style/format (carried by the tag + later title segments)" : "mixed";
  const tagRows = top(tagc, 40, 2).map(([tag, c]) => { const p = pct(c, N); return { tag, n: c, pct: p, tier: tier(p), slot: slotOf(tag) }; });

  terms.push({
    term: d.term, total_results_on_etsy: d.total_count, sample: all.length, usable: N, dropped_noise: droppedNoise,
    shops: new Set(R.map((r) => r.shop_id)).size,
    term_type: termType, exact_in_first40_pct: exactInFirst40, starts_with_term_pct: pct(startsWith, N), exact_head_tag_pct: exactHeadTag,
    price_usd: { n: pAll.length, dropped_non_usd: N - pAll.length, min: q(pAll, 0), p25: q(pAll, 0.25), median: q(pAll, 0.5), p75: q(pAll, 0.75), max: q(pAll, 1) },
    price_like_for_like: { note: "excludes sterling/925/solid gold/gemstone/tungsten/diamond/platinum listings", n: pLfl.length, p25: q(pLfl, 0.25), median: q(pLfl, 0.5), p75: q(pLfl, 0.75) },
    title: { median_len: q(tl, 0.5), len_hist_pct: { under60: hist(0, 59), "60_99": hist(60, 99), "100_129": hist(100, 129), "130_140": hist(130, 140) }, pct_repeating_a_4plus_letter_word: pct(repeatWord, N), separators_pct: { comma: pct(sep.comma, N), pipe: pct(sep.pipe, N), dash: pct(sep.dash, N) } },
    lead_phrases_first40: { top3word: top(leads, 6, 2), top2gram: top(lead2, 10, 3), top3gram: top(lead3, 8, 2) },
    title_phrases_anywhere: top(gramAny, 15, Math.max(4, Math.round(N * 0.12))),
    tags: { median_count: q(R.map((r) => (r.tags || []).length), 0.5), pct_using_13: pct(R.filter((r) => (r.tags || []).length === 13).length, N), pct_with_uppercase: pct(R.filter((r) => (r.tags || []).some((t) => t !== t.toLowerCase())).length, N), top_tags: tagRows, top_tag_words: top(tagWords, 15, 3), brand_tags_removed: [...brandDropped].slice(0, 10), tiers_rule: "core >=50%, standard 10-49%, niche 5-9%, noise <5% (of usable sample)" },
    rank_gradient: { top10: grad(slice(1, 10)), ranks_31_40: grad(slice(31, 40)) },
    listing_age_days: { field: ageField, median: q(ages, 0.5), pct_last_30d: pct(ages.filter((a) => a <= 30).length, N), pct_last_90d: pct(ages.filter((a) => a <= 90).length, N), warning: ageField === "created_or_renewed" ? "created_timestamp probably resets on renewal/sale: treat as a demand proxy, not newness" : undefined },
    favorers_median: fav.length ? q(fav, 0.5) : null,
    description_len_median: q(R.map((r) => r.desc_len).filter((x) => typeof x === "number"), 0.5),
  });
}

const tagTerms = new Map();
for (const t of terms) for (const x of t.tags.top_tags) (tagTerms.get(x.tag) || tagTerms.set(x.tag, []).get(x.tag)).push(t.term);
const cross_term_tags = [...tagTerms].filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([tag, v]) => ({ tag, in_terms: v.length, slot: slotOf(tag) }));
const shopTerms = new Map();
for (const f of files) { try { const d = readJson(path.join(dir, f)); if (!d.term) continue; for (const s of new Set((d.results || []).map((r) => r.shop_id))) inc(shopTerms, s); } catch { /* skip */ } }
const shops_in_2plus_terms = [...shopTerms.values()].filter((c) => c >= 2).length;

// ---------- own-shop comparison ----------
let own = null;
if (fs.existsSync(ownFile)) {
  const mine = readJson(ownFile);
  const map = arg("--map") && fs.existsSync(arg("--map")) ? readJson(arg("--map")) : {};
  const byTerm = new Map(terms.map((t) => [t.term, t]));
  const jacc = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };
  const allMarketTags = new Set(); for (const t of terms) for (const x of t.tags.top_tags) allMarketTags.add(x.tag);
  own = mine.map((m) => {
    const lead = tok(cut40(m.title));
    let t = map[m.listing_id] ? byTerm.get(map[m.listing_id]) : null, how = t ? "map" : null;
    if (!t) { // hint only: same product type (last word of the term) in the title lead, then most shared words
      const mt = tok(m.title + " " + (m.tags || []).join(" "));
      const cands = terms.filter((x) => { const type = tok(x.term).slice(-1)[0]; return lead.includes(type) || lead.includes(type + "s"); })
        .map((x) => ({ x, s: jacc(mt, tok(x.term + " " + x.tags.top_tags.slice(0, 8).map((y) => y.tag).join(" "))) })).sort((a, b) => b.s - a.s);
      if (cands[0] && cands[0].s > 0.04) { t = cands[0].x; how = "auto-guess"; }
    }
    const have = new Set((m.tags || []).map((x) => x.toLowerCase().trim()));
    const want = t ? t.tags.top_tags.filter((x) => x.tier !== "noise").slice(0, 15) : [];
    const seenAnywhere = (m.tags || []).filter((x) => allMarketTags.has(x.toLowerCase().trim())).length;
    const termN = t ? norm(t.term) : null;
    return {
      listing_id: m.listing_id, state: m.state, title: m.title, title_len: m.title.length, matched_term: t?.term || null, matched_by: how,
      lead40: cut40(m.title), exact_term_in_first40: t ? contains(tok(cut40(m.title)).join(" "), termN) : null, exact_head_tag: t ? [...have].some((x) => norm(x) === termN) : null,
      tags_seen_in_any_researched_top25: `${seenAnywhere}/${(m.tags || []).length}`,
      price: m.price, like_for_like_median: t?.price_like_for_like.median ?? null, price_vs_like_for_like: t && t.price_like_for_like.median ? +(m.price / t.price_like_for_like.median).toFixed(2) : null,
      tags_n: (m.tags || []).length, top_tags_covered: t ? `${want.filter((x) => have.has(x.tag)).length}/${want.length}` : null,
      missing_top_tags: want.filter((x) => !have.has(x.tag)).slice(0, 8).map((x) => `${x.tag} (${x.pct}%, ${x.slot})`),
      views: m.views, favorers: m.num_favorers, age_days: m.created ? Math.round((NOW - m.created) / 86400) : null, styles: m.styles,
    };
  });
}

const out = { generated: new Date().toISOString().slice(0, 10), exclude: exclude ? exclude.source : null, terms, cross_term_tags, shops_in_2plus_terms, own };
if (arg("--out")) fs.writeFileSync(arg("--out"), JSON.stringify(out, null, 2));

// ---------- output ----------
if (flag("--json")) console.log(JSON.stringify(out, null, 2));
else if (flag("--md")) {
  for (const t of terms) {
    console.log(`\n| Rank-first evidence ("${t.term}", top ${t.sample}, ${out.generated}) | Result |\n|---|---|`);
    console.log(`| Usable / dropped as noise | ${t.usable} / ${t.dropped_noise} |`);
    console.log(`| Exact phrase in first 40 chars / title starts with it | ${t.exact_in_first40_pct}% / ${t.starts_with_term_pct}% |`);
    console.log(`| Term type | ${t.term_type} |`);
    console.log(`| Top lead 2-grams (count) | ${t.lead_phrases_first40.top2gram.slice(0, 4).map(([g, c]) => `${g} (${c})`).join(", ")} |`);
    console.log(`| Exact head term used as a tag | ${t.exact_head_tag_pct}% |`);
    console.log(`| Title length: median / share 130-140 | ${t.title.median_len} / ${t.title.len_hist_pct["130_140"]}% |`);
    console.log(`| Like-for-like price p25 / median / p75 (n) | $${t.price_like_for_like.p25} / $${t.price_like_for_like.median} / $${t.price_like_for_like.p75} (${t.price_like_for_like.n}) |`);
  }
} else {
  for (const t of terms) {
    console.log(`\n=== "${t.term}"  (${t.total_results_on_etsy?.toLocaleString?.() ?? t.total_results_on_etsy} on Etsy; sample ${t.sample}, usable ${t.usable}, noise dropped ${t.dropped_noise}, ${t.shops} shops)`);
    console.log(`type: ${t.term_type} | exact phrase in first 40: ${t.exact_in_first40_pct}% | starts with it: ${t.starts_with_term_pct}% | exact head tag: ${t.exact_head_tag_pct}%`);
    console.log(`price USD median $${t.price_usd.median} (n=${t.price_usd.n}, non-USD dropped ${t.price_usd.dropped_non_usd}) | like-for-like median $${t.price_like_for_like.median} (p25 $${t.price_like_for_like.p25} - p75 $${t.price_like_for_like.p75}, n=${t.price_like_for_like.n})`);
    console.log(`title: median ${t.title.median_len} chars, hist ${JSON.stringify(t.title.len_hist_pct)}, repeats a word ${t.title.pct_repeating_a_4plus_letter_word}%, separators ${JSON.stringify(t.title.separators_pct)}`);
    console.log(`lead 2-grams: ${t.lead_phrases_first40.top2gram.slice(0, 6).map(([g, c]) => `${g} (${c})`).join(", ")}`);
    console.log(`tags (${t.tags.pct_using_13}% use 13): ${t.tags.top_tags.slice(0, 10).map((x) => `${x.tag} ${x.pct}% [${x.tier}/${x.slot}]`).join(", ")}${t.tags.brand_tags_removed.length ? `  | brand tags removed: ${t.tags.brand_tags_removed.join(", ")}` : ""}`);
    const g1 = t.rank_gradient.top10, g2 = t.rank_gradient.ranks_31_40;
    if (g1 && g2) console.log(`rank gradient top10 vs 31-40: title len ${g1.median_title_len} vs ${g2.median_title_len}, in-first-40 ${g1.in_first40_pct}% vs ${g2.in_first40_pct}%, head tag ${g1.head_tag_pct}% vs ${g2.head_tag_pct}%`);
    console.log(`listing age (${t.listing_age_days.field}): median ${t.listing_age_days.median}d, ${t.listing_age_days.pct_last_30d}% <=30d${t.listing_age_days.warning ? "  (" + t.listing_age_days.warning + ")" : ""}`);
  }
  console.log(`\ncross-term tags (>=3 terms): ${cross_term_tags.map((x) => `${x.tag}(${x.in_terms},${x.slot})`).join(", ")}`);
  console.log(`shops appearing in >=2 terms: ${shops_in_2plus_terms}`);
  if (own) { console.log("\n=== own shop vs market"); for (const o of own) console.log(`${o.listing_id} [${o.state}] "${o.title.slice(0, 48)}…" -> ${o.matched_term || "no match"} (${o.matched_by || "-"}) | head tag: ${o.exact_head_tag} | head in first40: ${o.exact_term_in_first40} | tags seen in market ${o.tags_seen_in_any_researched_top25} | $${o.price} vs lfl $${o.like_for_like_median}`); }
}
