// client 半：桌面壳要求每个 bundle 有 client 模块。页面本体由宿主路由
// /path-lockbox/ui 提供，这里只做机会性注入——宿主暴露插件页 slot 时把页面
// 嵌进去；没有 slot API 时静默退出，不影响宿主与拦截层。

export const name = "path-lockbox-client";

export function apply(ctx) {
  try {
    const inject = ctx.inject;
    if (typeof inject !== "function") return;
    inject({
      slot: "plugins",
      id: "path-lockbox",
      render() {
        return {
          html:
            '<iframe src="/path-lockbox/ui" style="width:100%;height:78vh;border:0;' +
            'border-radius:12px;background:transparent"></iframe>',
        };
      },
    });
  } catch {
    // 宿主没有该 slot 契约时忽略；用户可直接打开 /path-lockbox/ui
  }
}
