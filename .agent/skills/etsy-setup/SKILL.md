---
name: etsy-setup
description: >-
  Sets this Etsy Management System up (or repairs it) on any machine — macOS, Windows or Linux — for Claude Code,
  Google Antigravity, or both. ALWAYS asks first which operating system and which AI tool, then runs the cross-platform
  installer (scripts/setup.mjs): rebuilds dependencies for that OS, builds the MCP server, writes the MCP config for
  this machine, smoke-tests it, and guides connecting the first Etsy shop and starting shop onboarding. Also the doctor
  when something is broken. Trigger on: "setup karo", "system chalana hai", "naye computer/laptop pe chalana hai",
  "project windows/mac se copy kiya hai", "MCP connect nahi ho raha", "etsy tools nahi dikh rahe", "install",
  "setup guide", "first run", "doctor", "check my setup", "antigravity me chalana hai", "claude me chalana hai",
  and whenever the etsy MCP tools are unavailable or the project looks unconfigured (no .mcp.json, no
  etsy-mcp-server/build, no node_modules). Run this BEFORE any Etsy work in such a state.
---

# Etsy Setup — any OS, Claude or Antigravity

Goal: the project is **ready to start** on this machine. Human-readable version of everything below: `SETUP.md` (project root).
The work is done by `scripts/setup.mjs` (Node only — no Python, no bash required, same on macOS/Windows/Linux). This skill's job
is to ask the two questions, run it, read the result, and fix what's left.

## Step 1 — ask the two questions (always, even if you can guess)

1. **Operating system?** macOS · Windows · Linux. (You can see `process.platform`/the shell, but confirm — a project copied from
   Windows to Mac is the usual failure, and the user may be preparing a config for a *different* machine.)
2. **Which AI tool will run it?** Claude (Claude Code / Claude desktop app) · Google Antigravity · Both.

Use `AskUserQuestion` in Claude; in Antigravity ask in chat with the options listed and wait.

## Step 2 — run the installer

Non-interactive (so no terminal prompts are needed):
```
node scripts/setup.mjs --os <mac|windows|linux> --tool <claude|antigravity|both> --yes
```
It: checks Node ≥ 18 / npm / `uvx`; **reinstalls `node_modules` if they came from another OS** (`.cmd` shims on Mac = Windows-built);
runs `npm ci` + `npm run build`; writes the MCP entries (`etsy`, `etsy-docs`, and `google-sheets` when `uvx` and the two sheets
credential files exist) into the right place for the chosen tool — **Claude:** project `.mcp.json`; **Antigravity:** the *global*
`~/.gemini/antigravity/mcp_config.json` (Windows: `%USERPROFILE%\.gemini\antigravity\mcp_config.json`), merged, `.bak` saved, other
tools' entries untouched; replaces entries whose paths belong to another machine; then starts the Etsy MCP server and counts its tools.

**Secrets:** the server reads `etsy-mcp-server/.env` itself, so no key/secret goes into any MCP config. If `.env` has no keys, **do not ask
the user to paste them into chat.** Tell them to either edit `etsy-mcp-server/.env` (`ETSY_API_KEY`, `ETSY_SHARED_SECRET` from
etsy.com/developers → their app: *Keystring* / *Shared secret*) or run `node scripts/setup.mjs` themselves in a terminal and type them
into its prompt. Then re-run.

If Node is missing: Mac `brew install node` or the LTS installer from nodejs.org; Windows the LTS installer from nodejs.org. Then re-run.
If `uvx` is missing (only the Google Sheets MCP needs it): Mac/Linux `curl -LsSf https://astral.sh/uv/install.sh | sh`; Windows
`powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`. **Show the command and let the user run it** —
don't pipe a downloaded installer yourself.

## Step 3 — verify (read-only)

```
node scripts/setup.mjs --check --os <os> --tool <tool>
```
Every line should be ✔. Common ✘/!: keys not filled in, build failed (read the TypeScript error), Antigravity config missing, `.agent/skills`
out of date (`rsync -a --delete .claude/skills/ .agent/skills/`; Windows `robocopy .claude\skills .agent\skills /MIR`), no sheets files.

## Step 4 — restart, then confirm the MCPs inside the tool

Tell the user to **fully restart** Claude / Antigravity (MCP servers load at start; Antigravity needs a restart after any
`mcp_config.json` change). After restart: call `list_accounts` (etsy), and `list_sheets` on the "Etsy Order" sheet
`1sKw8DjlHPFxHtlR_0r4JJtWI1KhoSW7EUxXpPMDTEE4` (google-sheets). `etsy-docs` needs no setup. A server that still fails →
`node etsy-mcp-server/build/index.js` in a terminal and read its error; `ENOENT … uvx` → the uvx path is for another machine, re-run Step 2
with `--force`.

## Step 5 — connect the first Etsy shop (only if `list_accounts` is empty or the user wants another)

Always the **remote** OAuth flow (the localhost one only works when the browser and Claude share a machine). Two steps, run in
`etsy-mcp-server/`:
```
node oauth-setup.js <account-name> --init
```
It prints an authorize URL. Remind the user once that `https://aamirali.com/etsy-callback.php` must be registered as a Callback URL on that
Etsy app. They open the URL, log in as the **shop owner**, approve, and paste back the `<state> <code>` line the catcher page shows. Then:
```
node oauth-setup.js <account-name> --complete="<pasted state> <pasted code>"
```
Shop on its **own** Etsy Developer App (different keystring/secret) → set the two env vars for the command: macOS/Linux
`ETSY_API_KEY=… ETSY_SHARED_SECRET=… node oauth-setup.js …`; Windows PowerShell `$env:ETSY_API_KEY="…"; $env:ETSY_SHARED_SECRET="…"; node oauth-setup.js …`;
Windows cmd `set ETSY_API_KEY=…&& set ETSY_SHARED_SECRET=…&& node oauth-setup.js …`. Verify with `get_shop` for that `account`, then follow
CLAUDE.md "Connecting a new account" step 5 (register it in the "Etsy Order" sheet).

## Step 6 — hand off

Finish with: *"Setup done. Say `onboard <account>` and I'll ask whether it's a new or running shop and build its DNA."* → `etsy-shop-onboarding`.

## Report shape
```
Setup — <OS> · <tool>
| Check | Result |   (Node, npm, uvx, node_modules, keys, build, accounts, sheets files, MCP config, server smoke test)
Fixed: …            Still needed from you: …            Next: restart <tool>, then "list accounts"
```

## Limits (say them)
- It can't validate Etsy keys against Etsy until a shop is connected; the smoke test only proves the server starts.
- It can't restart the user's AI tool or reach into a *different* machine — run it on the machine that will use the project.
- Copying the project folder does not copy secrets that are gitignored (`.env`, `accounts.json`, sheets files). Bring those over yourself
  (they are the shop credentials), or reconnect the shops with OAuth.
