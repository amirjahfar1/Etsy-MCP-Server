---
name: etsy-system-upgrade
description: >-
  Upgrades an EXISTING installation of this Etsy Management System from its GitHub repository, safely, on macOS or
  Windows, for Claude or Antigravity. Replaces only system files (skills, guides, scripts, server code, rules, docs) and
  never touches local state (.env, accounts.json, sheets tokens, .mcp.json, data/, Add Product/). Always dry-runs
  first, backs up everything it replaces, shows the changelog and migration notes, rebuilds the MCP server if needed
  and runs the doctor. Trigger when the user gives the GitHub repo link (github.com/amirjahfar1/Etsy-MCP-Server) and
  says upgrade / update / sync / latest version, or says: "system upgrade karo", "github se update karo",
  "naya version lagao", "purane system ko upgrade karo", "latest system le lo", "is repo se system update kar do".
---

# Etsy System Upgrade

The full, authoritative procedure is **`UPGRADE.md`** in the repo root (and at the repo link). Follow it; this skill is the short form so the
procedure is triggered by plain requests.

1. **Find the existing install** (ask for the folder unless it is the working directory). Note its `system-version.json` version (none = pre-2.0).
2. **Pick the path:** git clone with `scripts/upgrade.mjs` -> `node scripts/upgrade.mjs`; anything else (copied folder, old install) -> clone the repo to a temp
   folder and run `node <temp>/etsy-upgrade-src/scripts/upgrade.mjs --project "<existing folder>"`. Quote paths with spaces.
3. **Dry-run first** (`--dry-run`), summarise NEW / CHANGED / no-longer-shipped files and the changelog "Migration" notes for the user, and **ask for a yes**.
4. **Apply**; add `--prune` only with the user's agreement. Replaced files are backed up in `.upgrade-backup/<timestamp>/`.
5. **Check customisations**: diff the backup against the new version for `CLAUDE.md`, skills and `scripts/risk-terms.txt`; offer to port any local-only rule.
6. **Verify**: `node scripts/setup.mjs --check` must report 0 problems; keep `.claude/skills` and `.agent/skills` identical; tell the user to **fully restart** Claude / Antigravity;
   after the restart smoke-test (`list_accounts`, and any tool new in this version).
7. **Report**: old -> new version, file counts, backup folder, leftovers, remaining manual migration steps, and what was not tested.

Hard rules: never overwrite or delete local state, never paste secrets, never push to GitHub, never change anything on Etsy, never bypass a dirty-tree refusal with
`--force`/`reset --hard`. Compatibility: the procedure and script work on macOS, Windows and Linux in both Claude and Antigravity (Node >= 18 + git); say what you did not test.
