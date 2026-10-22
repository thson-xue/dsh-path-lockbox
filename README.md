# dsh-path-lockbox

**中文** | [English](README.en.md)

DeepSeek Harness（dsh）插件：把指定的**文件 / 文件夹 / 硬盘分区**对 agent 彻底锁死——
就算会话开了 danger-full-access（完全访问）也动不了。UI 为卡片式，适配宿主主题，
按三类分卡片管理，功能布局对应 Windows「索引选项」的交互模型
（列表 + 添加 / 添加自定义 / 移除 / 立即重扫描 / 重扫描全部 + 每条目「索引子文件夹」「尝试监控变化」）。

MIT。

## 执行语义（三层，缺一不可）

| 层 | 挂载点 | 作用 | 全权模式下是否生效 |
|---|---|---|---|
| ① 单调守卫 | `ctx.tools.guard()` | 只能返回拒绝理由或无操作，**没有 allow 分支**，任何后续监听器都无法放行 | ✅ |
| ② 策略层 | `tools/pre-execute` | 早期 deny，模型拿到结构化的策略拒绝文案（并附"这是部署策略"提示） | ✅（除非其它插件短路 allow，见 ①兜底） |
| ③ 结果过滤 | `tools/post-execute` | grep/glob 结果与 shell stdout/stderr 中含锁定路径的行被剔除，不泄露路径是否存在 | ✅ |

覆盖的工具：`read` / `read_image` / `write` / `edit` / `str_replace_editor` / `grep` / `glob` 的路径参数；
`bash` / `pwsh` 的 workdir 与**命令文本**（剥引号、剥 `ENV=` 前缀、跟随 `cd`、展开 `~`、
git-bash 盘符映射 `/e/x → e:/x`）。其它插件工具用 `extraPathArgs` / `extraCommandArgs` 登记。

## 规则语义

- **文件**：逐个锁定（叶子，无子项设置）。
- **文件夹**：`索引子文件夹(I)` 勾选 = 递归锁整棵树；不勾 = 只拦对目录本层的操作。
- **硬盘**：盘符级（`E:/`），递归 = 整个分区；不勾 = 只拦分区根操作。
- 匹配时同时比较目标路径与所有祖先目录；默认大小写不敏感（`matchCase: false`，
  Windows 文件系统大小写不敏感，敏感比较会静默漏规则）。
- 插件自己的规则存储文件（`$DSH_HOME/path-lockbox.json`）**自动加入锁定**（硬保护），
  agent 和用户规则都改不了它。

## 安装

```sh
dsh plugin --profile <profile> add github:<you>/dsh-path-lockbox
```

`lib/` 构建产物随仓库提交，安装不需要构建脚本授权。锁定版本加 `#<commit>`。

## 配置

部署默认写在本仓库的 `cordis.patch.yml`（`files` / `folders` / `drives` 三个列表）；
用户在页面上的改动写入 `$DSH_HOME/path-lockbox.json`（用户层，整段替换同名列表），
宿主 settings 服务支持 volatile 字段时保存即时生效，不重启。

```yaml
- insert:
    - id: path-lockbox
      name: dsh-path-lockbox
      config:
        files:   [{ path: "D:/合同/报价最终版.xlsx" }]
        folders: [{ path: "D:/客户资料", recursive: true, watch: true }]
        drives:  [{ path: "E:/", recursive: true, watch: false }]
        matchCase: false
        guidance: true
```

## UI

宿主装配 webServer + connection 时自动挂载：

- 插件页（若宿主提供 slot 注入）：**Plugins → path-lockbox** 内嵌卡片页
- 直达地址：`GET /path-lockbox/ui`

卡片功能对应关系：

| 截图元素 | 本插件实现 |
|---|---|
| 文件夹(F) 列表框 | 每类卡片中的条目列表（含子项/监控状态徽标） |
| 添加(A)... | 文件/文件夹/硬盘选择器（盘符 → 目录逐层进入） |
| 添加自定义(U)... | 手输绝对路径或盘符 |
| 移除(R) | 条目行 ✕ 或「移除」按钮 |
| 立即重扫描(U) | 校验存在性 + 递归枚举文件数/字节数（5000 上限）+ 刷新监控 |
| 重扫描全部(N) | 全部条目重扫描 |
| 索引子文件夹(I) | `recursive`（文件条目禁用） |
| 尝试监控变化(M) | `watch`：`fs.watch` 递归监控锁定路径，事件进环形缓冲（200 条） |

