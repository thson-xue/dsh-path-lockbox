import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, buildEntries, makeMatcher } from "../src/match.js";

test("normalizePath: 反斜杠/大小写/盘根", () => {
  assert.equal(normalizePath("D:\\Docs\\a.txt"), "d:/docs/a.txt");
  assert.equal(normalizePath("E:"), "e:/");
  assert.equal(normalizePath("E:\\"), "e:/");
  assert.equal(normalizePath("e:/"), "e:/");
  assert.equal(normalizePath("/e/foo/bar"), "e:/foo/bar");
  assert.equal(normalizePath("D://a///b"), "d:/a/b");
  assert.equal(normalizePath("D:\\Docs", { matchCase: true }), "D:/Docs");
});

test("match: 文件精确命中", () => {
  const { entries } = buildEntries({ files: [{ path: "D:/secrets.env" }] });
  const m = makeMatcher(entries);
  assert.equal(m.match("D:/secrets.env").kind, "file");
  assert.equal(m.match("D:\\SECRETS.ENV").kind, "file");
  assert.equal(m.match("D:/other.txt"), null);
});

test("match: 文件夹递归与仅本层", () => {
  const rec = makeMatcher(buildEntries({ folders: [{ path: "D:/data", recursive: true }] }).entries);
  assert.equal(rec.match("D:/data").kind, "folder");
  assert.equal(rec.match("D:/data/sub/deep.txt").kind, "folder");
  const flat = makeMatcher(buildEntries({ folders: [{ path: "D:/data", recursive: false }] }).entries);
  assert.equal(flat.match("D:/data").kind, "folder"); // 仅本层仍拦对目录本身的操作
  assert.equal(flat.match("D:/data/sub/x.txt"), null);
});

test("match: 硬盘递归锁定整个分区", () => {
  const m = makeMatcher(buildEntries({ drives: [{ path: "E:/", recursive: true }] }).entries);
  assert.equal(m.match("E:/").kind, "drive");
  assert.equal(m.match("e:\\任意\\深层\\文件.md").kind, "drive");
  assert.equal(m.match("D:/tmp"), null);
});

test("match: 最长规则优先（拒绝理由报最具体那条）", () => {
  const { entries } = buildEntries({
    drives: [{ path: "E:/", recursive: true }],
    folders: [{ path: "E:/keep", recursive: true }],
  });
  const m = makeMatcher(entries);
  assert.equal(m.match("E:/keep/a.txt").path, "e:/keep");
});

test("buildEntries: 丢弃相对路径并告警", () => {
  const r = buildEntries({ folders: ["relative/path", { path: "D:/ok" }] });
  assert.equal(r.entries.length, 1);
  assert.equal(r.warnings.length, 1);
});

test("matchCommandText: 文件与硬盘规则字面扫描", () => {
  const m = makeMatcher(buildEntries({
    files: [{ path: "D:/secrets.env" }],
    drives: [{ path: "E:/", recursive: true }],
  }).entries);
  assert.equal(m.matchCommandText("type D:\\secrets.env").kind, "file");
  assert.equal(m.matchCommandText("Get-ChildItem e:/backup").kind, "drive");
  // 文件夹规则不做字面扫描（避免 e:/data 误伤 e:/database）
  const f = makeMatcher(buildEntries({ folders: [{ path: "D:/data", recursive: true }] }).entries);
  assert.equal(f.matchCommandText("cat D:/database/x.bin"), null);
});
