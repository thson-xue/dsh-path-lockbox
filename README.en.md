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
