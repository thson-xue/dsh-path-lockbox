// dsh-path-lockbox 宿主面。
// 三层执行语义：
//   1. ctx.tools.guard()   —— 单调拒绝（无 allow 分支），danger-full-access 也翻不了案
//   2. tools/pre-execute   —— 早期 deny，模型拿到结构化的策略拒绝文案
//   3. tools/post-execute  —— 结果过滤：grep/glob 结果与 shell stdout 中的锁定路径剔除
// UI 走插件自有路由（/path-lockbox/ui + /path-lockbox/api/*），仅当 webServer + connection
// 同时装配时挂载；规则持久化在 $DSH_HOME/path-lockbox.json（用户层，整段替换 patch 默认），
// 该存储文件自身自动加入锁定（硬保护，agent 与用户规则都改不了它）。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildEntries, makeMatcher, normalizePath, expandTilde } from "./match.js";
import { extractPathsFromCommand } from "./extract.js";
import { rescanEntry, startWatcher } from "./scan.js";
import { renderUiHtml } from "./ui.js";

export const name = "path-lockbox";

/**
 * Services this plugin reads off the context.
 *
 * Cordis only puts a declared service on `ctx`; without this list `ctx.tools`,
 * `ctx.webServer` and `ctx.connection` are all undefined, so every layer below
 * `apply()` silently no-ops: no guard, no `lockbox_status` tool, no
 * `/path-lockbox/ui` route. The optional-call chains keep that quiet instead of
 * throwing, which is why the plugin looked "loaded but dead".
 *
 * `connection` is declared because the router fences requests through it; the
 * module reads it lazily too, so a host that never provides it still routes.
 */
export const inject = ["webServer", "tools", "connection"];

const SHELL_TOOLS = new Set(["bash", "pwsh", "shell", "powershell"]);
const PATH_ARGS_DEFAULT = ["file_path", "path", "target", "notebook_path"];

function log(ctx, msg) {
  try {
    ctx.logger?.info?.(`[path-lockbox] ${msg}`);
  } catch {}
}

function storeFile() {
  const base = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  return path.join(base, "path-lockbox.json");
}

function loadStore(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw && typeof raw === "object") return raw;
  } catch {}
  return null;
}

