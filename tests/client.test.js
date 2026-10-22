// client 半身的契约测试：lib/client.js 是宿主模块加载器外壳，不是 ES 模块，
// 所以这里用 new Function 注入 window 来执行，再用假的 require 提供 react。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libFile = path.join(here, "..", "lib", "client.js");

function fakeReact() {
  const created = [];
  return {
    created,
    createElement(type, props, children) {
      const node = { type, props: props ?? {}, children };
      created.push(node);
      return node;
    },
  };
}

/** 执行 lib/client.js，返回 { spec, mod, react }（mod 由工厂函数产出）。 */
function loadClient() {
  let spec;
  const win = { __ModuleLoader__: { load(value) { spec = value; } } };
  const source = fs.readFileSync(libFile, "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", source)(win);
  assert.ok(spec, "client 半身应调用 window.__ModuleLoader__.load");

  const react = fakeReact();
  const mod = spec.factory((id) => {
    if (id === "react") return react;
    throw new Error(`unexpected require: ${id}`);
  });
  return { spec, mod, react };
}

/** 用假的 slots 服务跑一遍 apply，返回按 slot 名索引的注册表。 */
function runApply(mod) {
  const registrations = [];
  const ctx = {
    slots: {
      inject(_name, fn) {
        return fn();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  mod.apply(ctx);
  return registrations;
}

test("client：声明 slots 服务依赖", () => {
  const { spec, mod } = loadClient();
  assert.equal(spec.id, "dsh-path-lockbox");
  assert.equal(mod.name, "path-lockbox-client");
  assert.equal(typeof mod.apply, "function");
  // 必须声明服务依赖，否则 ctx.slots 的属性访问会被代理陷阱拒绝，
  // 该 client entry 激活失败，宿主会判定整个 web boot 失败。
  assert.deepEqual(mod.inject, ["slots"]);
});

test("client：设置页注册一个叫「文件锁」的栏目", () => {
  const { mod } = loadClient();
  const regs = runApply(mod);
  const section = regs.find((r) => r.options.name === "settings.section");
  assert.ok(section, "应注册 settings.section");
  assert.equal(section.options.id, "path-lockbox");
  assert.equal(typeof section.options.order, "number");
  // label 是函数，宿主每次渲染重新取；必须是中文显示名
  assert.equal(typeof section.options.label, "function");
  assert.equal(section.options.label(), "文件锁");
  assert.equal(typeof section.component, "function");
});

test("client：插件详情页注册配置区", () => {
  const { mod } = loadClient();
  const regs = runApply(mod);
  const panel = regs.find((r) => r.options.name === "plugins.detail.section");
  assert.ok(panel, "应注册 plugins.detail.section");
  assert.equal(panel.options.key, "dsh-path-lockbox#ui");
  assert.equal(typeof panel.component, "function");
});

test("client：详情页组件只在本插件页面渲染 iframe", () => {
  const { mod, react } = loadClient();
  const regs = runApply(mod);
  const panel = regs.find((r) => r.options.name === "plugins.detail.section");

  const mine = panel.component({ subject: { kind: "row", pkg: { name: "dsh-path-lockbox" } } });
  assert.equal(mine.type, "iframe");
  assert.equal(mine.props.src, "/path-lockbox/ui");
  assert.match(String(mine.props.style.height), /78vh/);

  const other = panel.component({ subject: { kind: "row", pkg: { name: "some-other-plugin" } } });
  assert.equal(other, null);

  // subject 缺失时不应崩溃（详情页上下文可能只有部分字段）
  assert.equal(panel.component({}).type, "iframe");
  assert.equal(react.created.length >= 2, true);
});

test("client：设置栏目渲染同一个界面", () => {
  const { mod } = loadClient();
  const regs = runApply(mod);
  const section = regs.find((r) => r.options.name === "settings.section");
  const node = section.component({});
  assert.equal(node.type, "iframe");
  assert.equal(node.props.src, "/path-lockbox/ui");
  assert.equal(node.props.title, "文件锁");
});

test("client：没有 slots 服务时不抛错（宿主版本不同）", () => {
  const { mod } = loadClient();
  assert.doesNotThrow(() => mod.apply({}));
  assert.doesNotThrow(() => mod.apply({ slots: {} }));
});
