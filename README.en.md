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

Mounted automatically when the host assembles webServer + connection:

- Plugin page (if the host supports slot injection): embedded card page under **Plugins → path-lockbox**
- Direct URL: `GET /path-lockbox/ui`

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

## Compatibility fixes (0.1.3 / 0.1.4)

Verified on dsh `0.2.1-rc.2`. Four bugs made the plugin install but never work (or never
show its settings UI).

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

