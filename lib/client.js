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
		  name: () => name
		});
		module.exports = __toCommonJS(client_exports);
		var React = require("react");
		var name = "path-lockbox-client";
		var PANEL_SLOT = "plugins.detail.section";
		var PANEL_KEY = "dsh-path-lockbox#ui";
		var PACKAGE_NAME = "dsh-path-lockbox";
		var UI_URL = "/path-lockbox/ui";
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
		      background: "transparent"
		    }
		  });
		}
		function apply(ctx) {
		  const slots = ctx?.slots;
		  if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
		  try {
		    slots.inject(PANEL_SLOT, () => slots.register({ name: PANEL_SLOT, key: PANEL_KEY }, PathLockboxPanel));
		  } catch {
		  }
		}
		return module.exports;
	}
});
