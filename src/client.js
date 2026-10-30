// client 半：dsh 0.2.x 的 UI 注入走 ctx.slots（由 @deepseek-ai/dsh-client-ui-renderer 提供）。
//
// 旧写法 `ctx.inject({ slot, id, render })` 是「服务注入」API（形状应为
// ctx.inject(["serviceA"], (inner) => {...})），传错形状会抛错并被 try/catch 吞掉，
// 表现为插件卡片正常、详情页没有界面。
//
// 重要：**绝不能因为 UI 注入失败而让整个 web boot 起不来**。宿主把「某个 client
// entry 未激活」当成启动失败（web boot: 1 entry did not activate），所以这里对
// 每一次可能抛错的访问（含 ctx.slots 的属性读取、require("react")）都做兜底。
//
// 两个注册点：
//   1. settings.section —— 设置页左侧导航的一个栏目，label 决定显示名（这里用中文「文件锁」）
//   2. plugins.detail.section —— 插件详情页的配置区（与上面同一份界面）

export const name = "path-lockbox-client";

// 客户端插件同样要走 Cordis 的服务注入：只有声明过的服务才能用 ctx.<name> 读，
// 否则属性访问会被代理陷阱拒掉（cannot get property "slots" without inject），
// 进而让这个 client entry 激活失败 —— 而宿主把「某个 entry 未激活」当成整个
// web boot 失败（web boot: 1 entry did not activate）。dsh-ops 的写法即
// exports.inject = ['slots', 'locale', 'remote']。
export const inject = ["slots"];

const UI_URL = "/path-lockbox/ui";
const PACKAGE_NAME = "dsh-path-lockbox";

// 设置页栏目
const SECTION_SLOT = "settings.section";
const SECTION_ID = "path-lockbox";
const SECTION_ORDER = 50;
const SECTION_LABEL = "文件锁";
// iframe 的 title 走读屏，保持纯文字（不混 emoji）
const FRAME_TITLE = "文件锁";

// 插件详情页配置区
const PANEL_SLOT = "plugins.detail.section";
const PANEL_KEY = "dsh-path-lockbox#ui";

let React = null;
try {
  React = require("react");
} catch {
  React = null;
}

function PathLockboxFrame(title, height) {
  if (!React) return null;
  return React.createElement("iframe", {
    src: UI_URL,
    title,
    style: {
      width: "100%",
      height,
      border: "0",
      borderRadius: "12px",
      background: "transparent",
    },
  });
}

/** 设置页「文件锁」栏目内容：直接嵌入插件自带界面。 */
function PathLockboxSection() {
  // iframe 的 title 是给读屏用的，用纯文字；导航项才带锁头字符。
  return PathLockboxFrame(FRAME_TITLE, "72vh");
}

/** 插件详情页配置区：只在 dsh-path-lockbox 自己的页面渲染。 */
function PathLockboxPanel(props) {
  if (!React) return null;
  const pkgName = props?.subject?.pkg?.name;
  if (typeof pkgName === "string" && pkgName !== PACKAGE_NAME) return null;
  return PathLockboxFrame(PACKAGE_NAME, "78vh");
}

// ---- 设置导航图标 -----------------------------------------------------------
//
// 宿主的 settings.section 没有 icon 选项：SettingsRoot 里的 navIcon(id) 只认
// account / models / agent-presets / plugins / archived-sessions 五个内置 id，
// 其余一律画齿轮。所以第三方插件（dshmarket、better-sidebar…）走的都是同一条路：
// 注入一段 CSS 把宿主那个齿轮 svg 藏掉，再用 mask-image 画自己的图标，靠导航
// 按钮的文字匹配定位到自己那一行。
//
// dshmarket 的源码注释写得很直白：「Delete this module the day
// settings.section grows an icon field.」等宿主真加了 icon 字段，这段就能删。

