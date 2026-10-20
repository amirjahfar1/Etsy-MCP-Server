# Measuring whether a listing change worked

The only performance signal this system can get is each active listing's cumulative **`views`** and **`num_favorers`** (`getListing`),
snapshotted weekly by `etsy-sync-check --snapshot` into `data/metrics/<account>.jsonl`, plus orders. Views are directional (they can
read 0 for reasons unrelated to traffic). There is no conversion or search-term API; the owner's Etsy Stats export (Shop Manager) is the
richer source. Everything below exists so that "I changed the title and it improved" is not a story we tell ourselves.

## Protocol

1. **Log every change.** Whenever a title, tags, price or primary image changes (any skill, any ad-hoc edit), append one line to
   `data/metrics/<account>-changes.jsonl`: `{"date","listing_id","fields":["title","tags"],"old_hash","new_hash","experiment_id","arm"}`
   (`arm` = `changed` or `control`). The weekly snapshot also stores `title_hash` / `tags_hash`, so an edit that was never logged still
   shows up as a hash change and must be reconciled.
2. **Snapshot weekly on the same weekday**: `node scripts/sync-diff.mjs <account> <live.json> --snapshot` (see `etsy-sync-check`; schedulable).
3. **Change in cohorts, never all at once.** Pair comparable listings (same product type, similar age and views), put half in the changed
   arm and half in an unchanged control arm (alternate by current views rank). Holidays and Etsy-wide traffic move both arms equally.
4. **Wait at least 14 days** after a change before reading anything (re-indexing, weekly noise); judge at **28 days**.
5. **Signal:** views/day over the 28 days after vs the 28 days before, as a ratio per arm. A change "worked" only if the changed arm's
   median ratio is **>=1.5x** the control arm's **and** the changed arm gained **>=10 absolute views**. A favorite on a 0-favorite
   listing is noted but is not proof. A sale (receipt) overrides everything.
6. **Report honestly.** With 3-8 listings per arm this is directional evidence. Repeat a winning change on a second cohort before
   writing it into a rule. Record each result under its `experiment_id` in `data/metrics/experiments.json` (hypothesis, arms, dates, ratios, verdict).

## Experiments queued by the 2026-10-21 research (proposals only; each one edits live listings and needs its own table-confirmed write)

| id | Hypothesis | Arms | Label |
|---|---|---|---|
| E1 | Tags with market evidence beat invented long-tail tags | retag 7 of the shop's newest 15 listings to the slot model; keep 8 | causal-likely mechanism, effect size unknown |
| E2 | Adding the exact head term as a tag raises views | add it to 4 older listings that lack it; keep 4 | correlational so far |
| E3 | ~~Shorter titles lose nothing~~ | **Withdrawn 2026-10-21**: the owner decided to use the full title length. Re-open only if the owner asks. | n/a |
| E4 | ~~Raise under-p25 prices~~ | **Withdrawn 2026-10-21**: pricing is the owner's decision; the system does not propose price experiments. | n/a |

Nothing in this file authorises changing a live listing; it only defines how to judge a change once the owner has approved it.
