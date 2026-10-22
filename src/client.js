// client 半：dsh 0.2.x 的 UI 注入走 ctx.slots（由 @deepseek-ai/dsh-client-ui-renderer 提供）。
//
// 旧写法 `ctx.inject({ slot, id, render })` 是「服务注入」API（形状应为
// ctx.inject(["serviceA"], (inner) => {...})），传错形状会抛错并被 try/catch 吞掉，
// 表现为插件卡片正常、详情页没有界面。
//
// 重要：**绝不能因为 UI 注入失败而让整个 web boot 起不来**。宿主把「某个 client
// entry 未激活」当成启动失败（web boot: 1 entry did not activate），所以这里对
// 每一次可能抛错的访问（含 ctx.slots 的属性读取、require("react")）都做兜底：
// 拿不到就静默退化，页面仍可直接访问 /path-lockbox/ui。

export const name = "path-lockbox-client";

// 客户端插件同样要走 Cordis 的服务注入：只有声明过的服务才能用 ctx.<name> 读，
// 否则属性访问会被代理陷阱拒掉（cannot get property "slots" without inject），
// 进而让这个 client entry 激活失败 —— 而宿主把「某个 entry 未激活」当成整个
// web boot 失败（web boot: 1 entry did not activate）。dsh-ops 的写法即
// exports.inject = ['slots', 'locale', 'remote']。
export const inject = ["slots"];

const PANEL_SLOT = "plugins.detail.section";
const PANEL_KEY = "dsh-path-lockbox#ui";
const PACKAGE_NAME = "dsh-path-lockbox";
const UI_URL = "/path-lockbox/ui";

let React = null;
try {
  React = require("react");
} catch {
  React = null;
}

function PathLockboxPanel(props) {
  if (!React) return null;
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
  try {
    if (!React) return;
    // ctx 可能对未声明服务抛出属性访问错误，这一步必须在 try 内。
    const slots = ctx.slots;
    if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
    slots.inject(PANEL_SLOT, () => slots.register({ name: PANEL_SLOT, key: PANEL_KEY }, PathLockboxPanel));
  } catch {
    // 宿主未提供该槽或签名不同：静默退化，用户仍可直接打开 /path-lockbox/ui
  }
}
