# Etsy Management System — instructions for non-Claude agents (Google Antigravity, Gemini, Codex, …)

This file is a pointer. **All project rules live in `CLAUDE.md` at the project root — read it in full before doing anything.**
It is the single source of truth (safety rule: confirm before every Etsy write; standing rules; tool map; data layout).
Do not work from this summary alone.

## How the project maps onto your tools

| Where | What |
|---|---|
| `CLAUDE.md` | The rules. Read first, every session. |
| `.agent/skills/<name>/SKILL.md` | The skill playbooks (identical copy of `.claude/skills/`). Open the one whose `description` matches the request, and follow it. Shared references: `.agent/skills/_shared/`. The ordered mandatory-gate list for any listing work: `.agent/skills/_shared/listing-gates.md`. |
| MCP servers | `etsy` (own server, ~100 tools), `etsy-docs` (Etsy spec), `google-sheets`. Register them with `scripts/setup.sh --antigravity` (see below). |
| `scripts/*.py` | Deterministic helpers (no API): `local-integrity.py`, `sync-diff.py`, `risk-prefilter.py`. Run with `python3`. |
| `data/`, `Add Product/` | Local state and product staging (gitignored, per machine). |

## Translations of Claude-specific wording in CLAUDE.md and the skills

- **"Haiku sub-agent" / `Agent(model: "haiku")`**: the intent is *cheap, read-only data gathering kept separate from judgment*. If you
  can spawn a cheaper/smaller model for a read-only sub-task, do; otherwise do the reads yourself with read-only tools, return/keep only
  the compact result, and keep judgment/writing as a separate step. Never let a read helper make Etsy writes.
- **`AskUserQuestion`**: no such tool — ask the same question in chat, short, with the options listed, and wait for the answer.
- **`Skill` tool / "invoke skill X"**: open `.agent/skills/X/SKILL.md` and follow it.
- **`ToolSearch`**: not needed; MCP tools are already listed by the `etsy` / `google-sheets` servers.
- **"Session restart to pick up a new build"**: restart the MCP server from the Antigravity MCP panel after `npm run build`.
- Confirmation rules are unchanged: show the full-payload **table**, wait for an explicit yes, then write. Local bookkeeping (listing records,
  tags DB, registry, shop DNA, sheets) needs no confirmation.

## Setup on a new machine (Mac/Linux)

```bash
bash scripts/setup.sh                  # npm ci + build, generates .mcp.json for this machine from etsy-mcp-server/.env
bash scripts/setup.sh --antigravity    # also merges the etsy / etsy-docs / google-sheets entries into ~/.gemini/antigravity/mcp_config.json
```
Antigravity ignores project-local MCP config (known bug) and only reads the global `~/.gemini/antigravity/mcp_config.json`, so each
machine needs that registration once, then Antigravity must be restarted. Credentials are read from the gitignored
`etsy-mcp-server/.env`, never committed.
