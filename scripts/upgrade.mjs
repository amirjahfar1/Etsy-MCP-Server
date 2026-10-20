#!/usr/bin/env node
// Upgrade an EXISTING installation of this system from the GitHub repo, safely, on macOS / Windows / Linux (Node >= 18 + git).
// Never touches local state: .env, accounts.json, sheets-*.json, .mcp.json, data/, Add Product/, Shoots/, Size charts/, node_modules/.
// Never pushes, never calls Etsy. Everything it overwrites is first copied to <project>/.upgrade-backup/<timestamp>/.
//
//   node scripts/upgrade.mjs                       project = the folder this script is in. If it is a git clone with a remote,
//                                                  fast-forwards it to origin/<branch> (refuses if tracked files have local edits).
//   node scripts/upgrade.mjs --project <path>      copy mode: THIS script's repo (a fresh clone) is the source, <path> is the existing install.
//                                                  This is how an old install without upgrade.mjs is upgraded (bootstrap, see UPGRADE.md).
//   node scripts/upgrade.mjs --repo <url> --project <path>   same, but clones <url> into a temp folder first.
//   flags: --dry-run (report only) --prune (remove files this system no longer ships, after backing them up) --skip-install --branch <name> --yes
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag("--dry-run"), PRUNE = flag("--prune"), SKIP_INSTALL = flag("--skip-install");
const branch = val("--branch") || "main";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });
const have = (cmd) => spawnSync(cmd, ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).status === 0;
const norm = (b) => b.toString("utf8").replace(/\r\n/g, "\n");
const posix = (p) => p.split(path.sep).join("/");
const exists = (p) => fs.existsSync(p);
const out = (s = "") => console.log(s);
const die = (msg, code = 1) => { console.error("\n✘ " + msg); process.exit(code); };

