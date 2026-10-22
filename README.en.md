# dsh-path-lockbox

[中文说明](README.md) | **English**

A DeepSeek Harness (dsh) plugin that locks specified **files / folders / drive roots** against the agent completely — even in a `danger-full-access` (full access) session, nothing can touch them. The UI is card-based, follows the host theme, and is organized into three category cards. The interaction model mirrors the Windows "Indexing Options" dialog: a list plus *Add… / Add custom… / Remove / Rescan selected / Rescan all*, and per-entry checkboxes *"Index subfolders"* and *"Monitor changes"*.

MIT licensed.

## Enforcement semantics (three layers; all required)

| Layer | Hook | What it does | Effective under full access? |
|---|---|---|---|
| ① Monotonic guard | `ctx.tools.guard()` | May only return a denial reason or no-op — there is **no allow branch**, so no later listener can ever overrule it | ✅ |
| ② Policy layer | `tools/pre-execute` | Early deny; the model receives a structured policy-refusal message (with a "this is deployment policy" hint) | ✅ (unless another plugin short-circuits allow — ① backstops that) |
| ③ Result filtering | `tools/post-execute` | Lines in grep/glob results and shell stdout/stderr that contain a locked path are stripped; existence of the path is not leaked | ✅ |

Covered tools: path parameters of `read` / `read_image` / `write` / `edit` / `str_replace_editor` / `grep` / `glob`; the workdir and **command text** of `bash` / `pwsh` (unquoting, stripping `ENV=` prefixes, following `cd`, expanding `~`, and git-bash drive mapping `/e/x → e:/x`). Other plugin tools can be registered via `extraPathArgs` / `extraCommandArgs`.

## Rule semantics

- **Files**: locked one by one (leaf entries; no sub-item options).
- **Folders**: with *Index subfolders (I)* checked, the whole tree is locked recursively; unchecked, only operations on the directory itself are intercepted.
- **Drives**: at drive-letter granularity (e.g. `E:/`); recursive = the entire partition; unchecked = only the partition root.
- Matching compares the target path **and all ancestor directories**; case-insensitive by default (`matchCase: false`) — Windows filesystems are case-insensitive, and a case-sensitive matcher silently misses rules.
- The plugin's own rule store (`$DSH_HOME/path-lockbox.json`) is **automatically hard-locked**: neither the agent nor user rules can modify it.

## Installation

```sh
dsh plugin --profile <profile> add github:thson-xue/dsh-path-lockbox
```

Built artifacts are committed under `lib/`, so installation does not need build-script approval. Pin a version with `#<commit>`.

## Configuration

Deployment defaults live in this repo's `cordis.patch.yml` (three lists: `files` / `folders` / `drives`); user edits made in the UI are written to `$DSH_HOME/path-lockbox.json` (user layer, replacing the list with the same name wholesale). If the host settings service supports volatile fields, saving takes effect immediately — no restart.

```yaml
- insert:
    - id: path-lockbox
      name: dsh-path-lockbox
      config:
        files:   [{ path: "D:/contracts/quote-final.xlsx" }]
        folders: [{ path: "D:/client-data", recursive: true, watch: true }]
        drives:  [{ path: "E:/", recursive: true, watch: false }]
        matchCase: false
        guidance: true
```

## UI

The page itself is served by the host route `GET /path-lockbox/ui`; three entry points share it:

| Entry | Location | Notes |
|---|---|---|
| **Settings → 文件锁** (recommended) | Settings left navigation | the client half registers `settings.section` with a Chinese `label` |
| Plugin detail page | Plugins → `dsh-path-lockbox` | the `plugins.detail.section` slot; renders only on this plugin's page |
| Direct URL | `GET /path-lockbox/ui` | needs no slot at all; also the fallback for the other two |

`Config` is **deliberately not marked `.volatile()`**: otherwise `dsh-settings` would also
generate an auto form titled with the namespace id (`path-lockbox`), duplicating the
"文件锁" section. See 0.1.8 below.

When picking a path: **folders and drives** use the OS native directory dialog (the host's
`ctx.directoryPicker` `native` capability — `IFileOpenDialog` + `FOS_PICKFOLDERS` on
Windows) and fall back to the in-page browser when that capability is missing or fails.
**Files** can only use the in-page browser: the native capability is a directory chooser.

UI element mapping:

| Source (Windows Indexing Options) | This plugin |
|---|---|
| Folder (F) list box | Entry list in each category card (with sub-item / watch status badges) |
| Add (A)… | File / folder / drive picker (drive letters → drill into directories) |
| Add custom (U)… | Enter an absolute path or drive letter manually |
| Remove (R) | Per-row ✕ or Remove button |
| Rescan now (U) | Existence check + recursive file count/bytes enumeration (5000 cap) + watcher refresh |
| Rescan all (N) | Rescans every entry |
| Index subfolders (I) | `recursive` (disabled for file entries) |
| Monitor changes (M) | `watch`: recursive `fs.watch` on locked paths, events into a 200-entry ring buffer |

