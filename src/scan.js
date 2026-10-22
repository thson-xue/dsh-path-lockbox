// 重扫描与变化监控（Node fs 层）。

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const WALK_CAP = 5000;

export async function statPath(p) {
  try {
    const st = await fsp.stat(p);
    return { exists: true, isDir: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtimeMs };
  } catch {
    return { exists: false, isDir: false, isFile: false, size: 0, mtime: 0 };
  }
}

/** 枚举受保护目录下的文件数与字节数（带上限，防止把 agent 卡在超大分区上）。 */
export async function walkStats(dir, { maxFiles = WALK_CAP } = {}) {
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
        } catch {}
      }
    }
  }
  return { files, bytes, truncated };
}

/**
 * 重扫描一个规则条目：确认存在性、（folder/drive 且 recursive 时）索引文件数、
 * 返回统计。watcher 的活性由调用方补充。
 */
export async function rescanEntry(entry) {
  const st = await statPath(entry.path.replace(/\//g, path.sep === "\\" ? "\\" : "/") || entry.path);
  const out = {
    at: new Date().toISOString(),
    exists: st.exists,
    isDir: st.isDir,
    isFile: st.isFile,
    files: 0,
    bytes: 0,
    truncated: false,
    watcherActive: false,
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

/**
 * 尝试监控变化。Windows 的 fs.watch 支持 recursive；网络盘/部分 POSIX 会抛错，
 * 此时返回 { stop, active: false }，不阻塞插件。
 */
export function startWatcher(nativePath, onEvent) {
  try {
    const watcher = fs.watch(nativePath, { recursive: true, persistent: false }, (event, filename) => {
      try {
        onEvent({ event, file: filename ? String(filename) : "" });
      } catch {}
    });
    watcher.on("error", () => {});
    return { stop: () => { try { watcher.close(); } catch {} }, active: true };
  } catch {
    return { stop: () => {}, active: false };
  }
}
