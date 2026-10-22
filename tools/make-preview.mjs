// 生成 UI 预览页（假数据 + fetch 桩），不参与插件运行。dsh-path-lockbox/preview.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderUiHtml } from "../src/ui.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mock = `
window.fetch = async (url, opts) => {
  const u = String(url);
  const J = (obj) => ({ ok: true, json: async () => obj });
  if (u.endsWith("/api/config")) {
    if (opts && opts.method === "POST") return J({ ok: true });
    return J({
      config: {
        files: [
          { path: "d:/合同/报价最终版.xlsx" },
          { path: "c:/users/me/secrets.env" },
        ],
        folders: [
          { path: "d:/客户资料", recursive: true, watch: true },
          { path: "e:/备份/账套", recursive: false, watch: false },
        ],
        drives: [{ path: "e:/", recursive: true, watch: false }],
      },
      stats: {
        "d:/客户资料": { at: "2026-10-22T17:30:00Z", exists: true, files: 342, bytes: 128943104, truncated: false, watcherActive: true },
      },
      events: [
        { ts: "2026-10-22T17:31:02Z", path: "d:/客户资料", event: "change", file: "合同\\\\v3.docx" },
        { ts: "2026-10-22T17:31:05Z", path: "d:/客户资料", event: "rename", file: "tmp.tmp" },
        { ts: "2026-10-22T17:31:40Z", path: "e:/", event: "change", file: "scan.log" },
      ],
    });
  }
  if (u.includes("/api/browse")) return J({
    path: "d:/", parent: "",
    entries: [
      { name: "客户资料", path: "d:/客户资料", isDir: true, isFile: false, isDrive: false },
      { name: "项目", path: "d:/项目", isDir: true, isFile: false, isDrive: false },
      { name: "报价最终版.xlsx", path: "d:/报价最终版.xlsx", isDir: false, isFile: true, isDrive: false },
    ],
  });
  if (u.includes("/api/rescan")) return J({ ok: true, stats: {
    "d:/客户资料": { at: new Date().toISOString(), exists: true, files: 342, bytes: 128943104, truncated: false, watcherActive: true },
  }});
  if (u.includes("/api/events")) return J({ events: [] });
  return J({});
};
`;
const html = renderUiHtml().replace("<script>", "<script>" + mock);
const out = path.join(here, "..", "preview.html");
fs.writeFileSync(out, html, "utf8");
console.log("preview written:", out);
