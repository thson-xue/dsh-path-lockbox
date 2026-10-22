// esbuild 构建宿主面与 client 面（lib/ 产物建议随仓库提交，安装时零构建脚本）。
//
// 两个面的产物格式**必须不同**：
//
//  - 宿主面 lib/index.js 是 ESM：宿主以 import 加载它，`export` 正常。
//  - client 面 lib/client.js **不能是 ESM**。宿主把所有插件的 client.js
//    拼成一个 classic <script> 一次性加载；顶层 `export` 会抛
//    `Uncaught SyntaxError: Unexpected token 'export'`，并让整个 web boot
//    以 "N entry did not activate" 失败——宿主起不来，界面白屏。
//    正确形态是宿主的模块外壳：
//      window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
//    factory 内用 CommonJS 的 exports 暴露 name/apply。
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

let esbuild;
try {
  esbuild = require("esbuild");
} catch {
  console.error("缺少 esbuild：先在工程目录 npm i -D esbuild，或用工作区 node_modules 的 NODE_PATH。");
  process.exit(1);
}

const common = { bundle: true, minify: false, sourcemap: false, logLevel: "info" };

// 1) 宿主面：ESM，宿主 import 加载。
await esbuild.build({
  ...common,
  entryPoints: [path.join(here, "src/index.js")],
  platform: "node",
  format: "esm",
  outfile: path.join(here, "lib/index.js"),
});

// 2) client 面：先打成 CJS，再包进宿主的模块加载器外壳。
const pkg = JSON.parse(await fs.readFile(path.join(here, "package.json"), "utf8"));
const client = await esbuild.build({
  ...common,
  entryPoints: [path.join(here, "src/client.js")],
  platform: "browser",
  format: "cjs",
  write: false,
});

const body = client.outputFiles[0].text
  .replace(/\n+$/, "")
  .split("\n")
  .map((line) => (line.length > 0 ? "\t\t" + line : line))
  .join("\n");

const wrapped =
  `// Generated from src/client.js by node build.mjs; do not edit.\n` +
  `window.__ModuleLoader__.load({\n` +
  `\tid: ${JSON.stringify(pkg.name)},\n` +
  `\tfactory: (require) => {\n` +
  `\t\tvar module = { exports: {} };\n` +
  `\t\tvar exports = module.exports;\n` +
  `\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n` +
  body +
  `\n\t\treturn module.exports;\n` +
  `\t}\n` +
  `});\n`;

await fs.mkdir(path.join(here, "lib"), { recursive: true });
await fs.writeFile(path.join(here, "lib/client.js"), wrapped, "utf8");

console.log("build ok: lib/index.js (esm) + lib/client.js (ModuleLoader wrapped)");
