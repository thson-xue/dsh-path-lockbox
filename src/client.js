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
  return PathLockboxFrame(SECTION_LABEL, "72vh");
}

/** 插件详情页配置区：只在 dsh-path-lockbox 自己的页面渲染。 */
function PathLockboxPanel(props) {
  if (!React) return null;
  const pkgName = props?.subject?.pkg?.name;
  if (typeof pkgName === "string" && pkgName !== PACKAGE_NAME) return null;
  return PathLockboxFrame(PACKAGE_NAME, "78vh");
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

  try {
    slots.inject(PANEL_SLOT, () => slots.register({ name: PANEL_SLOT, key: PANEL_KEY }, PathLockboxPanel));
  } catch {
    // 插件详情页未提供该槽：跳过
  }
}
