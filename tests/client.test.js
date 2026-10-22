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

/** 执行 lib/client.js，返回 { spec, mod }（mod 由工厂函数产出）。 */
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

test("client：注册到 plugins.detail.section", () => {
  const { spec, mod } = loadClient();
  assert.equal(spec.id, "dsh-path-lockbox");
  assert.equal(mod.name, "path-lockbox-client");
  assert.equal(typeof mod.apply, "function");
  // 必须声明服务依赖，否则 ctx.slots 的属性访问会被代理陷阱拒绝，
  // 该 client entry 激活失败，宿主会判定整个 web boot 失败。
  assert.deepEqual(mod.inject, ["slots"]);

  const registrations = [];
  const ctx = {
    slots: {
      inject(name, fn) {
        assert.equal(name, "plugins.detail.section");
        return fn();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  mod.apply(ctx);

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, "plugins.detail.section");
  assert.equal(registrations[0].options.key, "dsh-path-lockbox#ui");
  assert.equal(typeof registrations[0].component, "function");
});

test("client：只在本插件详情页渲染 iframe", () => {
  const { mod, react } = loadClient();
  let component;
  mod.apply({
    slots: {
      inject: (_name, fn) => fn(),
      register: (_options, c) => { component = c; return () => {}; },
    },
  });
  assert.ok(component);

  const mine = component({ subject: { kind: "row", pkg: { name: "dsh-path-lockbox" } } });
  assert.equal(mine.type, "iframe");
  assert.equal(mine.props.src, "/path-lockbox/ui");
  assert.match(String(mine.props.style.height), /78vh/);

  const other = component({ subject: { kind: "row", pkg: { name: "some-other-plugin" } } });
  assert.equal(other, null);

  // subject 缺失时不应崩溃（详情页上下文可能只有部分字段）
  assert.equal(component({}).type, "iframe");
  assert.equal(react.created.length >= 2, true);
});

test("client：没有 slots 服务时不抛错（宿主版本不同）", () => {
  const { mod } = loadClient();
  assert.doesNotThrow(() => mod.apply({}));
  assert.doesNotThrow(() => mod.apply({ slots: {} }));
});
