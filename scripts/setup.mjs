#!/usr/bin/env node
// Cross-platform setup & doctor for the Etsy Management System (macOS, Windows, Linux; Claude Code and/or Google Antigravity).
// Needs only Node >= 18. No dependencies. Idempotent: safe to re-run any time (also the way to repair a copied project).
//
//   node scripts/setup.mjs                         interactive: asks OS + AI tool, then does everything
//   node scripts/setup.mjs --os mac|windows|linux --tool claude|antigravity|both --yes   non-interactive
//   node scripts/setup.mjs --check                 doctor only: reports PASS/WARN/FAIL, changes nothing
//   flags: --force (regenerate MCP configs even if present) --skip-install (don't npm ci) --no-smoke
//
// Secrets: the MCP server reads etsy-mcp-server/.env itself, so no API key/secret is ever written into .mcp.json or the
// global Antigravity config. Nothing here is ever committed (.env, accounts.json, .mcp.json, sheets-*.json are gitignored).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn, spawnSync } from "node:child_process";
import { ROOT, flag, arg, exists, tryJson } from "./_lib.mjs";

const SRV = path.join(ROOT, "etsy-mcp-server");
const CHECK = flag("--check"), YES = flag("--yes"), FORCE = flag("--force");
const results = [];
const say = (level, msg, fix) => { results.push({ level, msg, fix }); const tag = { PASS: "  ✔", WARN: "  !", FAIL: "  ✘", INFO: "   " }[level]; console.log(`${tag} ${msg}`); if (fix) console.log(`      → ${fix}`); };
const detectOs = () => ({ darwin: "mac", win32: "windows" }[process.platform] || "linux");
const OS_LABEL = { mac: "macOS", windows: "Windows", linux: "Linux" };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", ...opts });
const which = (bin) => { const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" }); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null; };

let rl;
async function ask(q, def) {
  if (YES || !process.stdin.isTTY) return def;
  rl ||= readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${q}${def ? ` [${def}]` : ""} `)).trim();
  return a || def;
}
async function choose(q, options, def) {
  if (YES || !process.stdin.isTTY) return def;
  console.log(`\n${q}`);
  options.forEach(([k, label], i) => console.log(`  ${i + 1}) ${label}`));
  const defIdx = Math.max(0, options.findIndex(([k]) => k === def));
  for (;;) {
    const a = await ask("Choose number:", String(defIdx + 1));
    const n = Number(a);
    if (n >= 1 && n <= options.length) return options[n - 1][0];
    console.log("  please enter one of the numbers above");
  }
}

// ---------- 1. what are we setting up for ----------
console.log(`\nEtsy Management System — ${CHECK ? "doctor" : "setup"}\nProject: ${ROOT}\n`);
let targetOs = arg("--os");
if (!targetOs) {
  const det = detectOs();
  targetOs = await choose(`Which operating system is this machine? (detected: ${OS_LABEL[det]})`, [["mac", "macOS"], ["windows", "Windows"], ["linux", "Linux"]], det);
}
if (!OS_LABEL[targetOs]) { console.error("--os must be mac, windows or linux"); process.exit(2); }
if (targetOs !== detectOs()) say("WARN", `You chose ${OS_LABEL[targetOs]} but this machine reports ${OS_LABEL[detectOs()]}. Paths are generated for the machine actually running this script.`);
const myOs = detectOs();

let tool = arg("--tool");
if (!tool) tool = await choose("Which AI tool will run this project?", [["claude", "Claude (Claude Code CLI / Claude desktop app)"], ["antigravity", "Google Antigravity"], ["both", "Both"]], "claude");
if (!["claude", "antigravity", "both"].includes(tool)) { console.error("--tool must be claude, antigravity or both"); process.exit(2); }
const wantClaude = tool === "claude" || tool === "both", wantAnti = tool === "antigravity" || tool === "both";
console.log(`\nTarget: ${OS_LABEL[myOs]} · ${tool === "both" ? "Claude + Antigravity" : tool === "claude" ? "Claude" : "Antigravity"}${CHECK ? " · check only" : ""}\n`);

// ---------- 2. prerequisites ----------
const nodeMajor = Number(process.versions.node.split(".")[0]);
nodeMajor >= 18 ? say("PASS", `Node ${process.versions.node}`) : say("FAIL", `Node ${process.versions.node} is too old (need >= 18)`, "Install the LTS from https://nodejs.org and re-run");
const npmOk = run("npm", ["-v"]).status === 0;
npmOk ? say("PASS", "npm available") : say("FAIL", "npm not found", "Reinstall Node.js (npm ships with it)");
const uvx = which("uvx");
const UV_INSTALL = myOs === "windows" ? 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"' : "curl -LsSf https://astral.sh/uv/install.sh | sh";
uvx ? say("PASS", `uvx found (${uvx}) — needed for the Google Sheets MCP`) : say("WARN", "uvx (from the 'uv' tool) not found — the Google Sheets MCP will be skipped", `Install it, then re-run:  ${UV_INSTALL}`);
if (!which("git")) say("WARN", "git not found (only needed to pull updates from GitHub)");

// ---------- 3. dependencies built for THIS OS ----------
const nm = path.join(SRV, "node_modules"), bin = path.join(nm, ".bin");
let foreignModules = false;
if (exists(bin)) {
  const hasCmd = fs.readdirSync(bin).some((f) => f.endsWith(".cmd"));
  foreignModules = myOs === "windows" ? !hasCmd : hasCmd;
}
if (foreignModules) say(CHECK ? "FAIL" : "WARN", `node_modules was installed on a different OS (copied project) — it must be reinstalled`, CHECK ? "Run: node scripts/setup.mjs" : undefined);
else if (exists(nm)) say("PASS", "node_modules matches this OS");
else say(CHECK ? "FAIL" : "INFO", "node_modules not installed yet");

// ---------- 4. credentials ----------
const envPath = path.join(SRV, ".env");
let envText = exists(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const envGet = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const haveKeys = () => envGet("ETSY_API_KEY") && !/your_etsy/i.test(envGet("ETSY_API_KEY")) && envGet("ETSY_SHARED_SECRET") && !/your_etsy/i.test(envGet("ETSY_SHARED_SECRET"));
if (!haveKeys() && !CHECK) {
  console.log("\nThe Etsy Developer App keys are missing (etsy.com/developers → your app: 'Keystring' and 'Shared secret').");
  const k = await ask("ETSY_API_KEY (keystring), or press Enter to fill etsy-mcp-server/.env yourself later:", "");
  const s = k ? await ask("ETSY_SHARED_SECRET:", "") : "";
  if (k && s) { envText = `ETSY_API_KEY=${k}\nETSY_SHARED_SECRET=${s}\n`; fs.writeFileSync(envPath, envText); }
  else if (!exists(envPath)) fs.copyFileSync(path.join(SRV, ".env.example"), envPath);
}
haveKeys() ? say("PASS", "Etsy API keys present in etsy-mcp-server/.env") : say(CHECK ? "FAIL" : "WARN", "Etsy API keys are not filled in", "Edit etsy-mcp-server/.env (ETSY_API_KEY, ETSY_SHARED_SECRET)");

// ---------- 5. install + build ----------
if (!CHECK && npmOk && nodeMajor >= 18 && !flag("--skip-install")) {
  if (foreignModules) fs.rmSync(nm, { recursive: true, force: true });
  console.log("\nInstalling dependencies and building the MCP server (about a minute)…");
  let r = run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: SRV, stdio: "inherit" });
  if (r.status !== 0) r = run("npm", ["install", "--no-audit", "--no-fund"], { cwd: SRV, stdio: "inherit" });
  r.status === 0 ? null : say("FAIL", "npm install failed", "Read the error above; check internet access");
  const b = run("npm", ["run", "build"], { cwd: SRV, stdio: "inherit" });
  b.status === 0 ? null : say("FAIL", "build failed", "Read the TypeScript error above");
  console.log();
}
const built = path.join(SRV, "build", "index.js");
exists(built) ? say("PASS", "MCP server is built (etsy-mcp-server/build/index.js)") : say("FAIL", "MCP server is not built", "Run: node scripts/setup.mjs");

// ---------- 6. accounts + sheets files ----------
const accounts = tryJson(path.join(SRV, "accounts.json")).accounts;
if (accounts && Object.keys(accounts).length) {
  const act = Object.entries(accounts).filter(([, v]) => (v.status || "active") === "active").map(([k]) => k);
  say("PASS", `${Object.keys(accounts).length} Etsy account(s) connected (${act.length} active)`);
} else say("WARN", "No Etsy account connected yet (etsy-mcp-server/accounts.json missing/empty)", "Connect one: cd etsy-mcp-server && node oauth-setup.js <account-name> --init  (full steps: SETUP.md → 'Connect a shop')");
const sheetsFiles = ["sheets-oauth.json", "sheets-token.json"].every((f) => exists(path.join(ROOT, f)));
sheetsFiles ? say("PASS", "Google Sheets credentials present") : say("WARN", "sheets-oauth.json / sheets-token.json not in the project root — Google Sheets MCP will be skipped", "Copy both files from the machine that has them (they are gitignored). Everything except order/sheet sync works without them.");

// ---------- 7. MCP configs ----------
const entries = { etsy: { type: "stdio", command: "node", args: [built] }, "etsy-docs": { type: "http", url: "https://mcp.api.etsycloud.com/mcp" } };
if (uvx && sheetsFiles) entries["google-sheets"] = { type: "stdio", command: uvx, args: ["--with", "mcp<2", "mcp-google-sheets@latest"], env: { CREDENTIALS_PATH: path.join(ROOT, "sheets-oauth.json"), TOKEN_PATH: path.join(ROOT, "sheets-token.json") } };

// A config copied from another machine points at paths that don't exist here (e.g. C:\Users\... on a Mac).
function brokenPaths(cfg) {
  const bad = [];
  for (const [name, e] of Object.entries(cfg.mcpServers || {})) {
    const paths = [...(e.args || []).filter((a) => /[\\/]/.test(a) && !/^https?:/.test(a)), ...(e.command && /[\\/]/.test(e.command) ? [e.command] : []), ...Object.values(e.env || {}).filter((v) => /[\\/]/.test(v))];
    for (const p of paths) if (!exists(p)) bad.push(`${name}: ${p}`);
  }
  return bad;
}
function writeConfig(file, label) {
  const cfg = exists(file) ? tryJson(file) : {};
  const base = cfg.__error__ ? {} : cfg;
  const bad = exists(file) ? brokenPaths(base) : [];
  const missing = Object.keys(entries).filter((k) => !(base.mcpServers || {})[k]);
  if (exists(file) && !bad.length && !missing.length && !FORCE) { say("PASS", `${label}: MCP entries present and their paths exist`); return; }
  if (CHECK) { say("FAIL", `${label}: ${bad.length ? "points at paths that don't exist on this machine → " + bad.join("; ") : "missing entries: " + missing.join(", ")}`, "Run: node scripts/setup.mjs"); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exists(file)) fs.copyFileSync(file, `${file}.bak`);
  base.mcpServers = { ...(base.mcpServers || {}), ...entries };
  fs.writeFileSync(file, JSON.stringify(base, null, 2) + "\n");
  say("PASS", `${label}: wrote ${Object.keys(entries).join(", ")}${bad.length ? " (replaced entries with paths from another machine; backup .bak kept)" : ""}`);
}
if (wantClaude) writeConfig(path.join(ROOT, ".mcp.json"), "Claude Code (project .mcp.json)");
if (wantAnti) {
  writeConfig(path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json"), "Antigravity (global ~/.gemini/antigravity/mcp_config.json)");
  say("INFO", "Antigravity ignores project-local MCP config, so the global file above is the one that matters. Restart Antigravity after changes.");
  const skillsOk = exists(path.join(ROOT, ".agent", "skills", "etsy-setup", "SKILL.md"));
  skillsOk ? say("PASS", ".agent/skills present (Antigravity skills)") : say("WARN", ".agent/skills is missing or outdated", "git pull, or: rsync -a --delete .claude/skills/ .agent/skills/   (Windows: robocopy .claude\\skills .agent\\skills /MIR)");
}

// ---------- 8. smoke test: start the Etsy MCP server and ask for its tool list ----------
async function smoke() {
  return new Promise((resolve) => {
    const p = spawn("node", [built], { cwd: SRV, stdio: ["pipe", "pipe", "pipe"], shell: false });
    let buf = "", done = false;
    const finish = (r) => { if (!done) { done = true; try { p.kill(); } catch { /* gone */ } resolve(r); } };
    const t = setTimeout(() => finish({ ok: false, why: "no response within 20s" }), 20000);
    p.stderr.on("data", (d) => { if (/ETSY_API_KEY/.test(String(d))) { clearTimeout(t); finish({ ok: false, why: "server says ETSY_API_KEY is missing" }); } });
    p.on("error", (e) => { clearTimeout(t); finish({ ok: false, why: e.message }); });
    p.stdout.on("data", (d) => {
      buf += d;
      for (const line of buf.split("\n")) {
        try {
          const m = JSON.parse(line);
          if (m.id === 1) { p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n"); }
          if (m.id === 2) { clearTimeout(t); finish({ ok: true, tools: m.result.tools.length }); }
        } catch { /* partial line */ }
      }
    });
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "setup-check", version: "1" } } }) + "\n");
  });
}
if (exists(built) && haveKeys() && !flag("--no-smoke")) {
  const r = await smoke();
  r.ok ? say("PASS", `Etsy MCP server starts and exposes ${r.tools} tools`) : say("FAIL", `Etsy MCP server did not start cleanly: ${r.why}`, "Run: node etsy-mcp-server/build/index.js   and read the error");
}

// ---------- summary ----------
const fails = results.filter((r) => r.level === "FAIL").length, warns = results.filter((r) => r.level === "WARN").length;
console.log(`\n${fails ? "✘" : "✔"} ${fails} problem(s), ${warns} warning(s).`);
if (!CHECK && !fails) {
  console.log("\nNext:");
  console.log(`  1. Restart ${wantAnti && wantClaude ? "Claude and Antigravity" : wantAnti ? "Antigravity" : "Claude"} so it reloads the MCP servers.`);
  console.log(`  2. Open this folder (${ROOT}) in it.`);
  console.log(`  3. ${accounts && Object.keys(accounts).length ? 'Say: "list accounts" to verify, then "onboard <account>" to build the shop DNA.' : "Connect your first shop (SETUP.md → 'Connect a shop'), then say \"onboard <account>\"."}`);
}
rl?.close();
process.exit(fails ? 1 : 0);