另有只读状态工具 `lockbox_status`（模型可见）与 `GET /path-lockbox/api/events`。

## 诚实边界（必读）

1. **命令文本 ≠ 命令语义。** `p=sec; cat $p`、`base64 -d`、`$(...)` 二次求值可以绕过
   静态提取——这是所有 harness 内插件的共同上限，不是本插件的 bug。
2. **不经过工具层的读取**（宿主技能加载、`@文件` 引用、附件）不受影响。
3. 要把"就算完全访问也无法动"做到**内核级**，必须叠 OS 层（Windows）：

```powershell
# 锁目录/分区（deny ACE 优先级最高，管理员进程也会被拒）
icacls "E:\" /deny "$env:USERNAME:(OI)(CI)(F)" /T /C
# 备份原 ACL 以便恢复
icacls "E:\" /save "$env:USERPROFILE\lockbox-e-acl.txt" /T /C
# 解锁
icacls "E:\" /remove:d "$env:USERNAME"
```

   注意：用**标准用户**跑 dsh，否则 agent 可以 `takeown` 改回 ACL。
4. 面向 dsh `0.2.0-rc.2` 契约开发。宿主路由 API（`webServer.route` /
   `connection.requestRejection`）与 slot 注入按 file-shield 同代约定实现了多形态
   兼容探测；如你的 dsh 版本 API 不同，改 `src/index.js` 的 `mountRoute` / `fenced`
   与 `src/client.js` 三处即可，拦截层不依赖它们。

## 开发

```sh
pnpm install
pnpm run build      # esbuild -> lib/index.js + lib/client.js
pnpm test           # node --test（matcher / 提取器纯函数）
```

## 兼容性修复（0.1.3 / 0.1.4）

在 dsh `0.2.1-rc.2` 实测，修复四处会导致「插件装了但完全不工作 / 看不到设置界面」的问题。

### 0.1.3 — 插件激活与宿主路由

1. **`inject` 里的 `connection` 是客户端服务。** Cordis 把 `inject` 数组当**必需服务**
   （`_refresh`：任一缺失 → `epoch = INACTIVE` → `apply` 永不执行），而宿主编排层没有
   `connection`（只有客户端包 `@deepseek-ai/dsh-client-connection`）。插件因此长期停在
   INACTIVE：插件页显示「异常」、`/path-lockbox/ui` 404、`lockbox_status` 不存在。
   现改为 `inject = ["webServer", "tools"]`，并用 `ctx.get("connection")` 懒读
   （`ctx.connection` 属性访问对未声明服务会抛 `cannot get property ... without inject`）。

2. **`cfg()` 读了不存在的 `ctx.config`。** 宿主没有 `config` 服务（只有 `configForms`），
   激活后第一次 `rebuild()` 就抛 `cannot get property "config" without inject`，
   插件随即失败并被销毁。现改为 `apply(ctx, config = {})` 并用实参 `config`，
   这样 profile patch 层里的 `config:` 也会被真正采用。

3. **`mountRoute` 与 dsh 0.2.x 的 webServer 契约不匹配。** 0.2.1 只提供
   `register({ kind: "exact" | "prefix", path, handler })`，handler 是 Node 风格
   `(req, res)`，且同 `(kind, path)` 重复注册会抛错——没有 `route` / `get` / `post`。
   原实现只试这三个方法，且在最后一次尝试返回 `undefined` 时误判成功，于是日志说
   「UI 路由已挂载」而实际 404。现改为：
   - 同一路径的多个方法合并成一条 `register`，在 Node handler 内按 `req.method` 分派；
   - `(req, res)` ↔ Web `Request`/`Response` 双向桥接；
   - 记录 disposer，随插件卸载注销；
   - 旧宿主（无 `register`）仍退回原有探测。

### 0.1.4 — 设置界面（客户端半身）