Also included: a read-only status tool `lockbox_status` (visible to the model) and `GET /path-lockbox/api/events`.

## Honest limitations (read this first)

1. **Command text ≠ command semantics.** `p=sec; cat $p`, `base64 -d`, and `$(...)` second-pass evaluation can bypass static extraction — this is the shared ceiling of every in-harness plugin, not a bug specific to this one.
2. **Reads that do not go through the tool layer** (host skill loading, `@file` references, attachments) are not affected.
3. To get *kernel-level* "can't touch it even under full access", you must add an OS layer (Windows):

```powershell
# Lock a directory/partition (deny ACEs take highest precedence; even admin processes get denied)
icacls "E:\" /deny "$env:USERNAME:(OI)(CI)(F)" /T /C
# Back up the original ACL for restoration
icacls "E:\" /save "$env:USERPROFILE\lockbox-e-acl.txt" /T /C
# Unlock
icacls "E:\" /remove:d "$env:USERNAME"
```

   Note: run dsh as a **standard user**; otherwise the agent can `takeown` and rewrite the ACL.
4. Developed against the dsh `0.2.0-rc.2` contract. Host routing APIs (`webServer.route` / `connection.requestRejection`) and slot injection use multi-shape compatibility probing following the same-generation conventions as dsh-file-shield; if your dsh version differs, adjust three places — `mountRoute` / `fenced` in `src/index.js` and `src/client.js`. The interception layers do not depend on them.

## Development

```sh
pnpm install
pnpm run build      # esbuild -> lib/index.js + lib/client.js
pnpm test           # node --test (matcher / extractor pure functions)
```

## Compatibility fixes and the Settings entry (0.1.3 → 0.1.8)

Verified on dsh `0.2.1-rc.2`. The issues below once made the plugin install but do
nothing, hide its UI, or take the whole shell down with it.

### 0.1.3 — activation and host routes

1. **`connection` in `inject` is a client-side service.** Cordis treats every `inject`
   entry as *required* (`_refresh`: a single missing service sets `epoch = INACTIVE`,
   so `apply` never runs), while the host does not provide `connection` (only the client
   package `@deepseek-ai/dsh-client-connection` does). The plugin therefore stayed
   INACTIVE: the plugin page showed an error, `/path-lockbox/ui` returned 404, and
   `lockbox_status` did not exist. Now `inject = ["webServer", "tools"]` and `connection`
   is read lazily via `ctx.get("connection")` (property access on an undeclared service
   throws `cannot get property ... without inject`).

2. **`cfg()` read a nonexistent `ctx.config`.** The host has no `config` service (only
   `configForms`), so the first `rebuild()` after activation threw and the plugin was
   torn down. Now `apply(ctx, config = {})` uses the real argument, which also makes the
   profile patch layer's `config:` effective.

3. **`mountRoute` did not match the dsh 0.2.x webServer contract.** 0.2.1 only exposes
   `register({ kind: "exact" | "prefix", path, handler })` with a Node-style
   `(req, res)` handler, and a duplicate `(kind, path)` throws — there is no
   `route` / `get` / `post`. The old code tried only those, and treated the final
   `undefined` return as success, so it logged "routes mounted" while `/ui` stayed 404.
   It now merges per-path methods into one `register`, dispatches on `req.method`,
   bridges `(req, res)` with Web `Request`/`Response`, and tracks disposers. Hosts
   without `register` still fall back to the old probing.

### 0.1.4 — the settings UI (client half)