const NAV_MARK = "data-dsh-lockbox-nav";
const NAV_ROW_SELECTOR = '[role="dialog"] nav button';

/** 锁图标（lucide lock），用描边的 alpha 当 mask。 */
const LOCK_MASK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  );

const NAV_ICON_CSS = [
  "[" + NAV_MARK + "] > svg { display: none; }",
  "[" + NAV_MARK + "]::before {",
  "  content: '';",
  "  flex: none;",
  "  width: 16px;",
  "  height: 16px;",
  "  background-color: currentColor;",
  '  -webkit-mask-image: url("' + LOCK_MASK + '");',
  '  mask-image: url("' + LOCK_MASK + '");',
  "  -webkit-mask-repeat: no-repeat;",
  "  mask-repeat: no-repeat;",
  "  -webkit-mask-position: center;",
  "  mask-position: center;",
  "  -webkit-mask-size: 16px 16px;",
  "  mask-size: 16px 16px;",
  "}",
].join("\n");

/**
 * 给自己的设置导航行装一个锁头图标。
 *
 * 只在渲染进程里工作；宿主换版本导致选择器失配时静默不动（齿轮还在，功能不受
 * 影响），绝不因为图标而抛错 —— 那会让 client entry 激活失败、拖垮 web boot。
 *
 * @param ctx - client 上下文（用 effect 管理生命周期）。
 * @param getLabel - 返回当前导航文字；与 settings.section 的 label 同一个来源。
 */
function installNavIcon(ctx, getLabel) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  const run = () => {
    const style = document.createElement("style");
    style.dataset.plugin = PACKAGE_NAME;
    style.dataset.pluginCss = PACKAGE_NAME + "/settings-nav-icon";
    style.textContent = NAV_ICON_CSS;
    document.head.appendChild(style);

    let scheduled = false;
    const mark = () => {
      scheduled = false;
      const wanted = String(getLabel() ?? "").trim();
      if (!wanted) return;
      let buttons;
      try {
        buttons = document.querySelectorAll(NAV_ROW_SELECTOR);
      } catch {
        return;
      }
      for (const btn of buttons) {
        const text = String(btn.textContent ?? "").trim();
        if (text === wanted) btn.setAttribute(NAV_MARK, "");
        else btn.removeAttribute(NAV_MARK);
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(mark);
      else setTimeout(mark, 0);
    };

    const observer = new MutationObserver(schedule);
    try {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch {
      // body 还没就绪：下面的 schedule() 会先跑一次，之后靠观察器兜底
    }
    schedule();

    return () => {
      observer.disconnect();
      style.remove();
    };
  };

  try {
    if (typeof ctx?.effect === "function") ctx.effect(() => run());
    else run();
  } catch {
    // 图标是锦上添花，失败不影响任何拦截能力
  }
}

export function apply(ctx) {
  if (!React) return;
  let slots;
  try {
    // ctx 可能对未声明服务抛出属性访问错误，这一步必须在 try 内。
    slots = ctx.slots;
  } catch {
    return;
  }
  if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;

  try {
    slots.inject(SECTION_SLOT, () =>
      slots.register(
        {
          name: SECTION_SLOT,
          id: SECTION_ID,
          order: SECTION_ORDER,
          // label 是函数：宿主每次渲染都会重新取，可直接给出中文显示名
          label: () => SECTION_LABEL,
        },
        PathLockboxSection,
      ),
    );
  } catch {
    // 设置页未提供该槽：跳过，不影响插件详情页与 /path-lockbox/ui
  }

  // 设置导航的锁头图标：宿主没有 icon 字段，只能靠注入 CSS 盖掉齿轮再画。
  installNavIcon(ctx, () => SECTION_LABEL);

  try {
    slots.inject(PANEL_SLOT, () => slots.register({ name: PANEL_SLOT, key: PANEL_KEY }, PathLockboxPanel));
  } catch {
    // 插件详情页未提供该槽：跳过
  }
}