function saveStore(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function asList(v) {
  return Array.isArray(v) ? v : [];
}

/** 规范化一个用户条目；非法路径返回 null。 */
function coerceEntry(kind, raw, matchCase) {
  const rawPath = typeof raw === "string" ? raw : raw?.path;
  const abs = normalizePath(expandTilde(String(rawPath ?? ""), os.homedir()), { matchCase });
  if (!abs || !/^[a-z]:\//.test(abs) && !abs.startsWith("/")) return null;
  if (kind === "drives" && !/^[a-z]:\/$/.test(abs)) return null;
  return {
    path: abs,
    label: String(rawPath ?? abs),
    recursive: raw?.recursive !== false,
    watch: !!raw?.watch,
  };
}

export function apply(ctx) {
  const store = storeFile();
  const cfg = () => ctx.config ?? {};
  const matchCase = () => cfg().matchCase === true;
  const guidance = () => cfg().guidance !== false;

  const runtime = {
    entries: [],
    matcher: null,
    stats: {},       // entryPath -> rescan 统计
    events: [],      // 监控事件环形缓冲
    watchers: new Map(), // entryPath -> { stop, active }
  };

  const selfProtectedPath = () => normalizePath(store, { matchCase: false });

  function effectiveLists() {
    const s = loadStore(store);
    // 用户层整段替换同名列表；存储不存在时用 patch 默认
    return {
      files: asList(s?.files ?? cfg().files),
      folders: asList(s?.folders ?? cfg().folders),
      drives: asList(s?.drives ?? cfg().drives),
    };
  }

  function rebuild() {
    const lists = effectiveLists();
    const mc = matchCase();
    const built = buildEntries(
      {
        files: lists.files,
        folders: lists.folders,
        drives: lists.drives,
      },
      { matchCase: mc },
    );
    built.entries.push({ kind: "file", path: selfProtectedPath(), label: store, recursive: false, watch: false });
    runtime.entries = built.entries;
    runtime.matcher = makeMatcher(built.entries, { matchCase: mc });
    for (const w of built.warnings) log(ctx, w);
    syncWatchers();
    log(ctx, `已加载 ${built.entries.length - 1} 条用户规则 + 1 条自保护（${store}）`);
  }

  function syncWatchers() {
    const want = new Map();
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
      const w = startWatcher(native.replace(/\//g, path.sep), (ev) => {
        runtime.events.push({ ts: new Date().toISOString(), path: e.path, event: ev.event, file: ev.file });
        if (runtime.events.length > 200) runtime.events.splice(0, runtime.events.length - 200);
      });
      runtime.watchers.set(p, w);
      runtime.stats[p] = { ...(runtime.stats[p] ?? {}), watcherActive: w.active };
    }
  }

  // ---------- 执行检查 ----------

  function denyReason(entry, display) {
    return (
      `Access to "${display ?? entry.label}" is blocked by path-lockbox policy (rule "${entry.label}", kind=${entry.kind}).` +
      (guidance() ? " 这是部署策略而非故障；请不要尝试绕过或重试该路径。" : "")
    );
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

    const commandArgNames = new Set(
      ["command", "cmd", "script", ...Object.entries(cfg().extraCommandArgs ?? {})
        .filter(([, v]) => tool === v || v === tool)
        .map(([k]) => k)],
    );

    // shell 类工具：workdir + 命令文本
    const isShell = SHELL_TOOLS.has(tool) || [...(cfg().extraCommandArgs ? Object.keys(cfg().extraCommandArgs) : [])].includes(tool);
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

    // 路径类工具：登记的路径参数逐个检查
    const pathArgs = [...PATH_ARGS_DEFAULT, ...(cfg().extraPathArgs?.[tool] ?? [])];
    for (const key of pathArgs) {
      const hit = checkPathValue(args[key]);
      if (hit) return hit;
    }
    // 未登记的工具也扫一遍所有字符串参数（防御性，避免漏网）
    for (const v of Object.values(args)) {
      if (typeof v === "string" && commandArgNames.has(Object.keys(args).find((k) => args[k] === v) ?? "")) continue;
      if (typeof v === "string" && /^[a-zA-Z]:[\\/]|^\//.test(v)) {
        const hit = checkPathValue(v);
        if (hit) return hit;
      }
    }
    return null;
  }

  // 1) 单调守卫：无 allow 分支，任何后续监听器都无法放行
  try {
    const dispose = ctx.tools?.guard?.((exec) => {
      const hit = inspectExecution(exec);
      return hit ? denyReason(hit) : undefined;
    });
    if (typeof dispose === "function") {
      ctx.effect?.(() => {
        try { dispose(); } catch {}
      });
    }
    log(ctx, "guard 守卫已注册（单调拒绝层生效）");
  } catch (e) {
    log(ctx, `guard 不可用，仅 pre-execute 层生效：${e?.message ?? e}`);
  }

  // 2) pre-execute 策略层：早期 deny
  ctx.on?.("tools/pre-execute", async (exec, next) => {
    try {
      const hit = inspectExecution(exec);
      if (hit) return { kind: "deny", reason: denyReason(hit) };
    } catch (e) {
      log(ctx, `pre-execute 检查异常，放行：${e?.message ?? e}`);
    }
    return next?.();
  });

  // 3) post-execute 结果过滤（尽力而为；不认识的结果形状原样放行）
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
    return text
      .split("\n")
      .filter((line) => !runtime.entries.some((e) => lineHits(e, line)))
      .join("\n");
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

  // ---------- 重扫描 ----------

  async function doRescan(targetPath) {
    const targets = targetPath
      ? runtime.entries.filter((e) => e.path === normalizePath(targetPath, { matchCase: matchCase() }))
      : runtime.entries;
    for (const e of targets) {
      try {
        const s = await rescanEntry(e);
        s.watcherActive = runtime.watchers.get(e.path)?.active ?? false;
        runtime.stats[e.path] = s;
      } catch (err) {
        runtime.stats[e.path] = { at: new Date().toISOString(), error: String(err?.message ?? err) };
      }
    }
    return runtime.stats;
  }

  // ---------- 只读状态工具（模型可见，注册失败不影响插件） ----------

  try {
    const register = ctx.tools?.register;
    if (typeof register === "function") {
      register({
        name: "lockbox_status",
        description: "列出路径锁定箱当前规则、重扫描统计与最近监控事件（只读，不可修改）。",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          const lists = effectiveLists();
          return JSON.stringify(
            { rules: lists, stats: runtime.stats, recentEvents: runtime.events.slice(-20) },
            null,
            2,
          );
        },
      });
    }
  } catch (e) {
    log(ctx, `lockbox_status 注册失败（忽略）：${e?.message ?? e}`);
  }

  // ---------- 路由（webServer + connection 同时装配才挂载） ----------

  function mountRoute(method, url, handler) {
    const ws = ctx.webServer;
    if (!ws) return false;
    const attempts = [
      () => ws.route?.(method, url, handler),
      () => ws.route?.({ method, path: url, handler }),
      () => (method === "GET" ? ws.get?.(url, handler) : ws.post?.(url, handler)),
    ];
    for (const a of attempts) {
      try {
        const r = a();
        if (r !== false && r !== undefined) return true;
        if (r === undefined && a === attempts[2]) return true;
      } catch {}
    }
    return false;
  }

  async function readBody(req) {
    try {
      if (typeof req?.json === "function") return await req.json();
    } catch {}
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

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

  const mounted =
    mountRoute("GET", "/path-lockbox/ui", fenced(async () => new Response(renderUiHtml(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }))) &&
    mountRoute("GET", "/path-lockbox/api/config", fenced(async () =>
      json({ config: effectiveLists(), stats: runtime.stats, events: runtime.events }))) &&
    mountRoute("POST", "/path-lockbox/api/config", fenced(async (req) => {
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
    })) &&
    mountRoute("GET", "/path-lockbox/api/browse", fenced(async (req) => {
      const url = new URL(req?.url ?? "http://x/", "http://x");
      const target = url.searchParams.get("path") ?? "";
      const mc = matchCase();
      const native = (target ? expandTilde(target, os.homedir()) : "").replace(/\//g, path.sep);
      const result = { path: normalizePath(target, { matchCase: mc }), parent: "", entries: [] };
      if (!native || native === path.sep || /^[a-zA-Z]:\\?$/.test(native)) {
        // 根视图：列盘符
        const drives = [];
        for (let c = 65; c <= 90; c++) {
          const letter = String.fromCharCode(c) + ":\\";
          try {
            if (fs.existsSync(letter)) {
              drives.push({ name: letter, path: letter, isDir: true, isFile: false, isDrive: true });
            }
          } catch {}
        }
        result.entries = drives;
        result.path = result.path || "";
        return json(result);
      }
      const parent = path.dirname(native);
      result.parent = normalizePath(parent, { matchCase: mc });
      let names = [];
      try {
        names = fs.readdirSync(native, { withFileTypes: true });
      } catch {
        return json({ error: "cannot list" }, 400);
      }
      names.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      result.entries = names.slice(0, 2000).map((de) => ({
        name: de.name,
        path: normalizePath(path.join(native, de.name), { matchCase: mc }),
        isDir: de.isDirectory(),
        isFile: de.isFile(),
        isDrive: false,
      }));
      return json(result);
    })) &&
    mountRoute("POST", "/path-lockbox/api/rescan", fenced(async (req) => {
      const body = await readBody(req);
      const stats = await doRescan(body?.all ? null : body?.path);
      return json({ ok: true, stats });
    })) &&
    mountRoute("GET", "/path-lockbox/api/events", fenced(async () => json({ events: runtime.events })));

  log(ctx, mounted ? "UI 路由已挂载：/path-lockbox/ui" : "webServer/connection 缺席或路由 API 不匹配，UI 不可用（拦截层不受影响）");

  // ---------- 生命周期 ----------

  rebuild();
  ctx.effect?.(() => {
    for (const [, w] of runtime.watchers) w.stop();
    runtime.watchers.clear();
  });
}