4. **The client half used the wrong UI-injection API.** In dsh 0.2.x UI slots are
   registered with `ctx.slots.inject(name, fn)` + `ctx.slots.register({ name, key }, Component)`
   (`slots` is provided by `@deepseek-ai/dsh-client-ui-renderer`). The old code called
   `ctx.inject({ slot, id, render })`, which is the *service* injection API (the shape is
   `ctx.inject(["service"], (inner) => …)`); it threw and the surrounding `try/catch`
   swallowed it, so the plugin card rendered normally while its detail page never showed
   any configuration UI.

   Now: `dsh.client.inject` declares `@deepseek-ai/dsh-client-ui-renderer` and
   `@deepseek-ai/dsh-client-ui-plugin-manager` (without them `ctx.slots` is unavailable);
   the panel registers into `plugins.detail.section` (a list slot rendered in the plugin
   detail page's config area) and filters on `subject.pkg.name` so it only appears on this
   plugin's page; `build.mjs` marks `react` external for the client build; and the new
   `tests/client.test.js` drives the bundle through a fake `window.__ModuleLoader__` and a
   fake `require("react")` to assert the slot target, component behaviour and fallback.

### 0.1.5 — declare the slots service (fixes a boot crash)

5. **A client plugin must declare its service dependencies.** 0.1.4 read `ctx.slots`
   without declaring it, so Cordis's inject guard rejected the property access
   (`cannot get property "slots" without inject`); that entry failed to activate and the
   host treats any unactivated entry as a boot failure
   (`web boot: 1 entry did not activate / dsh-path-lockbox: failed`).

   Fix: `export const inject = ["slots"]` (same shape as dsh-ops' `['slots', 'locale',
   'remote']`), and keep `require("react")`, the `ctx.slots` read and the slot
   registration inside `try/catch` — a UI registration failure may degrade to the plain
   `/path-lockbox/ui` URL but must never take the shell down.

### 0.1.6 — auto-generated settings entry (superseded by 0.1.7)

`dsh-settings` walks every active profile entry: when `runtime.Config` has `toJSON()` and
`volatileForm()` can slice volatile fields out of it, it generates a settings entry
(`dsh-plugin-marketplace` uses the same mechanism: `z.object({...}).volatile()`).

So a `Config` schema was added (`files` / `folders` / `drives` / `matchCase` / `guidance` /
`extraPathArgs` / `extraCommandArgs`) plus a dependency on `@deepseek-ai/schemastery`
(bundled by esbuild; the host detects schemas by duck typing, so bundling is safe).
Downside: the title is the namespace id and the form is generic.

### 0.1.7 — a "文件锁" section (settings.section)

The Settings navigation is built from the `settings.section` slot, whose entries carry
`id` / `order` / `label`:

```js
ctx.slots.inject("settings.section", () =>
  ctx.slots.register(
    { name: "settings.section", id: "path-lockbox", order: 50, label: () => "文件锁" },
    PathLockboxSection, // embeds /path-lockbox/ui
  ),
);
```

`label` is a function re-evaluated on every render, so the entry reads 文件锁. The section
body is the plugin's own UI. `dsh.client.inject` also declares
`@deepseek-ai/dsh-client-ui-settings` (it declares that slot).

### 0.1.8 — keep only one entry

The 0.1.6 auto form and the 0.1.7 section showed up side by side, so `.volatile()` was
removed from `Config`:

```diff
- export const Config = z.object({ ... }).volatile();
+ export const Config = z.object({ ... });
```

`volatileForm()` only accepts volatile fields, so the auto form disappears; the schema
still validates and supplies defaults. `readConfig()` keeps unwrapping a volatile
reference in case it returns, and `tests/host.test.js` asserts the schema stays
deliberately non-volatile so the duplicate entry cannot come back unnoticed.

### Where rules come from

```
$DSH_HOME\path-lockbox.json   <- the only writable source: saved by the plugin's own UI
        ↓ fallback when that file does not exist
profile config                <- defaults only (cordis.patch.yml's config:)
```

Editing therefore happens only in the plugin UI; Settings is no longer an editor
(`Config` is non-volatile). Re-adding `.volatile()` would restore the auto form.

## Version history

| Version | Content |
|---|---|
| 0.1.2 | initial release (installs on dsh 0.2.x but does nothing) |
| 0.1.3 | host activation (`inject`), `cfg()` from `apply(config)`, `webServer.register` route adapter |
| 0.1.4 | client half uses `ctx.slots`; `dsh.client.inject`; react external |
| 0.1.5 | `inject = ["slots"]`; UI registration failures degrade instead of breaking boot |
| 0.1.6 | `Config` schema + `.volatile()` → auto settings entry |
| 0.1.7 | `settings.section` → a 文件锁 section embedding the plugin UI |
| 0.1.8 | drop `.volatile()` → only the 文件锁 entry remains |
| 0.1.9 | folders/drives use the OS native directory dialog (`ctx.directoryPicker`), falling back to the in-page browser |
| 0.1.10 | package icon is a lock (`assets/lock.svg` via the root `icon` field); the Settings nav glyph is host-fixed |
| 0.1.11 | card titles renamed with inline hints: 锁定文件 / 锁定文件夹 / 锁定分区 |
| 0.1.12 | button copy: “添加…” → “+”, “添加自定义” → “选择路径…”, with the dialog title and empty-state text aligned |
| 0.1.13 | picker dialog titles follow the card names: 选择要锁定的文件 / 文件夹 / 分区 |

Current tests: `node --test` **27/27** (matcher / extractor / host / client).


