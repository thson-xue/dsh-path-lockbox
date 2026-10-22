// src/index.js
import fs2 from "node:fs";
import path2 from "node:path";
import os from "node:os";

// src/match.js
var GLOB_CHARS = /[*?[{]/;
function normalizePath(input, { matchCase = false } = {}) {
  if (typeof input !== "string" || !input.trim()) return "";
  let p = input.trim().replace(/\\/g, "/");
  const m = /^\/([a-zA-Z])(\/|$)/.exec(p);
  if (m) p = m[1] + ":" + p.slice(2);
  p = p.replace(/\/{2,}/g, "/");
  if (/^[a-zA-Z]:$/.test(p)) p += "/";
  if (p.length > 3 && p.endsWith("/")) p = p.slice(0, -1);
  return matchCase ? p : p.toLowerCase();
}
function expandTilde(p, home) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return home + p.slice(1);
  return p;
}
function isAbsolute(p) {
  return typeof p === "string" && (/^[a-zA-Z]:\//.test(p) || p.startsWith("/"));
}
function buildEntries(config, { matchCase = false, cwd = "" } = {}) {
  const warnings = [];
  const entries = [];
  const push = (kind, raw, defaults = {}) => {
    const rawPath = typeof raw === "string" ? raw : raw?.path;
    const abs = normalizePath(expandTilde(String(rawPath ?? ""), ""), { matchCase });
    if (!abs || !isAbsolute(abs) || GLOB_CHARS.test(abs)) {
      warnings.push(`\u5FFD\u7565\u65E0\u6548\u6761\u76EE ${kind}: ${rawPath}\uFF08\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u4E0D\u5E26\u901A\u914D\u7B26\uFF09`);
      return;
    }
    entries.push({
      kind,
      path: abs,
      label: String(rawPath ?? abs),
      recursive: defaults.recursive !== false && raw?.recursive !== false,
      watch: !!(defaults.watch ?? raw?.watch)
    });
  };
  for (const f of config?.files ?? []) push("file", f);
  for (const f of config?.folders ?? []) push("folder", f);
  for (const d of config?.drives ?? []) push("drive", d);
  return { entries, warnings };
}
function entryHits(entry, target) {
  if (entry.kind === "file") return target === entry.path;
  if (entry.kind === "folder") {
    if (target === entry.path) return true;
    if (!entry.recursive) return false;
    const prefix = entry.path.endsWith("/") ? entry.path : entry.path + "/";
    return target.startsWith(prefix);
  }
  if (entry.kind === "drive") {
    return entry.recursive ? target.startsWith(entry.path) : target === entry.path;
  }
  return false;
}
function makeMatcher(entries, { matchCase = false } = {}) {
  const match = (target) => {
    const t = normalizePath(target, { matchCase });
    if (!t) return null;
    let best = null;
    for (const e of entries) {
      if (entryHits(e, t) && (!best || e.path.length > best.path.length)) best = e;
    }
    return best;
  };
  const matchCommandText = (commandText) => {
    if (typeof commandText !== "string" || !commandText.trim()) return null;
    const c = commandText.replace(/\\/g, "/").replace(/\s+/g, " ");
    const needle = matchCase ? c : c.toLowerCase();
    let best = null;
    for (const e of entries) {
      let hit = false;
      if (e.kind === "file") hit = needle.includes(e.path);
      else if (e.kind === "drive") hit = needle.includes(e.path);
      if (hit && (!best || e.path.length > best.path.length)) best = e;
    }
    return best;
  };
  return { match, matchCommandText };
}

// src/extract.js
var TOKEN_SPLIT = /[\s|&;<>()]+/;
function normalizeDir(p, opts) {
  const n = normalizePath(p, opts);
  return n;
}
function resolveToken(tok, anchor, home, opts) {
  if (!tok) return "";
  let t = tok.replace(/\\/g, "/");
  if (t === "~" || t.startsWith("~/")) t = home ? home + t.slice(1) : t;
  if (isAbsolute(t) || t.startsWith("/")) return normalizePath(t, opts);
  if (!anchor) return "";
  return normalizePath(anchor.replace(/\/$/, "") + "/" + t, opts);
}
function extractPathsFromCommand(commandText, { cwd = "", home = "", matchCase = false } = {}) {
  if (typeof commandText !== "string" || !commandText.trim()) return [];
  const opts = { matchCase };
  const out = /* @__PURE__ */ new Set();
  const quoted = [];
  const unquoted = commandText.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => {
    quoted.push(a ?? b);
    return "\0" + (quoted.length - 1) + "\0";
  });
  const rawTokens = unquoted.split(TOKEN_SPLIT).map((t) => t.trim()).filter(Boolean).map((t) => t.replace(/\u0000(\d+)\u0000/g, (_, n) => quoted[Number(n)] ?? ""));
  let anchor = cwd ? normalizeDir(cwd, opts) : "";
  for (let i = 0; i < rawTokens.length; i++) {
    let tok = rawTokens[i].replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "");
    if (!tok || tok.startsWith("-")) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(tok)) continue;
    if (/^(cd|pushd|chdir|set-location|sl)$/i.test(tok) && rawTokens[i + 1]) {
      const dest = resolveToken(rawTokens[i + 1], anchor, home, opts);
      if (dest) {
        anchor = dest;
        out.add(dest);
      }
      i++;
      continue;
    }
    const r = resolveToken(tok, anchor, home, opts);
    if (r) out.add(r);
  }
  return [...out];
}

