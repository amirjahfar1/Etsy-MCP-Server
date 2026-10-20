# Upgrading an existing installation from GitHub

**For Claude, Antigravity or any AI agent.** If the user gives you this repository's link (`https://github.com/amirjahfar1/Etsy-MCP-Server`) and asks to
*upgrade / update / sync the existing Etsy system*, do exactly this. Humans can run the same commands. The upgrade only replaces **system files**
(skills, guides, scripts, server code, rules, docs). It never touches the user's local state and never touches Etsy.

**Never overwritten, never deleted, never read out loud:** `etsy-mcp-server/.env`, `etsy-mcp-server/accounts.json`, `etsy-mcp-server/.oauth-pending/`,
`sheets-oauth.json`, `sheets-token.json`, `.mcp.json`, `data/` (listing records, tags database, registry, shop DNA, research, metrics),
`Add Product/`, `Shoots/`, `Size charts/`, `node_modules/`, `etsy-mcp-server/build/`.
Requirements: Node >= 18 and git on the machine (macOS, Windows or Linux). The commands are identical on every OS (`node`, `git`).

## 0. Find the existing install

Ask the user where the existing project folder is unless it is the current working directory (look for `etsy-mcp-server/` and `CLAUDE.md` in it).
Read its `system-version.json` if present (older installs have none: treat as pre-2.0). Do not start before you know the path.

## 1. Choose the path

| Situation | Path |
|---|---|
| The folder is a **git clone** of this repo (has `.git` and an `origin`) and already has `scripts/upgrade.mjs` | **A. in place:** `node scripts/upgrade.mjs --dry-run`, then `node scripts/upgrade.mjs` |
| Anything else (a copied folder, an old install, no git, no `scripts/upgrade.mjs`) | **B. bootstrap from a fresh clone** (below) |

### B. Bootstrap (works for any old install)

```
git clone --depth 1 https://github.com/amirjahfar1/Etsy-MCP-Server.git <TEMP>/etsy-upgrade-src
node <TEMP>/etsy-upgrade-src/scripts/upgrade.mjs --project "<existing project folder>" --dry-run
```
`<TEMP>` = any temp folder (macOS/Linux `/tmp`, Windows `%TEMP%`). Quote paths that contain spaces (e.g. `Claude Workspace`).
(Shortcut: `node <any copy of upgrade.mjs> --repo <url> --project "<folder>"` clones into a temp folder for you.)

## 2. Always dry-run first, then show the user the summary

The dry run prints: version old -> new, **NEW** files, **CHANGED** files, files **no longer shipped**, the changelog entries in between (with their
"Migration" notes) and what is protected. Summarise it for the user in plain words and **ask for a yes before applying**. Do not skip this even if
the user said "just upgrade": it costs nothing and the changed-file list is where local customisations hide.

## 3. Apply

```
node <TEMP>/etsy-upgrade-src/scripts/upgrade.mjs --project "<existing project folder>"          # path B
node scripts/upgrade.mjs                                                                       # path A (fast-forward)
```
Add `--prune` only if the user agrees to remove files the system no longer ships (they are backed up first). Replaced files are copied to
`<project>/.upgrade-backup/<timestamp>/`. The script rebuilds the MCP server only when server code or dependencies changed, then runs the doctor
(`node scripts/setup.mjs --check`). Path A refuses to run if tracked files have local edits: ask the user to commit/stash, never use `--force`
or `git reset --hard` to get around it.

## 4. Look for local customisations (do not skip)

For each file the script listed as CHANGED that the user may have edited (`CLAUDE.md`, anything in `.claude/skills/`, `scripts/risk-terms.txt`),
compare the backup with the new file:
```
git diff --no-index --stat "<project>/.upgrade-backup/<timestamp>/<file>" "<project>/<file>"
```
If the backup contains a rule or edit that the new file lacks (a user's own standing rule, their own risk terms), tell the user and offer to
port it into the new file. Keep both skill copies identical afterwards (`.claude/skills` is the source; mirror to `.agent/skills`).

## 5. Verify and finish

1. `node scripts/setup.mjs --check` in the project must end with `0 problem(s)`. If the Antigravity or Claude MCP entry is missing, run
   `node scripts/setup.mjs` (it asks OS + tool; see `SETUP.md`).
2. Tell the user to **fully restart** Claude / Antigravity (MCP servers and skills load at start).
3. After the restart, smoke-test: `list_accounts`, and if the version notes mention a new tool, call it once (e.g. `get_buyer_prices`).
4. Report: old -> new version, counts of new/changed files, backup folder, files left over (no longer shipped), the "Migration" steps from the changelog
   that still need the user, and anything you could not test (say so plainly).

## Rollback

Path B: copy the files back from `.upgrade-backup/<timestamp>/` (they keep their relative paths), then `node scripts/setup.mjs`.
Path A: `git reset --hard ORIG_HEAD` (only if the user has nothing uncommitted).

## Rules for the agent

- Local state is the user's business data: never delete it, never overwrite it, never paste secrets into chat.
- Do not push to GitHub and do not change anything on Etsy as part of an upgrade.
- If anything is unexpected (conflict, dirty tree, a protected path showing up as changed, a failing doctor), stop and ask.
- Do not say "works on Windows/Antigravity" unless you ran it there; say what was and was not verified.

## For maintainers: publishing an upgrade

1. Make the change so it works on macOS + Windows and in Claude + Antigravity (CLAUDE.md compatibility rule).
2. Mirror skills: `rsync -a --delete .claude/skills/ .agent/skills/` (Windows: `robocopy .claude\skills .agent\skills /MIR`).
3. Bump `system-version.json` and add a `CHANGELOG.md` entry with a **Migration** line (what must be done by hand, if anything).
4. `node scripts/setup.mjs --check`, commit, push. Installs pick it up through this document.
