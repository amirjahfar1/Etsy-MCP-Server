#!/usr/bin/env python3
"""Compare ONE account's live Etsy listings against its local records (data/listings/<account>/).

The live data comes from a compact JSON file written by a read-only (Haiku) sub-agent in the etsy-sync-check skill:
  a JSON list of objects with keys
  listing_id, state, title, tags, description, price (decimal number, e.g. 32.0 — amount/divisor), quantity, who_made,
  when_made, taxonomy_id, materials, styles, shipping_profile_id, readiness_state_id, return_policy_id,
  processing_min, processing_max, image_count, has_video, views, num_favorers, url
No API calls here. Default is report-only.

Usage:
  python3 scripts/sync-diff.py <account> <live.json> [--apply] [--snapshot] [--json]
    --apply     write live values into the local record for drifted fields (+ a sync_log entry). Local bookkeeping only.
    --snapshot  append today's views/num_favorers/price/state per listing to data/metrics/<account>.jsonl
"""
import datetime, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a = [x for x in sys.argv[1:] if not x.startswith("--")]
if len(a) != 2:
    sys.exit(__doc__)
account, live_path = a
apply_, snapshot, as_json = "--apply" in sys.argv, "--snapshot" in sys.argv, "--json" in sys.argv
today = datetime.date.today().isoformat()

live = {str(x["listing_id"]): x for x in json.load(open(live_path))}
adir = os.path.join(ROOT, "data", "listings", account)
records = {}
for e in sorted(os.listdir(adir)) if os.path.isdir(adir) else []:
    full = os.path.join(adir, e)
    p = os.path.join(full, "record.json") if os.path.isdir(full) else full
    if p.endswith(".json") and os.path.exists(p):
        records[e.replace(".json", "")] = (p, json.load(open(p)))

norm = lambda s: re.sub(r"\s+", " ", (s or "").strip())
def same(field, rec_v, live_v):
    if field == "tags":
        return [t.lower() for t in rec_v or []] == [t.lower() for t in live_v or []]
    if field in ("materials", "styles"):
        return sorted(x.lower() for x in rec_v or []) == sorted(x.lower() for x in live_v or [])
    if field == "description":
        return norm(rec_v) == norm(live_v)
    if field == "price":
        return rec_v is not None and live_v is not None and abs(float(rec_v) - float(live_v)) < 0.005
    return rec_v == live_v

FIELDS = ["title", "tags", "description", "price", "who_made", "when_made", "taxonomy_id", "materials", "styles",
          "shipping_profile_id", "readiness_state_id", "return_policy_id", "processing_min", "processing_max"]
findings = []
for lid, (path, rec) in records.items():
    if lid not in live:
        findings.append({"listing_id": lid, "kind": "record-only", "detail": f"local state={rec.get('state')}, not returned by Etsy (deleted? other state filter?)"})
        continue
    lv, ld = live[lid], rec.get("listing_data", {}) or {}
    drift = {}
    for f in FIELDS:
        if f in lv and lv[f] is not None and not same(f, ld.get(f), lv[f]):
            drift[f] = {"local": ld.get(f), "live": lv[f]}
    # Etsy's API reports an unpublished draft as "inactive" (verified live 2026-10-07), so draft == inactive here.
    eq_state = {"draft": "inactive"}
    if lv.get("state") and eq_state.get(lv["state"], lv["state"]) != eq_state.get(rec.get("state"), rec.get("state")):
        drift["state"] = {"local": rec.get("state"), "live": lv["state"]}
    # Image/video counts come from a sub-agent and proved unreliable (a live video was reported as missing), so these
    # are reported as UNVERIFIED and are never applied; confirm with get_listing_images / get_listing_videos first.
    if "image_count" in lv and lv["image_count"] != len(rec.get("images") or []):
        drift["image_count(unverified)"] = {"local": len(rec.get("images") or []), "live": lv["image_count"]}
    if "has_video" in lv and bool(lv["has_video"]) != bool(rec.get("video")):
        drift["video(unverified)"] = {"local": bool(rec.get("video")), "live": bool(lv["has_video"])}
    if drift:
        findings.append({"listing_id": lid, "kind": "drift", "fields": drift})
        if apply_:
            for f, d in drift.items():
                if f in FIELDS:
                    ld[f] = d["live"]
                elif f == "state":
                    rec["state"] = d["live"]
            rec["listing_data"] = ld
            rec["last_updated"] = today
            rec.setdefault("sync_log", []).append({"date": today, "applied_from_live": sorted(k for k in drift if k in FIELDS or k == "state")})
            json.dump(rec, open(path, "w"), indent=2, ensure_ascii=False)
for lid, lv in live.items():
    if lid not in records:
        findings.append({"listing_id": lid, "kind": "live-only", "detail": f"on Etsy (state={lv.get('state')}) '{(lv.get('title') or '')[:60]}' but no local record"})

if snapshot:
    mdir = os.path.join(ROOT, "data", "metrics")
    os.makedirs(mdir, exist_ok=True)
    with open(os.path.join(mdir, f"{account}.jsonl"), "a") as f:
        for lid, lv in live.items():
            f.write(json.dumps({"date": today, "listing_id": lid, "state": lv.get("state"), "views": lv.get("views"),
                                "num_favorers": lv.get("num_favorers"), "price": lv.get("price")}) + "\n")

out = {"account": account, "live": len(live), "records": len(records), "findings": findings, "applied": apply_}
if as_json:
    print(json.dumps(out, indent=2, default=str))
else:
    print(f"{account}: live {len(live)} | local records {len(records)} | findings {len(findings)}" + (" | APPLIED to records" if apply_ else ""))
    for x in findings:
        if x["kind"] == "drift":
            print(f"- drift     {x['listing_id']}: " + "; ".join(f"{k}: local={str(v['local'])[:40]!r} live={str(v['live'])[:40]!r}" for k, v in x["fields"].items()))
        else:
            print(f"- {x['kind']:10} {x['listing_id']}: {x['detail']}")