// src/scan.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
var WALK_CAP = 5e3;
async function statPath(p) {
  try {
    const st = await fsp.stat(p);
    return { exists: true, isDir: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtimeMs };
  } catch {
    return { exists: false, isDir: false, isFile: false, size: 0, mtime: 0 };
  }
}
async function walkStats(dir, { maxFiles = WALK_CAP } = {}) {
  let files = 0;
  let bytes = 0;
  let truncated = false;
  const queue = [dir];
  while (queue.length) {
    const cur = queue.pop();
    let names;
    try {
      names = await fsp.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const de of names) {
      const full = path.join(cur, de.name);
      if (de.isDirectory()) queue.push(full);
      else if (de.isFile()) {
        if (files >= maxFiles) {
          truncated = true;
          return { files, bytes, truncated };
        }
        files++;
        try {
          bytes += (await fsp.stat(full)).size;
        } catch {
        }
      }
    }
  }
  return { files, bytes, truncated };
}
async function rescanEntry(entry) {
  const st = await statPath(entry.path.replace(/\//g, path.sep === "\\" ? "\\" : "/") || entry.path);
  const out = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    exists: st.exists,
    isDir: st.isDir,
    isFile: st.isFile,
    files: 0,
    bytes: 0,
    truncated: false,
    watcherActive: false
  };
  if (st.exists && st.isDir && entry.recursive) {
    const native = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
    const w = await walkStats(native.replace(/\//g, "\\"));
    out.files = w.files;
    out.bytes = w.bytes;
    out.truncated = w.truncated;
  }
  return out;
}
function startWatcher(nativePath, onEvent) {
  try {
    const watcher = fs.watch(nativePath, { recursive: true, persistent: false }, (event, filename) => {
      try {
        onEvent({ event, file: filename ? String(filename) : "" });
      } catch {
      }
    });
    watcher.on("error", () => {
    });
    return { stop: () => {
      try {
        watcher.close();
      } catch {
      }
    }, active: true };
  } catch {
    return { stop: () => {
    }, active: false };
  }
}

// src/ui.js
function renderUiHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>\u8DEF\u5F84\u9501\u5B9A\u7BB1 \xB7 Path Lockbox</title>
<style>
  :root {
    --lb-bg: var(--color-background-primary, #ffffff);
    --lb-bg2: var(--color-background-secondary, #f5f5f3);
    --lb-page: var(--color-background-tertiary, #efefec);
    --lb-fg: var(--color-text-primary, #1a1a1a);
    --lb-fg2: var(--color-text-secondary, #6b6b66);
    --lb-fg3: var(--color-text-tertiary, #9a9a94);
    --lb-border: var(--color-border-tertiary, rgba(0,0,0,.14));
    --lb-border2: var(--color-border-primary, rgba(0,0,0,.32));
    --lb-accent: var(--color-info, #378ADD);
    --lb-danger: var(--color-danger, #E24B4A);
    --lb-ok: var(--color-success, #639922);
    --lb-warn: var(--color-warning, #BA7517);
    --lb-radius: var(--border-radius-lg, 12px);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --lb-bg: var(--color-background-primary, #232322);
      --lb-bg2: var(--color-background-secondary, #2c2c2a);
      --lb-page: var(--color-background-tertiary, #191918);
      --lb-fg: var(--color-text-primary, #f0f0ee);
      --lb-fg2: var(--color-text-secondary, #a8a8a2);
      --lb-fg3: var(--color-text-tertiary, #7a7a74);
      --lb-border: var(--color-border-tertiary, rgba(255,255,255,.16));
      --lb-border2: var(--color-border-primary, rgba(255,255,255,.4));
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px; background: var(--lb-page); color: var(--lb-fg);
         font: 13px/1.6 var(--font-sans, "Segoe UI", "Microsoft YaHei", sans-serif); }
  h1 { font-size: 15px; font-weight: 500; margin: 0; }
  .sub { color: var(--lb-fg2); margin-top: 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          background: var(--lb-bg); border: 0.5px solid var(--lb-border);
          border-radius: var(--lb-radius); padding: 14px 18px; margin-bottom: 14px; }
  .counters { display: flex; gap: 18px; flex-shrink: 0; color: var(--lb-fg2); font-size: 12px; }
  .counters b { color: var(--lb-fg); font-weight: 500; font-size: 15px; display: block; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
  .card { background: var(--lb-bg); border: 0.5px solid var(--lb-border);
          border-radius: var(--lb-radius); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .dot.files { background: var(--lb-accent); }
  .dot.folders { background: var(--lb-ok); }
  .dot.drives { background: var(--lb-warn); }
  .card-title { font-weight: 500; }
  .count { margin-left: auto; color: var(--lb-fg3); font-size: 12px; }
  .entries { display: flex; flex-direction: column; gap: 6px; min-height: 64px; max-height: 260px;
             overflow: auto; }
  .empty { color: var(--lb-fg3); border: 1px dashed var(--lb-border); border-radius: 8px;
           padding: 14px; text-align: center; font-size: 12px; }
  .entry { display: flex; align-items: center; gap: 8px; padding: 7px 10px;
           border: 0.5px solid var(--lb-border); border-radius: 8px; cursor: pointer;
           font-family: var(--font-mono, Consolas, monospace); font-size: 12px; word-break: break-all; }
  .entry:hover { border-color: var(--lb-border2); }
  .entry.sel { border-color: var(--lb-accent); background: color-mix(in srgb, var(--lb-accent) 8%, transparent); }
  .badge { flex-shrink: 0; font-size: 11px; padding: 1px 7px; border-radius: 99px;
           border: 0.5px solid var(--lb-border); color: var(--lb-fg2); }
  .badge.on { color: var(--lb-ok); border-color: color-mix(in srgb, var(--lb-ok) 45%, transparent); }
  .badge.off { color: var(--lb-fg3); }
  .entry .rm { margin-left: auto; flex-shrink: 0; border: none; background: none; color: var(--lb-fg3);
               cursor: pointer; font-size: 14px; padding: 0 4px; border-radius: 4px; line-height: 1; }
  .entry .rm:hover { color: var(--lb-danger); background: color-mix(in srgb, var(--lb-danger) 10%, transparent); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { padding: 6px 12px; border: 0.5px solid var(--lb-border); background: var(--lb-bg2);
         color: var(--lb-fg); cursor: pointer; border-radius: 8px; font: inherit; }
  .btn:hover:not(:disabled) { border-color: var(--lb-accent); color: var(--lb-accent); }
  .btn:disabled { color: var(--lb-fg3); cursor: default; }
  .btn.primary { background: var(--lb-accent); border-color: var(--lb-accent); color: #fff; }
  .btn.danger:hover:not(:disabled) { border-color: var(--lb-danger); color: var(--lb-danger); }
  .settings { border-top: 0.5px solid var(--lb-border); padding-top: 10px; display: none; }
  .settings.show { display: block; }
  .settings .path { font-family: var(--font-mono, Consolas, monospace); font-size: 12px;
                    color: var(--lb-fg2); margin-bottom: 6px; word-break: break-all; }
  .chk { display: inline-flex; align-items: center; gap: 6px; margin-right: 18px; user-select: none;
         color: var(--lb-fg2); }
  .chk input { accent-color: var(--lb-accent); }
  .chk.dis { opacity: .45; }
  .stat { color: var(--lb-fg3); font-size: 12px; margin-top: 6px; white-space: pre-wrap; }
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: none;
             align-items: center; justify-content: center; z-index: 50; }
  .overlay.show { display: flex; }
  .dialog { background: var(--lb-bg); border: 0.5px solid var(--lb-border2);
            border-radius: var(--lb-radius); width: 580px; max-width: 92vw; max-height: 82vh;
            display: flex; flex-direction: column; padding: 16px; color: var(--lb-fg); }
  .dialog h3 { margin: 0 0 8px; font-size: 14px; font-weight: 500; }
  .crumb { font-size: 12px; color: var(--lb-fg2); margin-bottom: 8px; word-break: break-all; }
  .picklist { height: 300px; overflow: auto; border: 0.5px solid var(--lb-border); border-radius: 8px; }
  .picklist div { padding: 5px 10px; cursor: pointer; font-family: var(--font-mono, Consolas, monospace); font-size: 12px; }
  .picklist div.dir { color: var(--lb-fg); }
  .picklist div.dir::before { content: "\u25B8 "; color: var(--lb-warn); }
  .picklist div.file::before { content: "\xB7 "; color: var(--lb-fg3); }
  .picklist div.drive::before { content: "\u26C1 "; color: var(--lb-accent); }
  .picklist div.sel { background: var(--lb-accent); color: #fff; }
  .dlgbtns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  input.txt { width: 100%; padding: 7px 10px; border: 0.5px solid var(--lb-border2);
              border-radius: 8px; font: 13px var(--font-mono, Consolas, monospace);
              background: var(--lb-bg2); color: var(--lb-fg); }
  .hint { color: var(--lb-danger); font-size: 12px; min-height: 16px; margin-top: 4px; }
  .note { color: var(--lb-fg3); font-size: 12px; margin-top: 4px; }
</style>
</head>
<body>
<div class="head">
  <div>
    <h1>\u8DEF\u5F84\u9501\u5B9A\u7BB1</h1>
    <div class="sub">\u9501\u5B9A\u7684\u8DEF\u5F84\u5BF9\u6240\u6709\u5DE5\u5177\u8C03\u7528\u4E00\u5F8B\u62D2\u7EDD\u2014\u2014\u5305\u62EC\u5B8C\u5168\u8BBF\u95EE\u6A21\u5F0F\u3002\u5361\u7247\u6309 \u6587\u4EF6 / \u6587\u4EF6\u5939 / \u786C\u76D8 \u5206\u7C7B\u3002</div>
  </div>
  <div class="counters">
    <div><b id="cRules">-</b>\u89C4\u5219</div>
    <div><b id="cWatch">-</b>\u76D1\u63A7\u4E2D</div>
    <div><b id="cEvents">-</b>\u76D1\u63A7\u4E8B\u4EF6</div>
  </div>
</div>

<div class="grid">
  <div class="card" data-kind="files">
    <div class="card-head"><span class="dot files"></span><span class="card-title">\u6587\u4EF6</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary" data-add>\u6DFB\u52A0\u2026</button>
      <button class="btn" data-custom>\u6DFB\u52A0\u81EA\u5B9A\u4E49</button>
      <button class="btn danger" data-remove>\u79FB\u9664</button>
      <button class="btn" data-rescan>\u7ACB\u5373\u91CD\u626B\u63CF</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk dis"><input type="checkbox" data-chk-recursive disabled>\u7D22\u5F15\u5B50\u6587\u4EF6\u5939</label>
      <label class="chk dis"><input type="checkbox" data-chk-watch disabled>\u5C1D\u8BD5\u76D1\u63A7\u53D8\u5316</label>
      <button class="btn" data-rescan-all style="float:right">\u91CD\u626B\u63CF\u5168\u90E8</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>

  <div class="card" data-kind="folders">
    <div class="card-head"><span class="dot folders"></span><span class="card-title">\u6587\u4EF6\u5939</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary" data-add>\u6DFB\u52A0\u2026</button>
      <button class="btn" data-custom>\u6DFB\u52A0\u81EA\u5B9A\u4E49</button>
      <button class="btn danger" data-remove>\u79FB\u9664</button>
      <button class="btn" data-rescan>\u7ACB\u5373\u91CD\u626B\u63CF</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk"><input type="checkbox" data-chk-recursive>\u7D22\u5F15\u5B50\u6587\u4EF6\u5939</label>
      <label class="chk"><input type="checkbox" data-chk-watch>\u5C1D\u8BD5\u76D1\u63A7\u53D8\u5316</label>
      <button class="btn" data-rescan-all style="float:right">\u91CD\u626B\u63CF\u5168\u90E8</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>

  <div class="card" data-kind="drives">
    <div class="card-head"><span class="dot drives"></span><span class="card-title">\u786C\u76D8</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary" data-add>\u6DFB\u52A0\u2026</button>
      <button class="btn" data-custom>\u6DFB\u52A0\u81EA\u5B9A\u4E49</button>
      <button class="btn danger" data-remove>\u79FB\u9664</button>
      <button class="btn" data-rescan>\u7ACB\u5373\u91CD\u626B\u63CF</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk"><input type="checkbox" data-chk-recursive>\u7D22\u5F15\u5B50\u6587\u4EF6\u5939</label>
      <label class="chk"><input type="checkbox" data-chk-watch>\u5C1D\u8BD5\u76D1\u63A7\u53D8\u5316</label>
      <button class="btn" data-rescan-all style="float:right">\u91CD\u626B\u63CF\u5168\u90E8</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>
</div>

<div class="overlay" id="pickOverlay">
  <div class="dialog">
    <h3 id="pickTitle">\u9009\u62E9\u8DEF\u5F84</h3>
    <div class="crumb" id="crumb"></div>
    <div class="picklist" id="pickList"></div>
    <div class="dlgbtns">
      <button class="btn" id="pickUp">\u4E0A\u4E00\u7EA7</button>
      <button class="btn primary" id="pickOk">\u786E\u5B9A</button>
      <button class="btn" id="pickCancel">\u53D6\u6D88</button>
    </div>
  </div>
</div>

<div class="overlay" id="customOverlay">
  <div class="dialog" style="width:480px">
    <h3 id="customTitle">\u6DFB\u52A0\u81EA\u5B9A\u4E49</h3>
    <div class="sub" id="customHint"></div>
    <input class="txt" id="customInput" spellcheck="false">
    <div class="hint" id="customErr"></div>
    <div class="dlgbtns">
      <button class="btn primary" id="customOk">\u786E\u5B9A</button>
      <button class="btn" id="customCancel">\u53D6\u6D88</button>
    </div>
  </div>
</div>

<script>
(() => {
  const KINDS = {
    files:   { leaf: true,  pickTitle: "\u9009\u62E9\u6587\u4EF6",  customHint: "\u8F93\u5165\u6587\u4EF6\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\\\docs\\\\a.txt \u6216 ~/secrets.env\u3002" },
    folders: { leaf: false, pickTitle: "\u9009\u62E9\u6587\u4EF6\u5939", customHint: "\u8F93\u5165\u6587\u4EF6\u5939\u7684\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u5982 D:\\\\docs \u6216 ~/work\u3002" },
    drives:  { leaf: false, pickTitle: "\u9009\u62E9\u786C\u76D8",  customHint: "\u8F93\u5165\u76D8\u7B26\uFF0C\u5982 E: / E:\\\\ / E:/\u3002" },
  };
  const state = { files: [], folders: [], drives: [] };
  let stats = {};
  const sel = { files: -1, folders: -1, drives: -1 };
  let pick = { path: "", selPath: "", kind: "" };

  const $ = (id) => document.getElementById(id);
  const q = (root, sel2) => root.querySelector(sel2);
  const qa = (root, sel2) => [...root.querySelectorAll(sel2)];
  const card = (kind) => document.querySelector('.card[data-kind="' + kind + '"]');

  async function api(path, opts) {
    const r = await fetch("/path-lockbox/api/" + path, opts);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function renderCard(kind) {
    const k = KINDS[kind];
    const c = card(kind);
    const arr = state[kind];
    q(c, "[data-count]").textContent = arr.length + " \u6761";
    const box = q(c, "[data-list]");
    box.innerHTML = "";
    if (!arr.length) {
      box.innerHTML = '<div class="empty">\u6682\u65E0\u6761\u76EE\uFF0C\u70B9\u300C\u6DFB\u52A0\u2026\u300D\u6216\u300C\u6DFB\u52A0\u81EA\u5B9A\u4E49\u300D</div>';
    }
    arr.forEach((e, i) => {
      const div = document.createElement("div");
      div.className = "entry" + (i === sel[kind] ? " sel" : "");
      const badge = k.leaf ? "" :
        '<span class="badge ' + (e.recursive ? "on" : "off") + '">' + (e.recursive ? "\u542B\u5B50\u9879" : "\u4EC5\u672C\u5C42") + "</span>" +
        '<span class="badge ' + (e.watch ? "on" : "off") + '">' + (e.watch ? "\u76D1\u63A7\u4E2D" : "\u672A\u76D1\u63A7") + "</span>";
      div.innerHTML = "<span>" + esc(e.path) + "</span>" + badge +
        '<button class="rm" title="\u79FB\u9664">\u2715</button>';
      div.onclick = (ev) => {
        if (ev.target.classList.contains("rm")) return;
        sel[kind] = i; renderAll();
      };
      q(div, ".rm").onclick = async () => {
        arr.splice(i, 1); sel[kind] = -1; await save(); renderAll();
      };
      box.appendChild(div);
    });
    renderSettings(kind);
  }

  function renderSettings(kind) {
    const k = KINDS[kind];
    const c = card(kind);
    const e = state[kind][sel[kind]];
    const s = q(c, "[data-settings]");
    s.classList.toggle("show", !!e);
    if (!e) return;
    q(c, "[data-setpath]").textContent = e.path;
    const rChk = q(c, "[data-chk-recursive]");
    const wChk = q(c, "[data-chk-watch]");
    rChk.disabled = k.leaf; wChk.disabled = false;
    rChk.parentElement.classList.toggle("dis", k.leaf);
    rChk.checked = !!e.recursive; wChk.checked = !!e.watch;
    q(c, "[data-note]").textContent = k.leaf ? "\u6587\u4EF6\u662F\u53F6\u5B50\u8282\u70B9\uFF0C\u6CA1\u6709\u5B50\u9879\u53EF\u7D22\u5F15\u3002" : "";
    const st = stats[e.path];
    q(c, "[data-stat]").textContent = st
      ? "\u91CD\u626B\u63CF " + st.at + "\uFF1A\u5B58\u5728=" + (st.exists ? "\u662F" : "\u5426") +
        (st.files ? "\uFF0C" + st.files + " \u4E2A\u6587\u4EF6 / " + (st.bytes / 1048576).toFixed(1) + " MB" : "") +
        (st.truncated ? "\uFF08\u5DF2\u8FBE\u679A\u4E3E\u4E0A\u9650\uFF09" : "") +
        "\uFF0C\u76D1\u63A7=" + (st.watcherActive ? "\u6D3B\u52A8\u4E2D" : "\u672A\u542F\u7528/\u4E0D\u53EF\u7528")
      : "\u5C1A\u672A\u91CD\u626B\u63CF\u3002";
  }

  function renderHead() {
    const total = state.files.length + state.folders.length + state.drives.length;
    $("cRules").textContent = total;
    const watching = [...state.folders, ...state.drives].filter(e => e.watch).length;
    $("cWatch").textContent = watching;
    $("cEvents").textContent = window.__evCount ?? "-";
  }

  function renderAll() { for (const k of Object.keys(KINDS)) renderCard(k); renderHead(); }

  async function save() {
    await api("config", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(state) });
  }

  async function reload() {
    const d = await api("config");
    for (const k of Object.keys(KINDS)) state[k] = d.config[k] ?? [];
    stats = d.stats || {};
    window.__evCount = (d.events || []).length;
    for (const k of Object.keys(sel)) if (sel[k] >= state[k].length) sel[k] = state[k].length - 1;
    renderAll();
  }

  // ---- \u8BBE\u7F6E\u52FE\u9009 ----
  for (const kind of Object.keys(KINDS)) {
    const c = card(kind);
    q(c, "[data-chk-recursive]").addEventListener("change", async (ev) => {
      const e = state[kind][sel[kind]]; if (!e) return;
      e.recursive = ev.target.checked; await save(); renderAll();
    });
    q(c, "[data-chk-watch]").addEventListener("change", async (ev) => {
      const e = state[kind][sel[kind]]; if (!e) return;
      e.watch = ev.target.checked; await save(); await reload();
    });
    q(c, "[data-rescan]").onclick = async () => {
      const e = state[kind][sel[kind]];
      if (!e) { q(c, "[data-stat]").textContent = "\u5148\u9009\u62E9\u4E00\u4E2A\u6761\u76EE\u3002"; return; }
      q(c, "[data-stat]").textContent = "\u91CD\u626B\u63CF\u4E2D\u2026";
      const d = await api("rescan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: e.path }) });
      stats = d.stats || stats; renderSettings(kind);
    };
    q(c, "[data-rescan-all]").onclick = async () => {
      q(c, "[data-stat]").textContent = "\u91CD\u626B\u63CF\u5168\u90E8\u4E2D\u2026";
      const d = await api("rescan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }) });
      stats = d.stats || stats; renderAll();
    };
  }

  // ---- \u6D4F\u89C8\u9009\u62E9 ----
  async function openPicker(kind) {
    pick.kind = kind; pick.selPath = "";
    $("pickTitle").textContent = KINDS[kind].pickTitle;
    $("pickOverlay").classList.add("show");
    await browse(kind === "drives" ? "" : "/");
  }

  async function browse(path) {
    const d = await api("browse" + (path ? "?path=" + encodeURIComponent(path) : ""));
    pick.path = d.path;
    $("crumb").textContent = d.path || "\u6B64\u7535\u8111";
    const pl = $("pickList"); pl.innerHTML = "";
    for (const en of d.entries || []) {
      if (pick.kind === "folders" && !en.isDir) continue;
      if (pick.kind === "drives" && !en.isDrive) continue;
      const div = document.createElement("div");
      div.className = en.isDrive ? "drive" : en.isDir ? "dir" : "file";
      div.textContent = en.name;
      div.onclick = () => {
        qa(pl, ".sel").forEach(x => x.classList.remove("sel"));
        div.classList.add("sel");
        pick.selPath = en.path;
      };
      div.ondblclick = async () => {
        if (en.isDir) await browse(en.path);
        else if (pick.kind === "files") { pick.selPath = en.path; $("pickOk").click(); }
      };
      pl.appendChild(div);
    }
  }

  $("pickUp").onclick = async () => {
    if (pick.kind === "drives") return;
    const d = await api("browse?path=" + encodeURIComponent(pick.path || "/"));
    await browse(d.parent || "/");
  };
  $("pickOk").onclick = async () => {
    if (!pick.selPath) return;
    const k = pick.kind;
    if (k === "drives") state.drives.push({ path: pick.selPath, recursive: true, watch: false });
    else if (k === "folders") state.folders.push({ path: pick.selPath, recursive: true, watch: false });
    else state.files.push({ path: pick.selPath });
    $("pickOverlay").classList.remove("show");
    sel[k] = state[k].length - 1;
    await save(); await reload();
  };
  $("pickCancel").onclick = () => $("pickOverlay").classList.remove("show");

  for (const kind of Object.keys(KINDS)) {
    card(kind).querySelector("[data-add]").onclick = () => openPicker(kind);
  }

  // ---- \u81EA\u5B9A\u4E49\u6DFB\u52A0 ----
  let customKind = "";
  for (const kind of Object.keys(KINDS)) {
    card(kind).querySelector("[data-custom]").onclick = () => {
      customKind = kind;
      $("customErr").textContent = ""; $("customInput").value = "";
      $("customHint").textContent = KINDS[kind].customHint;
      $("customOverlay").classList.add("show");
      $("customInput").focus();
    };
  }
  $("customOk").onclick = async () => {
    const raw = $("customInput").value.trim();
    const arr = state[customKind];
    let path = raw;
    if (customKind === "drives") {
      const m = /^([a-zA-Z]):[\\\\\\/]?/.exec(raw);
      if (!m) { $("customErr").textContent = "\u786C\u76D8\u7C7B\u522B\u8BF7\u586B\u76D8\u7B26\uFF0C\u5982 E: / E:\\\\ / E:/"; return; }
      path = m[1] + ":/";
    } else if (!/^([a-zA-Z]:[\\\\\\/]|\\/|~)/.test(raw)) {
      $("customErr").textContent = "\u5FC5\u987B\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u5982 D:\\\\docs \u6216 ~/secrets.env\uFF09";
      return;
    }
    if (arr.some(e => e.path.toLowerCase() === path.toLowerCase())) {
      $("customErr").textContent = "\u8BE5\u8DEF\u5F84\u5DF2\u5728\u5217\u8868\u4E2D"; return;
    }
    if (customKind === "drives") arr.push({ path, recursive: true, watch: false });
    else if (customKind === "folders") arr.push({ path, recursive: true, watch: false });
    else arr.push({ path });
    $("customOverlay").classList.remove("show");
    sel[customKind] = arr.length - 1;
    await save(); await reload();
  };
  $("customCancel").onclick = () => $("customOverlay").classList.remove("show");

  setInterval(async () => {
    try { const d = await api("events"); window.__evCount = (d.events || []).length; renderHead(); } catch {}
  }, 5000);

  reload();
})();
</script>
</body>
</html>`;
}

// src/index.js
var name = "path-lockbox";
var SHELL_TOOLS = /* @__PURE__ */ new Set(["bash", "pwsh", "shell", "powershell"]);
var PATH_ARGS_DEFAULT = ["file_path", "path", "target", "notebook_path"];
function log(ctx, msg) {
  try {
    ctx.logger?.info?.(`[path-lockbox] ${msg}`);
  } catch {
  }
}
function storeFile() {
  const base = process.env.DSH_HOME || path2.join(os.homedir(), ".dsh");
  return path2.join(base, "path-lockbox.json");
}
function loadStore(file) {
  try {
    const raw = JSON.parse(fs2.readFileSync(file, "utf8"));
    if (raw && typeof raw === "object") return raw;
  } catch {
  }
  return null;
}
function saveStore(file, data) {
  fs2.mkdirSync(path2.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs2.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs2.renameSync(tmp, file);
}
function asList(v) {
  return Array.isArray(v) ? v : [];
}
function coerceEntry(kind, raw, matchCase) {
  const rawPath = typeof raw === "string" ? raw : raw?.path;
  const abs = normalizePath(expandTilde(String(rawPath ?? ""), os.homedir()), { matchCase });
  if (!abs || !/^[a-z]:\//.test(abs) && !abs.startsWith("/")) return null;
  if (kind === "drives" && !/^[a-z]:\/$/.test(abs)) return null;
  return {
    path: abs,
    label: String(rawPath ?? abs),
    recursive: raw?.recursive !== false,
    watch: !!raw?.watch
  };
}
function apply(ctx) {
  const store = storeFile();
  const cfg = () => ctx.config ?? {};
  const matchCase = () => cfg().matchCase === true;
  const guidance = () => cfg().guidance !== false;
  const runtime = {
    entries: [],
    matcher: null,
    stats: {},
    // entryPath -> rescan 统计
    events: [],
    // 监控事件环形缓冲
    watchers: /* @__PURE__ */ new Map()
    // entryPath -> { stop, active }
  };
  const selfProtectedPath = () => normalizePath(store, { matchCase: false });
  function effectiveLists() {
    const s = loadStore(store);
    return {
      files: asList(s?.files ?? cfg().files),
      folders: asList(s?.folders ?? cfg().folders),
      drives: asList(s?.drives ?? cfg().drives)
    };
  }
  function rebuild() {
    const lists = effectiveLists();
    const mc = matchCase();
    const built = buildEntries(
      {
        files: lists.files,
        folders: lists.folders,
        drives: lists.drives
      },
      { matchCase: mc }
    );
    built.entries.push({ kind: "file", path: selfProtectedPath(), label: store, recursive: false, watch: false });
    runtime.entries = built.entries;
    runtime.matcher = makeMatcher(built.entries, { matchCase: mc });
    for (const w of built.warnings) log(ctx, w);
    syncWatchers();
    log(ctx, `\u5DF2\u52A0\u8F7D ${built.entries.length - 1} \u6761\u7528\u6237\u89C4\u5219 + 1 \u6761\u81EA\u4FDD\u62A4\uFF08${store}\uFF09`);
  }
  function syncWatchers() {
    const want = /* @__PURE__ */ new Map();
    for (const e of runtime.entries) {
      if (e.watch && (e.kind === "folder" || e.kind === "drive")) {
        want.set(e.path, e);
      }
    }
    for (const [p, w] of runtime.watchers) {
      if (!want.has(p)) {
        w.stop();
        runtime.watchers.delete(p);
      }
    }
    for (const [p, e] of want) {
      if (runtime.watchers.has(p)) continue;
      const native = e.path.endsWith("/") ? e.path.slice(0, -1) : e.path;
      const w = startWatcher(native.replace(/\//g, path2.sep), (ev) => {
        runtime.events.push({ ts: (/* @__PURE__ */ new Date()).toISOString(), path: e.path, event: ev.event, file: ev.file });
        if (runtime.events.length > 200) runtime.events.splice(0, runtime.events.length - 200);
      });
      runtime.watchers.set(p, w);
      runtime.stats[p] = { ...runtime.stats[p] ?? {}, watcherActive: w.active };
    }
  }
  function denyReason(entry, display) {
    return `Access to "${display ?? entry.label}" is blocked by path-lockbox policy (rule "${entry.label}", kind=${entry.kind}).` + (guidance() ? " \u8FD9\u662F\u90E8\u7F72\u7B56\u7565\u800C\u975E\u6545\u969C\uFF1B\u8BF7\u4E0D\u8981\u5C1D\u8BD5\u7ED5\u8FC7\u6216\u91CD\u8BD5\u8BE5\u8DEF\u5F84\u3002" : "");
  }
  function argsOf(exec) {
    return exec?.args ?? exec?.input ?? exec?.params ?? {};
  }
  function nameOf(exec) {
    return String(exec?.name ?? exec?.tool ?? "");
  }
  function inspectExecution(exec) {
    if (!runtime.matcher) return null;
    const args = argsOf(exec);
    const tool = nameOf(exec);
    const workdirRaw = args.workdir ?? args.cwd ?? "";
    const workdir = workdirRaw ? normalizePath(String(workdirRaw), { matchCase: matchCase() }) : "";
    const anchor = workdir || normalizePath(process.cwd(), { matchCase: matchCase() });
    const home = os.homedir();
    const checkPathValue = (v) => {
      if (typeof v !== "string" || !v.trim()) return null;
      let t = expandTilde(v, home);
      if (!/^[a-zA-Z]:[\\/]/.test(t) && !t.startsWith("/") && anchor) {
        t = anchor.replace(/\/$/, "") + "/" + t.replace(/^[.]\//, "");
      }
      return runtime.matcher.match(t);
    };
    const commandArgNames = /* @__PURE__ */ new Set(
      ["command", "cmd", "script", ...Object.entries(cfg().extraCommandArgs ?? {}).filter(([, v]) => tool === v || v === tool).map(([k]) => k)]
    );
    const isShell = SHELL_TOOLS.has(tool) || [...cfg().extraCommandArgs ? Object.keys(cfg().extraCommandArgs) : []].includes(tool);
    if (isShell) {
      if (workdir) {
        const hit = runtime.matcher.match(workdir);
        if (hit) return hit;
      }
      const cmd = args.command ?? args.cmd ?? args.script ?? "";
      if (typeof cmd === "string" && cmd.trim()) {
        for (const cand of extractPathsFromCommand(cmd, { cwd: anchor, home, matchCase: matchCase() })) {
          const hit = runtime.matcher.match(cand);
          if (hit) return hit;
        }
        const textHit = runtime.matcher.matchCommandText(cmd);
        if (textHit) return textHit;
      }
      return null;
    }
    const pathArgs = [...PATH_ARGS_DEFAULT, ...cfg().extraPathArgs?.[tool] ?? []];
    for (const key of pathArgs) {
      const hit = checkPathValue(args[key]);
      if (hit) return hit;
    }
    for (const v of Object.values(args)) {
      if (typeof v === "string" && commandArgNames.has(Object.keys(args).find((k) => args[k] === v) ?? "")) continue;
      if (typeof v === "string" && /^[a-zA-Z]:[\\/]|^\//.test(v)) {
        const hit = checkPathValue(v);
        if (hit) return hit;
      }
    }
    return null;
  }
  try {
    const dispose = ctx.tools?.guard?.((exec) => {
      const hit = inspectExecution(exec);
      return hit ? denyReason(hit) : void 0;
    });
    if (typeof dispose === "function") {
      ctx.effect?.(() => {
        try {
          dispose();
        } catch {
        }
      });
    }
    log(ctx, "guard \u5B88\u536B\u5DF2\u6CE8\u518C\uFF08\u5355\u8C03\u62D2\u7EDD\u5C42\u751F\u6548\uFF09");
  } catch (e) {
    log(ctx, `guard \u4E0D\u53EF\u7528\uFF0C\u4EC5 pre-execute \u5C42\u751F\u6548\uFF1A${e?.message ?? e}`);
  }
  ctx.on?.("tools/pre-execute", async (exec, next) => {
    try {
      const hit = inspectExecution(exec);
      if (hit) return { kind: "deny", reason: denyReason(hit) };
    } catch (e) {
      log(ctx, `pre-execute \u68C0\u67E5\u5F02\u5E38\uFF0C\u653E\u884C\uFF1A${e?.message ?? e}`);
    }
    return next?.();
  });
  ctx.on?.("tools/post-execute", async (exec, result, next) => {
    try {
      return next?.(filterResult(result));
    } catch {
      return next?.(result);
    }
  });
  function filterResult(result) {
    if (!result || typeof result !== "object") return result;
    const clone = { ...result };
    if (Array.isArray(clone.matches)) {
      clone.matches = clone.matches.filter((m) => !runtime.matcher?.match(m?.path ?? ""));
    }
    if (Array.isArray(clone.paths)) {
      clone.paths = clone.paths.filter((p) => !runtime.matcher?.match(typeof p === "string" ? p : p?.path ?? ""));
    }
    for (const k of ["stdout", "stderr"]) {
      const t = clone[k];
      if (t && typeof t === "object" && typeof t.text === "string") {
        clone[k] = { ...t, text: stripBlockedLines(t.text) };
      }
    }
    if (typeof clone.text === "string") clone.text = stripBlockedLines(clone.text);
    return clone;
  }
  function stripBlockedLines(text) {
    if (!runtime.entries.length) return text;
    return text.split("\n").filter((line) => !runtime.entries.some((e) => lineHits(e, line))).join("\n");
  }
  function lineHits(entry, line) {
    const l = matchCase() ? line : line.toLowerCase();
    if (entry.kind === "drive") return l.includes(entry.path);
    if (entry.kind === "file") return l.includes(entry.path);
    if (entry.kind === "folder") {
      if (!entry.recursive) return l.includes(entry.path);
      return l.includes(entry.path) && (l.includes(entry.path + "/") || l.trim() === entry.path);
    }
    return false;
  }
  async function doRescan(targetPath) {
    const targets = targetPath ? runtime.entries.filter((e) => e.path === normalizePath(targetPath, { matchCase: matchCase() })) : runtime.entries;
    for (const e of targets) {
      try {
        const s = await rescanEntry(e);
        s.watcherActive = runtime.watchers.get(e.path)?.active ?? false;
        runtime.stats[e.path] = s;
      } catch (err) {
        runtime.stats[e.path] = { at: (/* @__PURE__ */ new Date()).toISOString(), error: String(err?.message ?? err) };
      }
    }
    return runtime.stats;
  }
  try {
    const register = ctx.tools?.register;
    if (typeof register === "function") {
      register({
        name: "lockbox_status",
        description: "\u5217\u51FA\u8DEF\u5F84\u9501\u5B9A\u7BB1\u5F53\u524D\u89C4\u5219\u3001\u91CD\u626B\u63CF\u7EDF\u8BA1\u4E0E\u6700\u8FD1\u76D1\u63A7\u4E8B\u4EF6\uFF08\u53EA\u8BFB\uFF0C\u4E0D\u53EF\u4FEE\u6539\uFF09\u3002",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          const lists = effectiveLists();
          return JSON.stringify(
            { rules: lists, stats: runtime.stats, recentEvents: runtime.events.slice(-20) },
            null,
            2
          );
        }
      });
    }
  } catch (e) {
    log(ctx, `lockbox_status \u6CE8\u518C\u5931\u8D25\uFF08\u5FFD\u7565\uFF09\uFF1A${e?.message ?? e}`);
  }
  function mountRoute(method, url, handler) {
    const ws = ctx.webServer;
    if (!ws) return false;
    const attempts = [
      () => ws.route?.(method, url, handler),
      () => ws.route?.({ method, path: url, handler }),
      () => method === "GET" ? ws.get?.(url, handler) : ws.post?.(url, handler)
    ];
    for (const a of attempts) {
      try {
        const r = a();
        if (r !== false && r !== void 0) return true;
        if (r === void 0 && a === attempts[2]) return true;
      } catch {
      }
    }
    return false;
  }
  async function readBody(req) {
    try {
      if (typeof req?.json === "function") return await req.json();
    } catch {
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return {};
    }
  }
  function fenced(handler) {
    return async (req, ...rest) => {
      try {
        await ctx.connection?.requestRejection?.(req);
      } catch (e) {
        return new Response("forbidden", { status: 403 });
      }
      return handler(req, ...rest);
    };
  }
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  const mounted = mountRoute("GET", "/path-lockbox/ui", fenced(async () => new Response(renderUiHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }))) && mountRoute("GET", "/path-lockbox/api/config", fenced(async () => json({ config: effectiveLists(), stats: runtime.stats, events: runtime.events }))) && mountRoute("POST", "/path-lockbox/api/config", fenced(async (req) => {
    const body = await readBody(req);
    const mc = matchCase();
    const data = { version: 1, files: [], folders: [], drives: [] };
    for (const kind of ["files", "folders", "drives"]) {
      for (const raw of asList(body?.[kind])) {
        const e = coerceEntry(kind, raw, mc);
        if (e) data[kind].push(e);
      }
    }
    saveStore(store, data);
    rebuild();
    return json({ ok: true });
  })) && mountRoute("GET", "/path-lockbox/api/browse", fenced(async (req) => {
    const url = new URL(req?.url ?? "http://x/", "http://x");
    const target = url.searchParams.get("path") ?? "";
    const mc = matchCase();
    const native = (target ? expandTilde(target, os.homedir()) : "").replace(/\//g, path2.sep);
    const result = { path: normalizePath(target, { matchCase: mc }), parent: "", entries: [] };
    if (!native || native === path2.sep || /^[a-zA-Z]:\\?$/.test(native)) {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c) + ":\\";
        try {
          if (fs2.existsSync(letter)) {
            drives.push({ name: letter, path: letter, isDir: true, isFile: false, isDrive: true });
          }
        } catch {
        }
      }
      result.entries = drives;
      result.path = result.path || "";
      return json(result);
    }
    const parent = path2.dirname(native);
    result.parent = normalizePath(parent, { matchCase: mc });
    let names = [];
    try {
      names = fs2.readdirSync(native, { withFileTypes: true });
    } catch {
      return json({ error: "cannot list" }, 400);
    }
    names.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    result.entries = names.slice(0, 2e3).map((de) => ({
      name: de.name,
      path: normalizePath(path2.join(native, de.name), { matchCase: mc }),
      isDir: de.isDirectory(),
      isFile: de.isFile(),
      isDrive: false
    }));
    return json(result);
  })) && mountRoute("POST", "/path-lockbox/api/rescan", fenced(async (req) => {
    const body = await readBody(req);
    const stats = await doRescan(body?.all ? null : body?.path);
    return json({ ok: true, stats });
  })) && mountRoute("GET", "/path-lockbox/api/events", fenced(async () => json({ events: runtime.events })));
  log(ctx, mounted ? "UI \u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1A/path-lockbox/ui" : "webServer/connection \u7F3A\u5E2D\u6216\u8DEF\u7531 API \u4E0D\u5339\u914D\uFF0CUI \u4E0D\u53EF\u7528\uFF08\u62E6\u622A\u5C42\u4E0D\u53D7\u5F71\u54CD\uFF09");
  rebuild();
  ctx.effect?.(() => {
    for (const [, w] of runtime.watchers) w.stop();
    runtime.watchers.clear();
  });
}
export {
  apply,
  name
};
