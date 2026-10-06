#!/usr/bin/env python3
"""Deterministic first pass of the etsy-risk-scan skill (no API calls, no writes).

Scans local listing records (title, tags, description, materials, styles) and the Add Product/ staging folder names
against scripts/risk-terms.txt, plus a few mechanical risk checks. Output is evidence for Claude to judge, not a verdict.

Usage: python3 scripts/risk-prefilter.py [--account NAME] [--staging] [--json]
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
only = args[args.index("--account") + 1] if "--account" in args else None
as_json = "--json" in args
staging = "--staging" in args

terms = []
for line in open(os.path.join(ROOT, "scripts", "risk-terms.txt")):
    line = line.strip()
    if line and not line.startswith("#"):
        terms.append(line.lower())
pats = [(t, re.compile(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])")) for t in terms]
BUYER_BANNED = re.compile(r"(?<![a-z0-9])(aliexpress|alibaba|1688|dropship\w*|temu|dhgate)(?![a-z0-9])")
HANDMADE = re.compile(r"(?<![a-z0-9])(hand[- ]?made|handcrafted|hand[- ]crafted|made by hand|i make|we make|made by me)(?![a-z0-9])")
AI_FILE = re.compile(r"chatgpt|dall[- ]?e|midjourney|gemini_generated|firefly", re.I)

hits = []
def hit(kind, where, ref, detail):
    hits.append({"kind": kind, "where": where, "ref": ref, "detail": detail})

def scan_text(text, where, ref):
    low = (text or "").lower()
    for t, p in pats:
        if p.search(low):
            hit("brand-term", where, ref, t)
    if BUYER_BANNED.search(low):
        hit("sourcing-word-buyer-visible", where, ref, BUYER_BANNED.search(low).group(0))

accounts = json.load(open(os.path.join(ROOT, "etsy-mcp-server", "accounts.json"))).get("accounts", {})
for acct_dir in sorted(glob.glob(os.path.join(ROOT, "data", "listings", "*"))):
    acct = os.path.basename(acct_dir)
    if only and acct != only:
        continue
    if not only and accounts.get(acct, {}).get("status") == "deactivated":
        continue  # legacy; scan explicitly with --account if wanted
    for e in sorted(os.listdir(acct_dir)):
        p = os.path.join(acct_dir, e, "record.json") if os.path.isdir(os.path.join(acct_dir, e)) else os.path.join(acct_dir, e)
        if not p.endswith(".json") or not os.path.exists(p):
            continue
        try:
            r = json.load(open(p))
        except Exception:
            continue
        ld = r.get("listing_data", {}) or {}
        ref = f"{acct}/{r.get('listing_id', e)}"
        for field in ("title", "description"):
            scan_text(ld.get(field), field, ref)
        for t in ld.get("tags") or []:
            scan_text(t, "tag", ref)
        for field in ("materials", "styles"):
            for v in ld.get(field) or []:
                scan_text(v, field, ref)
        if ld.get("who_made") == "someone_else" and HANDMADE.search((ld.get("description") or "").lower() + " " + (ld.get("title") or "").lower()):
            hit("handmade-claim-vs-someone_else", "copy", ref, "copy claims handmade but who_made=someone_else")
        if r.get("state") in ("edit", "inactive"):
            hit("non-live-state", "state", ref, r["state"])

if staging:
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, "Add Product")):
        for n in dirnames + filenames:
            rel = os.path.relpath(os.path.join(dirpath, n), ROOT)
            if n in ("_template",) or n.endswith((".txt",)):
                if not n.lower().startswith("product-details"):
                    continue
            low = n.lower()
            for t, p in pats:
                if p.search(low):
                    hit("brand-term", "staging-name", rel, t)
            if AI_FILE.search(n):
                hit("ai-generated-image-filename", "staging-image", rel, "check AI-disclosure + image-requirements guides")
            if low == "product-details.txt":
                try:
                    txt = open(os.path.join(dirpath, n)).read().lower()
                    for t, p in pats:
                        if p.search(txt):
                            hit("brand-term", "staging-details", rel, t)
                except Exception:
                    pass

if as_json:
    print(json.dumps(hits, indent=2))
else:
    print(f"{len(hits)} flag(s)")
    seen = {}
    for h in hits:
        seen.setdefault((h["kind"], h["ref"]), []).append(h["detail"])
    for (kind, ref), details in sorted(seen.items()):
        print(f"- {kind:34} {ref}  -> {', '.join(sorted(set(details)))}")