4. **client 半身用错了 UI 注入 API。** dsh 0.2.x 的 UI 注入是
   `ctx.slots.inject(name, fn)` + `ctx.slots.register({ name, key }, Component)`
   （`slots` 由 `@deepseek-ai/dsh-client-ui-renderer` 提供）；原代码写的是
   `ctx.inject({ slot, id, render })`——那是**服务注入** API（形状应为
   `ctx.inject(["service"], (inner) => …)`），传错形状抛错后被 `try/catch` 静默吞掉，
   所以插件卡片显示正常、详情页却始终没有配置界面。

   现在：

   - `dsh.client.inject` 声明 `@deepseek-ai/dsh-client-ui-renderer` 与
     `@deepseek-ai/dsh-client-ui-plugin-manager`（不声明拿不到 `ctx.slots`）；
   - 注册到 `plugins.detail.section`（list 槽，渲染在插件详情页的配置区），
     用 `subject.pkg.name` 过滤，避免出现在其它插件的详情页；
   - `build.mjs` 的 client 构建加 `external: ["react"]`（react 由宿主客户端运行时提供）；
   - 新增 `tests/client.test.js`：用假 `window.__ModuleLoader__` + 假 `require("react")`
     直接验证注册目标、组件行为与降级路径。

### 0.1.5 — 客户端服务声明（修 0.1.4 的启动崩溃）

5. **客户端插件必须声明服务依赖，否则会拖垮整个 web boot。** 0.1.4 直接读
   `ctx.slots` 却没有声明它，Cordis 的注入守卫会拒绝该属性访问
   （`cannot get property "slots" without inject`），这个 client entry 因此激活失败；
   而宿主把「任一 entry 未激活」当成启动失败：

   ```
   web boot: 1 entry did not activate
   dsh-path-lockbox: failed
   ```

   修法：`export const inject = ["slots"]`（与 `dsh-ops` 的
   `exports.inject = ['slots', 'locale', 'remote']` 同形），并把
   `require("react")`、`ctx.slots` 读取、槽注册**全部包在 try/catch 内** ——
   插件 UI 注册失败时只应退化为"直接访问 `/path-lockbox/ui`"，
   绝不能让整个应用起不来。`tests/client.test.js` 增加 `inject` 断言防回归。

### 0.1.6 — 出现在「设置」页

宿主的 `dsh-settings` 会遍历所有已激活的配置项：只要插件的 `runtime.Config`
带 `toJSON()`，并且 `volatileForm()` 能从里面切出 **volatile** 字段，就自动生成一个
设置项（`dsh-plugin-marketplace` 用的是同一机制：`z.object({...}).volatile()`）。

因此新增：

```js
const PathEntry = z.object({
  path: z.string(),
  label: z.string().default(""),
  recursive: z.boolean().default(true),
  watch: z.boolean().default(false),
});

export const Config = z.object({
  files: z.array(PathEntry).default([]),
  folders: z.array(PathEntry).default([]),
  drives: z.array(PathEntry).default([]),
  matchCase: z.boolean().default(false),
  guidance: z.boolean().default(true),
  extraPathArgs: z.dict(z.array(z.string())).default({}),
  extraCommandArgs: z.dict(z.string()).default({}),
}).volatile();
```

配套改动：

- `@deepseek-ai/schemastery` 加入 dependencies（构建时打包进 `lib/index.js`；
  宿主识别 schema 用的是鸭子类型 `'toJSON' in schema`，不依赖模块实例同一性）；
- **标了 `.volatile()` 之后 `apply(ctx, config)` 收到的 `config` 是可读取引用**，
  必须 `config.get()`，因此新增 `readConfig()` 解包（普通对象仍然直读）；
- 已用宿主同款 cordis 验证：带 schema 激活后 5 条路由照常注册、`/ui` 200。

### 规则优先级（重要）

`effectiveLists()` 的语义是**本地规则文件优先**：

```
$DSH_HOME\path-lockbox.json  （插件自带 UI 写入）
        ↓ 不存在时才回落到
profile config（设置页编辑的就是它）
```

所以设置页与插件自带 UI **同时可用，但后者优先**：一旦用自带 UI 保存过规则，
设置页里的列表就不再生效（清空/删除该 JSON 后会重新以设置为准）。
如果你希望反过来（设置页优先），告诉我，改一行即可。

验证方式（不依赖重启）：用 asar 里抽出的宿主同款 `@deepseek-ai/cordis` 起最小
Context，mock `webServer.register` 捕获路由，再用 Node 风格 `req/res` 实调：
`GET /path-lockbox/ui` → 200（HTML）、`GET /path-lockbox/api/config` → 200（JSON）、
`DELETE /path-lockbox/api/config` → 405 且 `allow: GET, POST`。

