// esbuild 构建宿主面与 client 面（lib/ 产物建议随仓库提交，安装时零构建脚本）。
import { createRequire } from "node:module";
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

await esbuild.build({
  ...common,
  entryPoints: [path.join(here, "src/index.js")],
  platform: "node",
  format: "esm",
  outfile: path.join(here, "lib/index.js"),
});

await esbuild.build({
  ...common,
  entryPoints: [path.join(here, "src/client.js")],
  platform: "browser",
  format: "esm",
  outfile: path.join(here, "lib/client.js"),
});

console.log("build ok: lib/index.js + lib/client.js");
