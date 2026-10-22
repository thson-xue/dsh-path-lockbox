// Generated from src/client.js by node build.mjs; do not edit.
window.__ModuleLoader__.load({
	id: "dsh-path-lockbox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

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

		exports.apply = apply;
		exports.name = name;
		return module.exports;
	}
});
