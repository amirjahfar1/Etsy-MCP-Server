# Setup guide — run this system on any machine

Works on **macOS, Windows and Linux**, with **Claude** (Claude Code / desktop app), **Google Antigravity**, or both.
The only prerequisite is **Node.js ≥ 18** ([nodejs.org](https://nodejs.org), or `brew install node`). Everything else is handled by one script.

## 1 · One command

| Your machine | Run (in the project folder) |
|---|---|
| macOS / Linux | `bash scripts/setup.sh` |
| Windows | `scripts\setup.cmd` (double-click, or run it in cmd / PowerShell) |
| Any OS | `node scripts/setup.mjs` |

It **asks two questions** — *which OS?* and *Claude, Antigravity, or both?* — then:

1. checks Node, npm and `uvx` (only the Google Sheets integration needs `uvx`);
2. reinstalls `node_modules` if they were copied from another OS (a Windows-built `node_modules` does not work on a Mac, and vice-versa);
3. installs dependencies and builds the MCP server;
4. writes the MCP configuration **for this machine** (paths and `uvx` location are detected, nothing is hard-coded);
5. starts the server once and counts its tools to prove it works.

Non-interactive form (what the `etsy-setup` skill uses): `node scripts/setup.mjs --os mac|windows|linux --tool claude|antigravity|both --yes`.
Check-only, changes nothing: `node scripts/setup.mjs --check`. Re-running is always safe.

Or just tell the AI: *"setup karo"* — the **`etsy-setup`** skill asks the same two questions and does it for you.

## 2 · What you must provide (not in GitHub, on purpose)

| File | What it is | If missing |
|---|---|---|
| `etsy-mcp-server/.env` | `ETSY_API_KEY` and `ETSY_SHARED_SECRET` from your Etsy Developer App (etsy.com/developers → your app → *Keystring* / *Shared secret*) | Setup prompts for them, or edit the file yourself. **Never paste them into an AI chat.** |
| `etsy-mcp-server/accounts.json` | Your connected shops + tokens | Connect a shop (section 4), or copy the file from your other machine |
| `sheets-oauth.json`, `sheets-token.json` (project root) | Google Sheets access for the order/ready-products sheets | Copy from your other machine. Without them only sheet features are skipped, everything else works. |

All of these are gitignored — they never reach GitHub. Moving to a new computer = `git clone` + copy those files + run setup.

## 3 · Where the MCP config goes

| Tool | Config written | Notes |
|---|---|---|
| **Claude** | `.mcp.json` in the project folder | gitignored; contains this machine's paths, no secrets |
| **Antigravity** | `~/.gemini/antigravity/mcp_config.json` (Windows: `%USERPROFILE%\.gemini\antigravity\mcp_config.json`) | Antigravity ignores project-local MCP config, so this global file is the one that matters. Setup **merges** into it (other tools' entries untouched, a `.bak` is saved). **Restart Antigravity after.** |

Antigravity reads `AGENTS.md` / `GEMINI.md` / `.agent/rules` (they point it at `CLAUDE.md`, the single rulebook) and the skills in `.agent/skills/`.

Then restart your AI tool, open this folder, and say **"list accounts"**.

## 4 · Connect a shop (first time, or each new shop)

Uses the *remote* flow — works wherever your browser and the AI are on different machines. From `etsy-mcp-server/`:

```
node oauth-setup.js my-shop --init
```
Open the printed URL, log in as the **shop owner**, approve, and copy the `<state> <code>` line the page shows. (Your Etsy app must list
`https://aamirali.com/etsy-callback.php` as a Callback URL.) Then:

```
node oauth-setup.js my-shop --complete="<state> <code>"
```
A shop using its *own* Etsy app needs that app's keys for the command — macOS/Linux: `ETSY_API_KEY=… ETSY_SHARED_SECRET=… node oauth-setup.js …`;
Windows PowerShell: `$env:ETSY_API_KEY="…"; $env:ETSY_SHARED_SECRET="…"; node oauth-setup.js …`.

Next say **"onboard my-shop"** — the system asks whether the shop is new or already running and builds its profile (see `etsy-shop-onboarding`).

## 5 · Troubleshooting

| Symptom | Fix |
|---|---|
| Etsy tools missing / "connection closed" | `node scripts/setup.mjs --check`, then restart the AI tool |
| `ENOENT … uvx` on Mac/Windows | Config has another machine's `uvx` path → `node scripts/setup.mjs --force` (install `uv` first if absent: Mac/Linux `curl -LsSf https://astral.sh/uv/install.sh \| sh`, Windows `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"`) |
| `Cannot find module` / `.cmd` files on Mac | Windows `node_modules` → re-run setup (it rebuilds them) |
| `ETSY_API_KEY is required` | Fill `etsy-mcp-server/.env` |
| 401 on first Etsy call | Normal once — tokens auto-refresh. If it persists, reconnect that shop (section 4) |
| Antigravity doesn't see the servers | Restart it; confirm `~/.gemini/antigravity/mcp_config.json` has `etsy` (setup `--check` tells you) |
| Skills out of date in Antigravity | `rsync -a --delete .claude/skills/ .agent/skills/` (Windows: `robocopy .claude\skills .agent\skills /MIR`) |

## 6 · Updating

`git pull`, then `node scripts/setup.mjs` (rebuilds only what changed). Maintainers: after editing a skill, sync `.agent/skills` as above and commit both.
