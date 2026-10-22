// 路径规范化与规则匹配（纯函数，宿主与测试共用）。

const GLOB_CHARS = /[*?[{]/;

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 规范化路径：反斜杠转正斜杠、git-bash 的 /e/foo 转 e:/foo、合并连续斜杠、
 * 盘根保留尾部斜杠（e:/）。matchCase=false 时整体小写（Windows 文件系统默认
 * 大小写不敏感，规范化后的拼法可能和规则里的不一样，敏感比较会静默漏掉规则）。
 */
export function normalizePath(input, { matchCase = false } = {}) {
  if (typeof input !== "string" || !input.trim()) return "";
  let p = input.trim().replace(/\\/g, "/");
  // git-bash 风格：/e/foo → e:/foo
  const m = /^\/([a-zA-Z])(\/|$)/.exec(p);
  if (m) p = m[1] + ":" + p.slice(2);
  p = p.replace(/\/{2,}/g, "/");
  if (/^[a-zA-Z]:$/.test(p)) p += "/";
  if (p.length > 3 && p.endsWith("/")) p = p.slice(0, -1);
  return matchCase ? p : p.toLowerCase();
}

/** 展开开头的主目录 ~ 与 ~/xxx。 */
export function expandTilde(p, home) {
  if (typeof p !== "string") return p;
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return home + p.slice(1);
  return p;
}

/** 判断是否绝对路径（Windows 盘符或 POSIX 根）。 */
export function isAbsolute(p) {
  return typeof p === "string" && (/^[a-zA-Z]:\//.test(p) || p.startsWith("/"));
}

/**
 * 把三类配置折叠成规则表。条目形状：
 *   files:   [{ path }]
 *   folders: [{ path, recursive, watch }]
 *   drives:  [{ path: 'E:/', recursive, watch }]
 * 非绝对路径的条目被丢弃并记录警告。
 */
export function buildEntries(config, { matchCase = false, cwd = "" } = {}) {
  const warnings = [];
  const entries = [];
  const push = (kind, raw, defaults = {}) => {
    const rawPath = typeof raw === "string" ? raw : raw?.path;
    const abs = normalizePath(expandTilde(String(rawPath ?? ""), ""), { matchCase });
    if (!abs || !isAbsolute(abs) || GLOB_CHARS.test(abs)) {
      warnings.push(`忽略无效条目 ${kind}: ${rawPath}（必须是绝对路径，不带通配符）`);
      return;
    }
    entries.push({
      kind,
      path: abs,
      label: String(rawPath ?? abs),
      recursive: defaults.recursive !== false && raw?.recursive !== false,
      watch: !!(defaults.watch ?? raw?.watch),
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

/**
 * 匹配器。match(target) 返回命中的规则（最长路径优先，保证拒绝理由里报的是
 * 最具体那条），没命中返回 null。
 */
export function makeMatcher(entries, { matchCase = false } = {}) {
  const match = (target) => {
    const t = normalizePath(target, { matchCase });
    if (!t) return null;
    let best = null;
    for (const e of entries) {
      if (entryHits(e, t) && (!best || e.path.length > best.path.length)) best = e;
    }
    return best;
  };

  /** 命令文本兜底：文件与硬盘规则做字面扫描（不认通配符），文件夹规则只走 token 提取。 */
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

export { GLOB_CHARS };
