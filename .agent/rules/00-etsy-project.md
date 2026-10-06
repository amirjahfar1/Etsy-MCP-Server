# Always-on rule — Etsy Management System

Before any Etsy work in this workspace: read `CLAUDE.md` (project root) in full — it holds the safety rule (confirm every Etsy
write with a full-payload table first) and all standing rules. Skills are in `.agent/skills/`; the ordered gate checklist for
listing work is `.agent/skills/_shared/listing-gates.md`. Translations of Claude-specific wording (sub-agents, AskUserQuestion,
Skill tool) are in `AGENTS.md`. Never write secrets (`accounts.json`, `.env`, `.mcp.json`, sheets tokens) into chat, files that are
committed, or MCP configs checked into git.
