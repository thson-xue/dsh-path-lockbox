// client 半：dsh 0.2.x 的 UI 注入走 ctx.slots（由 @deepseek-ai/dsh-client-ui-renderer 提供）。
//
// 旧写法 `ctx.inject({ slot, id, render })` 是「服务注入」API（形状应是
// ctx.inject(["serviceA"], (inner) => {...})），传错形状会抛错并被下面的 try/catch
// 吞掉，表现为插件卡片正常显示、但详情页里始终没有配置界面。
//
// 现在注册到 plugins.detail.section（list 槽，渲染在插件详情页的配置区），
// 用 subject.pkg.name 过滤，避免出现在其它插件的详情页。
// 页面本体仍由宿主路由 /path-lockbox/ui 提供（见 src/index.js）。

const React = require("react");

export const name = "path-lockbox-client";

const PANEL_SLOT = "plugins.detail.section";
const PANEL_KEY = "dsh-path-lockbox#ui";
const PACKAGE_NAME = "dsh-path-lockbox";
const UI_URL = "/path-lockbox/ui";

function PathLockboxPanel(props) {
  const pkgName = props?.subject?.pkg?.name;
  if (typeof pkgName === "string" && pkgName !== PACKAGE_NAME) return null;
  return React.createElement("iframe", {
    src: UI_URL,
    title: "dsh-path-lockbox",
    style: {
      width: "100%",
      height: "78vh",
      border: "0",
      borderRadius: "12px",
      background: "transparent",
    },
  });
}

export function apply(ctx) {
  const slots = ctx?.slots;
  if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
  try {
    slots.inject(PANEL_SLOT, () => slots.register({ name: PANEL_SLOT, key: PANEL_KEY }, PathLockboxPanel));
  } catch {
    // 宿主未提供该槽或签名不同：退化为直接访问 /path-lockbox/ui
  }
}
