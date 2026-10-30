// Generated from src/client.js by node build.mjs; do not edit.
window.__ModuleLoader__.load({
	id: "dsh-path-lockbox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client.js
		var client_exports = {};
		__export(client_exports, {
		  apply: () => apply,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(client_exports);
		var name = "path-lockbox-client";
		var inject = ["slots"];
		var UI_URL = "/path-lockbox/ui";
		var PACKAGE_NAME = "dsh-path-lockbox";
		var SECTION_SLOT = "settings.section";
		var SECTION_ID = "path-lockbox";
		var SECTION_ORDER = 50;
		var SECTION_LABEL = "\u6587\u4EF6\u9501";
		var FRAME_TITLE = "\u6587\u4EF6\u9501";
		var PANEL_SLOT = "plugins.detail.section";
		var PANEL_KEY = "dsh-path-lockbox#ui";
		var React = null;
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
		      background: "transparent"
		    }
		  });
		}
		function PathLockboxSection() {
		  return PathLockboxFrame(FRAME_TITLE, "72vh");
		}
		function PathLockboxPanel(props) {
		  if (!React) return null;
		  const pkgName = props?.subject?.pkg?.name;
		  if (typeof pkgName === "string" && pkgName !== PACKAGE_NAME) return null;
		  return PathLockboxFrame(PACKAGE_NAME, "78vh");
		}
		var NAV_MARK = "data-dsh-lockbox-nav";
		var NAV_ROW_SELECTOR = '[role="dialog"] nav button';
		var LOCK_MASK = "data:image/svg+xml;utf8," + encodeURIComponent(
		  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
		);
		var NAV_ICON_CSS = [
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
		  "}"
		].join("\n");
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
		  }
		}
		function apply(ctx) {
		  if (!React) return;
		  let slots;
		  try {
		    slots = ctx.slots;
		  } catch {
		    return;
		  }
		  if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
		  try {
		    slots.inject(
		      SECTION_SLOT,
		      () => slots.register(
		        {
		          name: SECTION_SLOT,
		          id: SECTION_ID,
		          order: SECTION_ORDER,
		          // label 是函数：宿主每次渲染都会重新取，可直接给出中文显示名
		          label: () => SECTION_LABEL
		        },
		        PathLockboxSection
		      )
		    );
		  } catch {
		  }
		  installNavIcon(ctx, () => SECTION_LABEL);
		  try {
		    slots.inject(PANEL_SLOT, () => slots.register({ name: PANEL_SLOT, key: PANEL_KEY }, PathLockboxPanel));
		  } catch {
		  }
		}
		return module.exports;
	}
});
