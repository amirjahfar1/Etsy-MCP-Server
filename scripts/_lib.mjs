// Shared helpers for the project's Node scripts (works on macOS, Windows, Linux; no dependencies).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const tryJson = (p) => { try { return readJson(p); } catch (e) { return { __error__: String(e.message || e) }; } };
export const exists = (p) => fs.existsSync(p);
export const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
export const listDir = (p) => (isDir(p) ? fs.readdirSync(p).sort() : []);
export const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
export const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
export const flag = (name) => process.argv.includes(name);
export const sevRank = { high: 0, med: 1, low: 2 };
