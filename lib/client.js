// src/client.js
var name = "path-lockbox-client";
function apply(ctx) {
  try {
    const inject = ctx.inject;
    if (typeof inject !== "function") return;
    inject({
      slot: "plugins",
      id: "path-lockbox",
      render() {
        return {
          html: '<iframe src="/path-lockbox/ui" style="width:100%;height:78vh;border:0;border-radius:12px;background:transparent"></iframe>'
        };
      }
    });
  } catch {
  }
}
export {
  apply,
  name
};
