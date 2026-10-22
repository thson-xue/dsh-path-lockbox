// 插件页面 HTML（由宿主路由 GET /path-lockbox/ui 提供，宿主负责连接围栏）。
// 卡片式布局，适配 dsh Web GUI 主题：优先消费宿主 CSS 变量
// （--color-background-* / --color-text-* / --color-border-*），缺席时按系统
// 明暗色回退。分类：文件 / 文件夹 / 硬盘，每类一张卡片。

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderUiHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>路径锁定箱 · Path Lockbox</title>
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
  .card-desc { color: var(--lb-fg3); font-size: 12px; font-weight: 400; }
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
  .btn.plus { min-width: 32px; padding: 6px 0; font-size: 16px; font-weight: 600; line-height: 1; }
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
  .picklist div.dir::before { content: "▸ "; color: var(--lb-warn); }
  .picklist div.file::before { content: "· "; color: var(--lb-fg3); }
  .picklist div.drive::before { content: "⛁ "; color: var(--lb-accent); }
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
    <h1>路径锁定箱</h1>
    <div class="sub">锁定的路径对所有工具调用一律拒绝——包括完全访问模式。卡片按 文件 / 文件夹 / 硬盘 分类。</div>
  </div>
  <div class="counters">
    <div><b id="cRules">-</b>规则</div>
    <div><b id="cWatch">-</b>监控中</div>
    <div><b id="cEvents">-</b>监控事件</div>
  </div>
</div>

<div class="grid">
  <div class="card" data-kind="files">
    <div class="card-head"><span class="dot files"></span><span class="card-title">锁定文件</span><span class="card-desc">支持所有文件类型</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary plus" data-add title="添加">+</button>
      <button class="btn" data-custom>选择路径…</button>
      <button class="btn danger" data-remove>移除</button>
      <button class="btn" data-rescan>立即重扫描</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk dis"><input type="checkbox" data-chk-recursive disabled>索引子文件夹</label>
      <label class="chk dis"><input type="checkbox" data-chk-watch disabled>尝试监控变化</label>
      <button class="btn" data-rescan-all style="float:right">重扫描全部</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>

  <div class="card" data-kind="folders">
    <div class="card-head"><span class="dot folders"></span><span class="card-title">锁定文件夹</span><span class="card-desc">打开要锁定的文件夹</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary plus" data-add title="添加">+</button>
      <button class="btn" data-custom>选择路径…</button>
      <button class="btn danger" data-remove>移除</button>
      <button class="btn" data-rescan>立即重扫描</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk"><input type="checkbox" data-chk-recursive>索引子文件夹</label>
      <label class="chk"><input type="checkbox" data-chk-watch>尝试监控变化</label>
      <button class="btn" data-rescan-all style="float:right">重扫描全部</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>

  <div class="card" data-kind="drives">
    <div class="card-head"><span class="dot drives"></span><span class="card-title">锁定分区</span><span class="card-desc">锁定的硬盘分区</span><span class="count" data-count></span></div>
    <div class="entries" data-list></div>
    <div class="actions">
      <button class="btn primary plus" data-add title="添加">+</button>
      <button class="btn" data-custom>选择路径…</button>
      <button class="btn danger" data-remove>移除</button>
      <button class="btn" data-rescan>立即重扫描</button>
    </div>
    <div class="settings" data-settings>
      <div class="path" data-setpath></div>
      <label class="chk"><input type="checkbox" data-chk-recursive>索引子文件夹</label>
      <label class="chk"><input type="checkbox" data-chk-watch>尝试监控变化</label>
      <button class="btn" data-rescan-all style="float:right">重扫描全部</button>
      <div class="stat" data-stat></div>
      <div class="note" data-note></div>
    </div>
  </div>
</div>

<div class="overlay" id="pickOverlay">
  <div class="dialog">
    <h3 id="pickTitle">选择路径</h3>
    <div class="crumb" id="crumb"></div>
    <div class="picklist" id="pickList"></div>
    <div class="dlgbtns">
      <button class="btn" id="pickUp">上一级</button>
      <button class="btn primary" id="pickOk">确定</button>
      <button class="btn" id="pickCancel">取消</button>
    </div>
  </div>
</div>

<div class="overlay" id="customOverlay">
  <div class="dialog" style="width:480px">
    <h3 id="customTitle">选择路径</h3>
    <div class="sub" id="customHint"></div>
    <input class="txt" id="customInput" spellcheck="false">
    <div class="hint" id="customErr"></div>
    <div class="dlgbtns">
      <button class="btn primary" id="customOk">确定</button>
      <button class="btn" id="customCancel">取消</button>
    </div>
  </div>
</div>

