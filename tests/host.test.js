import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply } from "../src/index.js";

function makeMockCtx(config) {
  const listeners = {};
  let guardFn = null;
  const registered = [];
  const effects = [];
  return {
    listeners,
    getGuard: () => guardFn,
    registered,
    effects,
    config,
    on(event, fn) {
      listeners[event] = fn;
    },
    tools: {
      guard(fn) {
        guardFn = fn;
        return () => {};
      },
      register(tool) {
        registered.push(tool);
      },
    },
    effect(fn) {
      effects.push(fn);
    },
    logger: { info() {} },
  };
}

function setup(config) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-test-"));
  process.env.DSH_HOME = home;
  const ctx = makeMockCtx(config);
  apply(ctx);
  return { ctx, home };
}

test("guard 单调拒绝：命中文件规则返回拒绝理由", () => {
  const { ctx, home } = setup({ files: [{ path: "D:/secrets.env" }], folders: [], drives: [] });
  const reason = ctx.getGuard()({ name: "read", args: { file_path: "D:/secrets.env" } });
  assert.match(reason, /blocked by path-lockbox policy/);
  assert.match(reason, /D:\/secrets\.env|secrets\.env/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("guard 单调拒绝：danger-full-access 也拦 shell 命令文本", () => {
  const { ctx, home } = setup({ files: [], folders: [{ path: "E:/客户资料", recursive: true }], drives: [] });
  const reason = ctx.getGuard()({ name: "bash", args: { command: "cat 'E:/客户资料/合同.pdf'" } });
  assert.match(reason, /blocked by path-lockbox policy/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("未命中路径放行（guard 返回 undefined，pre-execute 调 next）", async () => {
  const { ctx, home } = setup({ files: [{ path: "D:/secrets.env" }], folders: [], drives: [] });
  assert.equal(ctx.getGuard()({ name: "read", args: { file_path: "D:/ok.txt" } }), undefined);
  let nextCalled = false;
  const decision = await ctx.listeners["tools/pre-execute"](
    { name: "read", args: { file_path: "D:/ok.txt" } },
    () => {
      nextCalled = true;
      return { kind: "allow" };
    },
  );
  assert.ok(nextCalled);
  assert.equal(decision.kind, "allow");
  fs.rmSync(home, { recursive: true, force: true });
});

test("pre-execute 对命中路径返回 deny 并带理由", async () => {
  const { ctx, home } = setup({ files: [], folders: [], drives: [{ path: "E:/", recursive: true }] });
  const decision = await ctx.listeners["tools/pre-execute"](
    { name: "bash", args: { command: "rm -rf E:/everything", workdir: "D:/w" } },
    () => ({ kind: "allow" }),
  );
  assert.equal(decision.kind, "deny");
  assert.match(decision.reason, /rule "E:\/"/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("post-execute 结果过滤：剔除命中路径的搜索结果与输出行", async () => {
  const { ctx, home } = setup({ files: [{ path: "D:/secrets.env" }], folders: [], drives: [] });
  const result = {
    matches: [{ path: "D:/secrets.env" }, { path: "D:/keep.txt" }],
    stdout: { text: "D:/secrets.env:1:secret\nd:/keep.txt:2:fine" },
  };
  const filtered = await ctx.listeners["tools/post-execute"]({ name: "grep", args: {} }, result, (r) => r);
  assert.deepEqual(filtered.matches, [{ path: "D:/keep.txt" }]);
  assert.equal(filtered.stdout.text, "d:/keep.txt:2:fine");
  fs.rmSync(home, { recursive: true, force: true });
});

test("规则存储文件自动硬保护（agent 连规则库都改不了）", () => {
  const { ctx, home } = setup({ files: [], folders: [], drives: [] });
  const store = path.join(home, "path-lockbox.json");
  const reason = ctx.getGuard()({ name: "write", args: { file_path: store } });
  assert.match(reason, /blocked by path-lockbox policy/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("POST config 持久化 + 用户层整段替换 + 重扫描", async () => {
  const { ctx, home } = setup({ files: [], folders: [], drives: [] });
  // 通过内部路由不可用时（mock 无 webServer），直接验证 store 读写路径
  const store = path.join(home, "path-lockbox.json");
  fs.writeFileSync(store, JSON.stringify({ version: 1, files: [{ path: "D:/from-store.txt" }], folders: [], drives: [] }));
  // 重建：重新 apply 读取 store
  const ctx2 = makeMockCtx({ files: [{ path: "D:/from-patch.txt" }], folders: [], drives: [] });
  apply(ctx2);
  const hit = ctx2.getGuard()({ name: "read", args: { file_path: "D:/from-store.txt" } });
  assert.match(hit, /blocked by path-lockbox policy/);
  const miss = ctx2.getGuard()({ name: "read", args: { file_path: "D:/from-patch.txt" } });
  assert.equal(miss, undefined); // 用户层整段替换 patch 默认
  fs.rmSync(home, { recursive: true, force: true });
});

test("lockbox_status 工具注册且只读", async () => {
  const { ctx, home } = setup({ files: [{ path: "D:/a.txt" }], folders: [], drives: [] });
  assert.equal(ctx.registered.length, 1);
  assert.equal(ctx.registered[0].name, "lockbox_status");
  const out = JSON.parse(await ctx.registered[0].execute());
  assert.equal(out.rules.files.length, 1);
  fs.rmSync(home, { recursive: true, force: true });
});