// Paths that are local state: never read from the source, never overwritten, never pruned.
const PROTECTED = [/^etsy-mcp-server\/\.env$/, /^etsy-mcp-server\/accounts\.json$/, /^etsy-mcp-server\/\.oauth-pending\//, /^sheets-(oauth|token)\.json$/, /^\.mcp\.json$/,
  /^data\//, /^Add Product\//, /^Shoots\//, /^Size charts\//, /(^|\/)node_modules\//, /^etsy-mcp-server\/build\//, /^\.claude\/settings\.local\.json$/, /^\.upgrade-backup\//, /^\.git\//];
const isProtected = (rel) => PROTECTED.some((re) => re.test(rel));
// Directories whose contents are fully owned by the system (orphans here are files the system no longer ships).
const MANAGED = [".claude/skills", ".agent/skills", ".agent/rules", "scripts"];

if (!have("git")) die("git is required (https://git-scm.com). Install it and re-run.");
if (Number(process.versions.node.split(".")[0]) < 18) die("Node >= 18 is required.");

function readVersion(root) { try { return JSON.parse(fs.readFileSync(path.join(root, "system-version.json"), "utf8")); } catch { return null; } }
function changelogBetween(srcRoot, from, to) {
  const f = path.join(srcRoot, "CHANGELOG.md"); if (!exists(f)) return "";
  const txt = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const parts = txt.split(/^## \[/m).slice(1).map((p) => "## [" + p);
  const num = (v) => (v || "0.0.0").split(".").map(Number).reduce((a, n) => a * 1000 + n, 0);
  return parts.filter((p) => { const v = /^## \[([\d.]+)\]/.exec(p)?.[1]; return v && num(v) > num(from) && num(v) <= num(to); }).join("\n");
}

// ---------------------------------------------------------------- decide the mode
let project = path.resolve(val("--project") || SELF_ROOT);
let source = SELF_ROOT, tmpClone = null;
if (val("--repo")) {
  tmpClone = path.join(os.tmpdir(), "etsy-upgrade-src-" + stamp);
  out(`Cloning ${val("--repo")} (branch ${branch}) into ${tmpClone} …`);
  const r = git(os.tmpdir(), "clone", "--depth", "1", "--branch", branch, val("--repo"), tmpClone);
  if (r.status !== 0) die("git clone failed:\n" + r.stderr);
  source = tmpClone;
}
const sameFolder = path.resolve(source) === project;
const projectIsGit = exists(path.join(project, ".git"));
const hasOrigin = projectIsGit && git(project, "remote", "get-url", "origin").status === 0;

if (!exists(project)) die(`Project folder not found: ${project}`);
if (!exists(path.join(project, "etsy-mcp-server")) && !sameFolder) die(`${project} does not look like an Etsy Management System install (no etsy-mcp-server/ folder).`);

const before = readVersion(project);
let after = null, changedFiles = [], newFiles = [], orphans = [], mode;

// ---------------------------------------------------------------- A. in-place git fast-forward
if (sameFolder && hasOrigin) {
  mode = "git fast-forward";
  out(`Mode: ${mode} in ${project}`);
  const f = git(project, "fetch", "origin", branch); if (f.status !== 0) die("git fetch failed:\n" + f.stderr);
  const dirty = git(project, "status", "--porcelain", "--untracked-files=no").stdout.trim();
  if (dirty) die("Tracked files have local edits, so the upgrade stops before touching anything:\n" + dirty + "\n\nCommit or stash them (or move your changes elsewhere), then run again. Nothing was changed.");
  const incoming = git(project, "log", "--oneline", `HEAD..origin/${branch}`).stdout.trim();
  if (!incoming) { out("\n✔ Already up to date."); process.exit(0); }
  out("\nIncoming commits:\n" + incoming);
  const ns = git(project, "diff", "--name-status", "HEAD", `origin/${branch}`).stdout.trim().split("\n").filter(Boolean);
  changedFiles = ns.filter((l) => !l.startsWith("A")).map((l) => l.split("\t").slice(1).join("\t")); newFiles = ns.filter((l) => l.startsWith("A")).map((l) => l.split("\t")[1]);
  out(`\n${newFiles.length} new file(s), ${changedFiles.length} changed/removed file(s).`);
  if (DRY) { out("\n(dry run: nothing changed)"); process.exit(0); }
  const m = git(project, "merge", "--ff-only", `origin/${branch}`);
  if (m.status !== 0) die("Fast-forward is not possible (your branch has local commits that origin does not). Merge or rebase by hand:\n" + m.stderr);
  after = readVersion(project);
  out("\n✔ Fast-forwarded to origin/" + branch + ". Roll back with: git reset --hard ORIG_HEAD");
  source = project;
} else {
  // ---------------------------------------------------------------- B. copy mode
  if (sameFolder) die("This folder is not a git clone with a remote. Run the script from a fresh clone of the repo instead:\n  git clone <repo-url> <temp-folder>\n  node <temp-folder>/scripts/upgrade.mjs --project \"" + project + "\"");
  mode = "copy from clone";
  if (!exists(path.join(source, "system-version.json"))) die("The source clone has no system-version.json: wrong repo or branch?");
  out(`Mode: ${mode}\n  source  ${source}\n  project ${project}`);
  const ls = git(source, "ls-files", "-z"); if (ls.status !== 0) die("git ls-files failed in the source:\n" + ls.stderr);
  const files = ls.stdout.split("\0").filter(Boolean).filter((r) => !isProtected(r));
  const backupDir = path.join(project, ".upgrade-backup", stamp);
  let same = 0;
  for (const rel of files) {
    const src = path.join(source, rel), dst = path.join(project, ...rel.split("/"));
    if (!exists(dst)) { newFiles.push(rel); continue; }
    if (norm(fs.readFileSync(src)) === norm(fs.readFileSync(dst))) { same++; continue; }
    changedFiles.push(rel);
  }
  // orphans: files in the managed folders that the new system does not ship
  const shipped = new Set(files);
  const walk = (d) => (exists(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  for (const m of MANAGED) for (const f of walk(path.join(project, ...m.split("/")))) { const rel = posix(path.relative(project, f)); if (!shipped.has(rel) && !isProtected(rel)) orphans.push(rel); }

  out(`\n${newFiles.length} new, ${changedFiles.length} changed, ${same} identical, ${orphans.length} no longer shipped.`);
  const show = (title, list) => { if (list.length) { out(`\n${title}`); list.slice(0, 60).forEach((x) => out("  " + x)); if (list.length > 60) out(`  … +${list.length - 60} more`); } };
  show("NEW:", newFiles); show("CHANGED (old version backed up first; check these for local customisations, especially CLAUDE.md and skills):", changedFiles);
  show(PRUNE ? "NO LONGER SHIPPED (will be backed up and removed):" : "NO LONGER SHIPPED (left in place; re-run with --prune to remove, after backing up):", orphans);
  if (DRY) { out(`\n(dry run: nothing changed) Protected, never touched: .env, accounts.json, sheets-*.json, .mcp.json, data/, Add Product/, Shoots/, Size charts/, node_modules/`); after = readVersion(source); }
  else {
    const keep = (rel) => { const dst = path.join(project, ...rel.split("/")); if (exists(dst)) { const b = path.join(backupDir, ...rel.split("/")); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(dst, b); } };
    for (const rel of changedFiles) keep(rel);
    for (const rel of [...newFiles, ...changedFiles]) {
      const src = path.join(source, rel), dst = path.join(project, ...rel.split("/"));
      fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst);
      if (process.platform !== "win32") { try { fs.chmodSync(dst, fs.statSync(src).mode); } catch { /* ignore */ } }
    }
    if (PRUNE) for (const rel of orphans) { keep(rel); fs.rmSync(path.join(project, ...rel.split("/")), { force: true }); }
    after = readVersion(source);
    out(`\n✔ Copied ${newFiles.length + changedFiles.length} file(s). Backup of replaced files: ${path.join(project, ".upgrade-backup", stamp)}`);
  }
}

// ---------------------------------------------------------------- legacy layout migration (data store moved in 2026-07)
const legacyData = path.join(project, "etsy-mcp-server", "data"), newData = path.join(project, "data");
if (exists(legacyData) && !exists(newData)) {
  out("\nLegacy data store found at etsy-mcp-server/data/ and no data/ yet.");
  if (DRY) out("  (dry run) would copy it to data/ (the old folder is left in place).");
  else { fs.cpSync(legacyData, newData, { recursive: true }); out("  ✔ Copied to data/ (the old folder is left in place; delete it yourself once you have checked)."); }
}

// ---------------------------------------------------------------- version + changelog
out(`\nVersion: ${before ? before.version : "unknown (pre-2.0 install)"}  ->  ${after ? after.version : "unknown"}`);
if (after) { const log = changelogBetween(source, before?.version || "0.0.0", after.version); if (log) out("\nWhat changed (and what to do by hand):\n\n" + log); }

if (DRY) { out("\nDry run finished. Re-run without --dry-run to apply."); if (tmpClone) fs.rmSync(tmpClone, { recursive: true, force: true }); process.exit(0); }

// ---------------------------------------------------------------- rebuild + verify
const touched = [...newFiles, ...changedFiles];
const serverChanged = touched.some((f) => f.startsWith("etsy-mcp-server/") && /(^etsy-mcp-server\/src\/|package(-lock)?\.json$|tsconfig\.json$)/.test(f));
const npm = (a, cwd) => spawnSync("npm", a, { cwd, stdio: "inherit", shell: process.platform === "win32" });
if (!SKIP_INSTALL && serverChanged) {
  out("\nMCP server code or dependencies changed: reinstalling and rebuilding …");
  const srv = path.join(project, "etsy-mcp-server");
  let r = npm(["ci", "--no-audit", "--no-fund"], srv); if (r.status !== 0) r = npm(["install", "--no-audit", "--no-fund"], srv);
  const b = npm(["run", "build"], srv); if (r.status !== 0 || b.status !== 0) out("\n! Install/build failed: see the error above, then run: node scripts/setup.mjs");
} else if (!SKIP_INSTALL) out("\nMCP server unchanged: no rebuild needed.");

const antiCfg = path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json");
const tool = exists(antiCfg) && exists(path.join(project, ".mcp.json")) ? "both" : exists(antiCfg) ? "antigravity" : "claude";
const osName = { darwin: "mac", win32: "windows" }[process.platform] || "linux";
const setup = path.join(project, "scripts", "setup.mjs");
if (exists(setup)) {
  out(`\nRunning the doctor (node scripts/setup.mjs --check --os ${osName} --tool ${tool}) …\n`);
  spawnSync(process.execPath, [setup, "--check", "--yes", "--os", osName, "--tool", tool, "--no-smoke"], { cwd: project, stdio: "inherit" });
}
if (tmpClone) fs.rmSync(tmpClone, { recursive: true, force: true });
out("\nNext: fully restart Claude / Antigravity so the MCP servers and skills reload. If the doctor reported a missing MCP config, run: node scripts/setup.mjs");