<script>
(() => {
  const KINDS = {
    files:   { leaf: true,  pickTitle: "选择文件",  customHint: "输入文件的绝对路径，如 D:\\\\docs\\\\a.txt 或 ~/secrets.env。" },
    folders: { leaf: false, pickTitle: "选择文件夹", customHint: "输入文件夹的绝对路径，如 D:\\\\docs 或 ~/work。" },
    drives:  { leaf: false, pickTitle: "选择硬盘",  customHint: "输入盘符，如 E: / E:\\\\ / E:/。" },
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
    q(c, "[data-count]").textContent = arr.length + " 条";
    const box = q(c, "[data-list]");
    box.innerHTML = "";
    if (!arr.length) {
      box.innerHTML = '<div class="empty">暂无条目，点「+」或「选择路径…」</div>';
    }
    arr.forEach((e, i) => {
      const div = document.createElement("div");
      div.className = "entry" + (i === sel[kind] ? " sel" : "");
      const badge = k.leaf ? "" :
        '<span class="badge ' + (e.recursive ? "on" : "off") + '">' + (e.recursive ? "含子项" : "仅本层") + "</span>" +
        '<span class="badge ' + (e.watch ? "on" : "off") + '">' + (e.watch ? "监控中" : "未监控") + "</span>";
      div.innerHTML = "<span>" + esc(e.path) + "</span>" + badge +
        '<button class="rm" title="移除">✕</button>';
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
    q(c, "[data-note]").textContent = k.leaf ? "文件是叶子节点，没有子项可索引。" : "";
    const st = stats[e.path];
    q(c, "[data-stat]").textContent = st
      ? "重扫描 " + st.at + "：存在=" + (st.exists ? "是" : "否") +
        (st.files ? "，" + st.files + " 个文件 / " + (st.bytes / 1048576).toFixed(1) + " MB" : "") +
        (st.truncated ? "（已达枚举上限）" : "") +
        "，监控=" + (st.watcherActive ? "活动中" : "未启用/不可用")
      : "尚未重扫描。";
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

  // ---- 设置勾选 ----
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
      if (!e) { q(c, "[data-stat]").textContent = "先选择一个条目。"; return; }
      q(c, "[data-stat]").textContent = "重扫描中…";
      const d = await api("rescan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: e.path }) });
      stats = d.stats || stats; renderSettings(kind);
    };
    q(c, "[data-rescan-all]").onclick = async () => {
      q(c, "[data-stat]").textContent = "重扫描全部中…";
      const d = await api("rescan", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }) });
      stats = d.stats || stats; renderAll();
    };
  }

  // ---- 浏览选择 ----
  async function addPicked(kind, path) {
    if (kind === "drives") state.drives.push({ path, recursive: true, watch: false });
    else if (kind === "folders") state.folders.push({ path, recursive: true, watch: false });
    else state.files.push({ path });
    sel[kind] = state[kind].length - 1;
    await save(); await reload();
  }

  async function openPicker(kind) {
    // 目录类优先用系统文件对话框（宿主 ctx.directoryPicker 的 native 能力）。
    // 文件类走不了：native 能力是目录选择器。宿主没有能力或调用失败时回退内置浏览器。
    let res = null;
    if (kind !== "files") {
      try {
        res = await api("pick", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind }),
        });
      } catch {
        res = null;
      }
    }
    if (res && res.native) {
      if (res.path) { await addPicked(kind, res.path); return; }
      return; // 用户取消或对话框忙：不弹内置浏览器
    }
    pick.kind = kind; pick.selPath = "";
    $("pickTitle").textContent = KINDS[kind].pickTitle;
    $("pickOverlay").classList.add("show");
    await browse(kind === "drives" ? "" : "/");
  }

  async function browse(path) {
    const d = await api("browse" + (path ? "?path=" + encodeURIComponent(path) : ""));
    pick.path = d.path;
    $("crumb").textContent = d.path || "此电脑";
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
    $("pickOverlay").classList.remove("show");
    await addPicked(k, pick.selPath);
  };
  $("pickCancel").onclick = () => $("pickOverlay").classList.remove("show");

  for (const kind of Object.keys(KINDS)) {
    card(kind).querySelector("[data-add]").onclick = () => openPicker(kind);
  }

  // ---- 自定义添加 ----
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
      if (!m) { $("customErr").textContent = "硬盘类别请填盘符，如 E: / E:\\\\ / E:/"; return; }
      path = m[1] + ":/";
    } else if (!/^([a-zA-Z]:[\\\\\\/]|\\/|~)/.test(raw)) {
      $("customErr").textContent = "必须是绝对路径（如 D:\\\\docs 或 ~/secrets.env）";
      return;
    }
    if (arr.some(e => e.path.toLowerCase() === path.toLowerCase())) {
      $("customErr").textContent = "该路径已在列表中"; return;
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
