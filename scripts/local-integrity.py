#!/usr/bin/env python3
"""Local-only integrity check for the Etsy data store (no API calls, no writes).

Cross-checks data/listings/<account>/*  <->  data/product-registry.json  <->
etsy-mcp-server/accounts.json, and validates each listing record's own fields.
Live-vs-local comparison (Etsy API) is a separate step: see the etsy-sync-check skill.

Usage:  python3 scripts/local-integrity.py [--json]
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
as_json = "--json" in sys.argv

issues = []  # (severity, account, listing_id, code, message)


def add(sev, acct, lid, code, msg):
    issues.append({"severity": sev, "account": acct, "listing_id": lid, "code": code, "message": msg})


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:  # noqa: BLE001
        return {"__error__": str(e)}


accounts = load(os.path.join(ROOT, "etsy-mcp-server", "accounts.json")).get("accounts", {})
registry = load(os.path.join(DATA, "product-registry.json"))
reg_products = registry.get("products", [])

# registry index: (account, listing_id) -> product_id
reg_index = {}
for p in reg_products:
    for l in p.get("listings", []):
        key = (l.get("account"), str(l.get("listing_id")))
        if key in reg_index and reg_index[key] != p["product_id"]:
            add("high", key[0], key[1], "registry-dup", f"listed under two product_ids: {reg_index[key]} and {p['product_id']}")
        reg_index[key] = p["product_id"]

records = {}  # (account, listing_id) -> (path, data)
for acct_dir in sorted(glob.glob(os.path.join(DATA, "listings", "*"))):
    acct = os.path.basename(acct_dir)
    if acct not in accounts:
        add("high", acct, None, "unknown-account", "data/listings folder has no matching account in accounts.json")
    for entry in sorted(os.listdir(acct_dir)):
        full = os.path.join(acct_dir, entry)
        if os.path.isdir(full):
            path, lid = os.path.join(full, "record.json"), entry
            if not os.path.exists(path):
                add("high", acct, lid, "no-record", "listing folder has no record.json")
                continue
        elif entry.endswith(".json"):
            path, lid = full, entry[:-5]
        else:
            continue
        rec = load(path)
        if "__error__" in rec:
            add("high", acct, lid, "bad-json", rec["__error__"])
            continue
        records[(acct, lid)] = (path, rec)

for (acct, lid), (path, rec) in records.items():
    if str(rec.get("listing_id")) != lid:
        add("high", acct, lid, "id-mismatch", f"record.listing_id={rec.get('listing_id')} but filed as {lid}")
    if rec.get("account") not in (None, acct):
        add("high", acct, lid, "acct-mismatch", f"record.account={rec.get('account')}")
    pid = rec.get("product_id")
    if not pid:
        add("high", acct, lid, "no-product-id", "record has no product_id")
    elif reg_index.get((acct, lid)) is None:
        add("high", acct, lid, "not-in-registry", f"product_id={pid} but listing missing from product-registry")
    elif reg_index[(acct, lid)] != pid:
        add("high", acct, lid, "pid-mismatch", f"record={pid} registry={reg_index[(acct, lid)]}")
    if not rec.get("sources"):
        add("high", acct, lid, "no-sources", "sources array empty/missing (hard rule: every product needs a source)")

    ld = rec.get("listing_data", {}) or {}
    tags = ld.get("tags")
    if isinstance(tags, list):
        if len(tags) != 13:
            add("med", acct, lid, "tag-count", f"{len(tags)} tags (expected 13)")
        for t in tags:
            if len(t) > 20 or t != t.lower() or re.search(r"[^a-z0-9 '\-™©®]", t):
                add("med", acct, lid, "tag-rule", f"tag breaks field rules: {t!r}")
        if len({t.lower() for t in tags}) != len(tags):
            add("med", acct, lid, "tag-dup", "duplicate tags")
    title = ld.get("title")
    if title and len(title) > 140:
        add("high", acct, lid, "title-len", f"title is {len(title)} chars")
    if not rec.get("state"):
        add("med", acct, lid, "no-state", "record has no state")
    if rec.get("state") in ("edit", "inactive", "expired"):
        add("low", acct, lid, "non-live-state", f"state={rec['state']} (frozen/deactivated? check live)")

    base = os.path.dirname(path)
    for img in rec.get("images", []) or []:
        rel = (img.get("source_path") or img.get("local_path") or img.get("path")) if isinstance(img, dict) else None
        if rel and not os.path.exists(os.path.join(base, rel)) and not os.path.exists(os.path.join(ROOT, rel)):
            add("low", acct, lid, "missing-image-file", rel)

for (acct, lid), pid in reg_index.items():
    if (acct, lid) not in records:
        add("med", acct, lid, "registry-orphan", f"registry points at {pid} but no local record exists")

summary = {}
for i in issues:
    summary[i["code"]] = summary.get(i["code"], 0) + 1

if as_json:
    print(json.dumps({"records": len(records), "registry_products": len(reg_products), "summary": summary, "issues": issues}, indent=2))
else:
    print(f"records: {len(records)} | registry products: {len(reg_products)} | issues: {len(issues)}")
    for code, n in sorted(summary.items(), key=lambda x: -x[1]):
        print(f"  {n:4d}  {code}")
    print()
    if "--verbose" in sys.argv:
        for i in sorted(issues, key=lambda x: ({"high": 0, "med": 1, "low": 2}[x["severity"]], x["account"] or "", x["listing_id"] or "")):
            print(f"[{i['severity']:4}] {i['account']}/{i['listing_id']}  {i['code']}: {i['message']}")
    else:
        groups = {}
        for i in issues:
            groups.setdefault((i["severity"], i["account"], i["code"]), []).append(i)
        for (sev, acct, code), items in sorted(groups.items(), key=lambda x: ({"high": 0, "med": 1, "low": 2}[x[0][0]], x[0][1] or "", x[0][2])):
            ids = ", ".join(str(x["listing_id"]) for x in items[:3]) + (" ..." if len(items) > 3 else "")
            print(f"[{sev:4}] {acct}: {code} x{len(items)}  e.g. {ids}  -- {items[0]['message']}")
        print("\n(use --verbose for every listing)")
sys.exit(1 if any(i["severity"] == "high" for i in issues) else 0)
