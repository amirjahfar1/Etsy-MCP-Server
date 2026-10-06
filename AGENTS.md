# Etsy Management System — instructions for non-Claude agents (Google Antigravity, Gemini, Codex, …)

This file is a pointer. **All project rules live in `CLAUDE.md` at the project root — read it in full before doing anything.**
It is the single source of truth (safety rule: confirm before every Etsy write; standing rules; tool map; data layout).
Do not work from this summary alone.

## First, is the project set up on this machine?

If `etsy-mcp-server/build/index.js` or `node_modules` is missing, the `etsy` MCP tools are unavailable, or the project was just copied from
another computer/OS: **run the `etsy-setup` skill before anything else** (`.agent/skills/etsy-setup/SKILL.md`). It asks which OS
(macOS / Windows / Linux) and which AI tool (Claude / Antigravity / both), then runs `node scripts/setup.mjs`. Human guide: `SETUP.md`.
Never ask the user to paste API keys into chat; they go in `etsy-mcp-server/.env`.

## How the project maps onto your tools

| Where | What |
|---|---|
| `CLAUDE.md` | The rules. Read first, every session. |
| `.agent/skills/<name>/SKILL.md` | The skill playbooks (identical copy of `.claude/skills/`). Open the one whose `description` matches the request and follow it. Shared references: `.agent/skills/_shared/`. The ordered mandatory-gate list for any listing work: `.agent/skills/_shared/listing-gates.md`. |
| MCP servers | `etsy` (own server, ~100 tools), `etsy-docs` (Etsy spec), `google-sheets`. Registered globally by `node scripts/setup.mjs --tool antigravity` (Antigravity ignores project-local MCP config). |
| `scripts/*.mjs` | Deterministic helpers (no API): `local-integrity.mjs`, `sync-diff.mjs`, `risk-prefilter.mjs`; installer/doctor `setup.mjs`. Run with `node` — same on macOS, Windows, Linux. |
| `data/`, `Add Product/` | Local state and product staging (gitignored, per machine). |

## Translations of Claude-specific wording in CLAUDE.md and the skills

- **"Haiku sub-agent" / `Agent(model: "haiku")`**: the intent is *cheap, read-only data gathering kept separate from judgment*. If you
  can spawn a cheaper/smaller model for a read-only sub-task, do; otherwise do the reads yourself with read-only tools, keep only the
  compact result, and treat judgment/writing as a separate step. A read helper never makes Etsy writes.
- **`AskUserQuestion`**: no such tool — ask the same question in chat, short, options listed, then wait for the answer.
- **`Skill` tool / "invoke skill X"**: open `.agent/skills/X/SKILL.md` and follow it.
- **`ToolSearch`**: not needed; MCP tools are listed by the connected servers.
- **"Session restart to pick up a new build"**: restart the MCP server from Antigravity's MCP panel after `npm run build`.
- **File paths**: examples use forward slashes; on Windows the same relative paths work (`scripts/setup.mjs`, `Add Product/...`).
- Confirmation rules are unchanged: show the full-payload **table**, wait for an explicit yes, then write. Local bookkeeping (listing
  records, tags DB, registry, shop DNA, sheets) needs no confirmation.
