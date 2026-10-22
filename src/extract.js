// shell 命令文本 -> 路径候选（纯函数）。
// shell 不经过 ctx.fs，框架也没有 subprocess 事件，命令文本是唯一能静态看的东西。
// 这里做：剥引号、剥 ENV= 前缀、跟随 cd、展开 ~、git-bash 盘符映射、相对路径锚定。
// 固有上限：变量拼接、base64 -d、$(...) 二次求值都挡不住——那是 OS 层的职责。

import { normalizePath, isAbsolute } from "./match.js";

const TOKEN_SPLIT = /[\s|&;<>()]+/;

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

export function extractPathsFromCommand(commandText, { cwd = "", home = "", matchCase = false } = {}) {
  if (typeof commandText !== "string" || !commandText.trim()) return [];
  const opts = { matchCase };
  const out = new Set();
  // 先摘出成对引号内的内容作为原子 token（路径带空格也能活），占位符回填
  const quoted = [];
  const unquoted = commandText.replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => {
    quoted.push(a ?? b);
    return "\u0000" + (quoted.length - 1) + "\u0000";
  });
  const rawTokens = unquoted
    .split(TOKEN_SPLIT)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\u0000(\d+)\u0000/g, (_, n) => quoted[Number(n)] ?? ""));
  let anchor = cwd ? normalizeDir(cwd, opts) : "";
  for (let i = 0; i < rawTokens.length; i++) {
    // 剥 ENV= 前缀
    let tok = rawTokens[i].replace(/^[A-Za-z_][A-Za-z0-9_]*=/, "");
    if (!tok || tok.startsWith("-")) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(tok)) continue; // URL
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
