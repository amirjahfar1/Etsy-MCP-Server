#!/usr/bin/env bash
# One-shot setup for a new machine (macOS/Linux). Idempotent. No secrets are printed or committed.
#   bash scripts/setup.sh                  build the MCP server + generate .mcp.json for this machine
#   bash scripts/setup.sh --force          regenerate .mcp.json even if it exists
#   bash scripts/setup.sh --antigravity    also register the MCP servers in ~/.gemini/antigravity/mcp_config.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRV="$ROOT/etsy-mcp-server"
FORCE=0; ANTI=0
for a in "$@"; do [ "$a" = "--force" ] && FORCE=1; [ "$a" = "--antigravity" ] && ANTI=1; done

command -v node >/dev/null || { echo "node not found (need >=18)"; exit 1; }
command -v python3 >/dev/null || { echo "python3 not found"; exit 1; }
echo "node $(node -v), npm $(npm -v)"

if [ ! -f "$SRV/.env" ]; then
  cp "$SRV/.env.example" "$SRV/.env"
  echo "Created $SRV/.env from the example. Fill in ETSY_API_KEY and ETSY_SHARED_SECRET, then re-run."; exit 1
fi
if [ ! -f "$SRV/accounts.json" ]; then
  echo "NOTE: $SRV/accounts.json is missing - connect an account: cd etsy-mcp-server && node oauth-setup.js <name> --init (see CLAUDE.md)."
fi

# Windows-copied node_modules (.cmd shims) break on macOS/Linux: rebuild if detected.
if [ -d "$SRV/node_modules" ] && ls "$SRV/node_modules/.bin" 2>/dev/null | grep -q '\.cmd$'; then
  echo "Windows node_modules detected - reinstalling"; rm -rf "$SRV/node_modules" "$SRV/build"
fi
(cd "$SRV" && npm ci --no-audit --no-fund && npm run build)

UVX="$(command -v uvx || true)"
[ -z "$UVX" ] && echo "WARNING: uvx not found - install uv (https://docs.astral.sh/uv/) for the google-sheets MCP."

ROOT="$ROOT" SRV="$SRV" UVX="${UVX:-uvx}" FORCE="$FORCE" ANTI="$ANTI" python3 - <<'PY'
import json, os
root, srv, uvx = os.environ["ROOT"], os.environ["SRV"], os.environ["UVX"]
env = {}
for line in open(os.path.join(srv, ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
entries = {
  "etsy": {"type": "stdio", "command": "node", "args": [os.path.join(srv, "build", "index.js")],
           "env": {"ETSY_API_KEY": env.get("ETSY_API_KEY", ""), "ETSY_SHARED_SECRET": env.get("ETSY_SHARED_SECRET", "")}},
  "etsy-docs": {"type": "http", "url": "https://mcp.api.etsycloud.com/mcp"},
  "google-sheets": {"type": "stdio", "command": uvx, "args": ["--with", "mcp<2", "mcp-google-sheets@latest"],
           "env": {"CREDENTIALS_PATH": os.path.join(root, "sheets-oauth.json"), "TOKEN_PATH": os.path.join(root, "sheets-token.json")}},
}
p = os.path.join(root, ".mcp.json")
if os.path.exists(p) and os.environ["FORCE"] != "1":
    print(".mcp.json exists - left untouched (use --force to regenerate)")
else:
    json.dump({"mcpServers": entries}, open(p, "w"), indent=2); print("wrote", p)
if os.environ["ANTI"] == "1":
    g = os.path.expanduser("~/.gemini/antigravity/mcp_config.json")
    os.makedirs(os.path.dirname(g), exist_ok=True)
    cfg = json.load(open(g)) if os.path.exists(g) else {}
    cfg.setdefault("mcpServers", {}).update(entries)
    json.dump(cfg, open(g, "w"), indent=2); print("merged into", g, "- restart Antigravity")
for f in ("sheets-oauth.json", "sheets-token.json"):
    if not os.path.exists(os.path.join(root, f)): print("NOTE: missing", f, "(google-sheets MCP needs it)")
PY
echo "Done. Restart your AI tool so it reloads the MCP servers."
