import test from "node:test";
import assert from "node:assert/strict";
import { extractPathsFromCommand } from "../src/extract.js";

test("剥引号与 ENV= 前缀", () => {
  const out = extractPathsFromCommand('cat "D:/my docs/secret.env" && ENV=X type D:\\a.txt', { home: "C:/Users/u" });
  assert.ok(out.includes("d:/my docs/secret.env"));
  assert.ok(out.includes("d:/a.txt"));
});

test("跟随 cd 重新锚定相对路径", () => {
  const out = extractPathsFromCommand("cd D:/data && cat sub/x.txt", { home: "C:/Users/u" });
  assert.ok(out.includes("d:/data"));
  assert.ok(out.includes("d:/data/sub/x.txt"));
});

test("~ 展开与 git-bash 盘符映射", () => {
  const out = extractPathsFromCommand("cat ~/.ssh/id_rsa", { home: "C:/Users/u" });
  assert.ok(out.includes("c:/users/u/.ssh/id_rsa"));
  const out2 = extractPathsFromCommand("cat /e/backup/k.txt", { home: "C:/Users/u" });
  assert.ok(out2.includes("e:/backup/k.txt"));
});

test("URL 与选项不产生候选", () => {
  const out = extractPathsFromCommand("curl https://x.com/a -o out.bin", { cwd: "D:/w", home: "C:/Users/u" });
  assert.ok(!out.some((p) => p.includes("https://")));
  assert.ok(out.includes("d:/w/out.bin"));
});

test("空输入返回空数组", () => {
  assert.deepEqual(extractPathsFromCommand("", {}), []);
  assert.deepEqual(extractPathsFromCommand(null, {}), []);
});
