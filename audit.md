# ArtCraft Studio — Repository Audit

**Date:** 2026-10-24
**Repository:** `dev-justin-time/artdesktop` (branch `main`, HEAD `40e9b80 "poc"`)
**Scope:** all tracked files plus the untracked `txt.txt` — Rust workspace, Tauri shell, frontend, CI, tooling, docs.
**Verdict (revised after fixes):** The repository **builds and every CI step passes when run locally**. `cargo metadata`, `cargo build --workspace`, `cargo build --release --workspace`, `cargo test --workspace`, `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `npm ci` and `npm run build` all exit 0. The original blockers — workspace path, corrupted build script, PhotoCraft API mismatch, duplicate UI manifest — plus the CI location, ordering, formatting and lockfile problems are fixed and verified (see §0). Remaining work: frontend error handling and zero tests. The workflow still has to be committed and pushed before GitHub executes it.
**Revision:** A fix pass was applied after the initial audit; §0 records exactly what changed and the new verification evidence.

---

## 0. Fix log (post-audit revision)

The following were fixed in this pass, in severity order. Every verification command was run after the changes.

| Fixed | Change | Verification |
|---|---|---|
| Workspace member | Moved the shell crate from `crates/craft-libs/craft-studio-shell` to `crates/craft-studio-shell` (`git mv`), matching `Cargo.toml:5`, the shell's `../../apps/*` path deps, `Justfile`, CI paths and README. | `cargo metadata --no-deps` → exit 0 |
| Corrupted build script | Restored `build.rs` to `fn main() { tauri_build::build(); }`; deleted dead `src/build.rs`. | included in `cargo check` |
| PhotoCraft rasterizer | `tree.size()` instead of the private field; `resvg::render(&tree, Transform::default(), &mut pixmap.as_mut())` for the pinned 0.42 API; dropped the invalid `.ok_or(...)`. Deleted the dead root `src/lib.rs` duplicate. | `cargo check --workspace` → exit 0 |
| Duplicate UI manifest | Deleted `crates/craft-studio-shell/ui/Cargo.toml`. | Cargo commands now work from `ui/` |
| Missing app icons | Added `crates/craft-studio-shell/icons/` (`icon.ico`, `icon.png`, `32x32.png`, `128x128.png`, `128x128@2x.png`). This was **not visible in the static audit**: the first `cargo check` failed because `tauri-build` requires `icons/icon.ico` on Windows. Placeholder artwork only — replace before release. | `cargo check` → exit 0 |
| CI workflow | Moved `.github/ci.yml` → `.github/workflows/ci.yml`; its `working-directory` and cache paths are now valid after the crate move. | workflow is discoverable by Actions |
| npm lockfile | Generated `package-lock.json` (90 packages) in `ui/`. | `npm ci` → exit 0 |
| Tauri dev/build hooks | `beforeDevCommand`/`beforeBuildCommand` now use `npm --prefix ui run …`, which works from the crate directory. | config reviewed; `npm run build` passes |
| Clippy blockers | Removed the unused `Manager` import; added `impl Default for ModuleRegistry` for `clippy::new_without_default`. | `cargo clippy --workspace --all-targets -- -D warnings` → exit 0 |
| Frontend build | No code changes; installed deps and built to confirm the pipeline step. | `npm ci && npm run build` → exit 0 |
| CI formatting | Ran `cargo fmt --all` across the workspace. | `cargo fmt --all -- --check` → exit 0 |
| CI step order | Moved the frontend build ahead of all Rust compile steps in `.github/workflows/ci.yml` (and mirrored it in the `Justfile`) so `ui/dist` exists for clippy, tests and the release build. | workflow reviewed |
| Release build | No code changes; exercised the final CI step. | `cargo build --release --workspace` → exit 0 (10m28s) |
| Documentation | Rewrote `README.md` to match the proof-of-concept state, corrected the clone URL to `dev-justin-time/artdesktop`, removed the zero-copy/production-grade/updater claims, and replaced the truncated ending. Added the Apache-2.0 `LICENSE` the README already claimed. | README reviewed; link check |
| Placeholder images | Added 14 generated PNGs under `assets/` covering every image the README references; each is labelled "PLACEHOLDER - NOT A SCREENSHOT". | 14/14 refs resolve; images inspected |
| Clipboard refresh | Clipboard writes now go through `SharedState::set_clipboard`, which stores the item, drops the lock and emits `clipboard-updated`. Both the `set_clipboard` command and VectorCraft's `export_svg` use it, so the sidebar refreshes. | `cargo check`/clippy/test/fmt pass; event path code-reviewed |

`Cargo.lock` and the new `icons/` are included in the follow-up commit `aec3764 "update build"`; `ui/package-lock.json` is staged but still uncommitted. `node_modules/` and `dist/` are already ignored.

**CI status:** no CI step fails locally. Remaining: there are still zero tests, `crates/craft-studio-shell/gen/schemas/*` are generated artifacts tracked in git, and the functional/documentation issues in §3–§5 remain. The workflow has not run on GitHub yet because the changes are not pushed.

---

## 1. Severity summary

| # | Severity | Finding | Location | Status |
|---|---|---|---|---|
| 1 | **Blocker** | Workspace member path did not exist; `cargo` failed before compiling anything | `Cargo.toml:5` | ✅ Fixed (crate moved) |
| 2 | **Blocker** | `build.rs` was not valid Rust (Markdown fence + pasted `tauri.conf.json`) | `crates/craft-studio-shell/build.rs:4` | ✅ Fixed |
| 3 | **Blocker** | PhotoCraft used a `resvg`/`usvg` API from a different era than the pinned 0.42 | `apps/photocraft/src/lib.rs:24-26` | ✅ Fixed |
| 4 | **High** | Front-end folder contained a duplicate, invalid Cargo manifest | `crates/craft-studio-shell/ui/Cargo.toml` | ✅ Deleted |
| 5 | **High** | CI workflow was in `.github/ci.yml`; Actions only reads `.github/workflows/*.yml` | `.github/workflows/ci.yml` | ✅ Moved |
| 6 | **High** | `npm ci` / setup-node cache required a `package-lock.json` that did not exist | `crates/craft-studio-shell/ui/` | ✅ Lockfile generated, `npm ci` passes |
| 7 | **High** | "Export SVG" never emits `clipboard-updated`, so the Shared Clipboard sidebar never updates | `apps/vectorcraft/src/lib.rs:17-28` | ✅ Fixed via `SharedState::set_clipboard` |
| 8 | **High** | `just dev` / `just ci` / README Quick Start used a directory that did not exist | `Justfile:7,18`, `README.md:34-42` | ✅ Fixed by crate move |
| 9 | **High** | No `LICENSE` file despite the README licensing the project as Apache-2.0 | repo root | ✅ Apache-2.0 added |
| 10 | **Medium** | Clippy `-D warnings` failed on an unused `Manager` import | `crates/craft-studio-shell/src/main.rs:3` | ✅ Fixed, clippy passes |
| 11 | **Medium** | Frontend swallows every IPC error; the drop zone can hang on "Rasterizing..." | `ui/src/app.ts:72-90` | ❌ Open |
| 12 | **Medium** | README claims (zero-copy, lazy loading, updater, tests, CI) are not implemented | `README.md` | ✅ Rewritten accurately |
| 13 | **Medium** | All 18 images in the README are broken links (no `assets/` directory) | `README.md` | ✅ 14 placeholder PNGs added |
| 14 | **Medium** | Dead, uncompilable duplicate of PhotoCraft at the repo root | `src/lib.rs` | ✅ Deleted |
| 15 | **Medium** | No tests exist anywhere, though CI advertises "Unit Tests" | workspace | ❌ Open |
| 16 | **Low** | Repo hygiene: 177-line scratch file `txt.txt`, unused `tokio` dependency, dead files, CRLF/no-newline inconsistencies | multiple | ◐ Partial (dead files removed) |

---

## 2. Build, tooling and CI findings (fixed)

> **Status:** every finding in this section is fixed and verified — see §0. The text below records the original diagnosis; paths refer to the pre-fix layout unless stated otherwise.

### 2.1 Workspace member pointed at a path that did not exist

`Cargo.toml:5` listed:

```toml
members = [
    "crates/craft-libs",
    "crates/craft-studio-shell",   # actual path was crates/craft-libs/craft-studio-shell
```

Verified before the fix:

```
$ cargo metadata --no-deps --format-version 1
error: failed to load manifest for workspace member `.../crates/craft-studio-shell`
Caused by: failed to read `.../crates/craft-studio-shell/Cargo.toml`
Caused by: The system cannot find the path specified. (os error 3)
```

Consequence: every Cargo command — `cargo build`, `cargo test`, `cargo fmt`, `cargo clippy` — failed at manifest resolution. The same stale path appeared in:

- `Justfile:7` — `cd crates/craft-studio-shell && cargo tauri dev`
- `Justfile:18` — `cd crates/craft-studio-shell/ui && npm ci && npm run build`
- `.github/ci.yml` — `working-directory: crates/craft-studio-shell/ui` and the `cache-dependency-path`
- `README.md:34-42` — `cd crates/craft-studio-shell/ui`

**Resolution:** the shell crate was moved to `crates/craft-studio-shell` (`git mv`), the layout the workspace, Justfile, CI, README and the shell's own `../../apps/*` dependencies already assumed. All references now resolve, and `cargo metadata --no-deps` exits 0.

### 2.2 `build.rs` was not Rust

`crates/craft-libs/craft-studio-shell/build.rs` contained:

```rust
fn main() {
    tauri_build::build();
}
```

followed by a closing Markdown code fence and a full copy of `tauri.conf.json` inside a json fence. Verified by parsing it:

```
$ rustc --edition 2021 --emit=metadata build.rs
error: unknown start of token: `
 --> build.rs:4:1
  | 4 | ```
```

Even after fixing the workspace path, the build script failed to parse, so the shell could not compile. (The correct script existed, duplicated, at `src/build.rs`, which Cargo never ran because only the crate-root `build.rs` is used as a build script.)

**Resolution:** `build.rs` was restored to the 3-line `fn main() { tauri_build::build(); }`, and `src/build.rs` was deleted. `tauri.conf.json` itself was always valid JSON (verified with `node -e 'JSON.parse(...)'`); it had simply been pasted into the wrong file during generation.

### 2.3 PhotoCraft's rasterizer did not compile against `resvg`/`usvg` 0.42

`apps/photocraft/Cargo.toml` pinned `resvg = "0.42"`, `usvg = "0.42"`, `tiny-skia = "0.11"`, but the code was written for a much older API:

```rust
let size = tree.size.to_int_size();                                    // line 24
resvg::render(&tree, usvg::FitTo::Original, pixmap.as_mut())           // line 26
    .ok_or("Render failed")?;
```

Checked against docs.rs:

- In `usvg 0.42`, `Tree::size` is a **method** `pub fn size(&self) -> Size`; the struct's fields are private. `tree.size` is `E0616`.
- `usvg::FitTo` does not exist in 0.42 (`docs.rs/usvg/0.42.0/usvg/struct.FitTo.html` → 404).
- `resvg 0.42` signature is `pub fn render(tree: &Tree, transform: Transform, pixmap: &mut PixmapMut<'_>)` and returns `()`, so both the argument list and `.ok_or(...)` are wrong. The same signature holds in 0.43, 0.44 and 0.45 — `FitTo` was removed long before.

Net result: 4 compile errors in the only non-stub feature in the suite. **Resolution:** the code now targets the pinned version:

```rust
let size = tree.size().to_int_size();
let mut pixmap = tiny_skia::Pixmap::new(size.width(), size.height())
    .ok_or("Pixmap alloc failed")?;
resvg::render(
    &tree,
    tiny_skia::Transform::default(),
    &mut pixmap.as_mut(),
);
let png_bytes = pixmap.encode_png().map_err(|e| e.to_string())?;
```

(the alternative — bumping `resvg`/`usvg` — would require adjusting the imports too). The identical broken duplicate at the old root `src/lib.rs` was deleted. `cargo check --workspace` now exits 0.

### 2.4 Duplicate invalid Cargo manifest inside the frontend (deleted)

`crates/craft-libs/craft-studio-shell/ui/Cargo.toml` was a copy of the shell manifest (including `photocraft = { path = "../../apps/photocraft" }`, which resolved to the wrong directory from `ui/`). It had no target, so any Cargo command run from `ui/` died:

```
$ cd .../craft-studio-shell/ui && cargo metadata
error: failed to parse manifest at .../ui/Cargo.toml
Caused by: no targets specified in the manifest
```

It was not a workspace member, so it never affected the root build, but it was a trap for anyone running `cargo` from the UI folder. **Resolution:** deleted.

### 2.5 CI could never run (mostly fixed)

- The workflow lived at `.github/ci.yml`. GitHub Actions only loads `.github/workflows/*.yml|yaml`; the `.github/workflows/` directory existed but was **empty**, so the "strict pipeline on every PR" advertised in `README.md` never executed. **Fixed:** moved to `.github/workflows/ci.yml`.
- The job would have failed early: `setup-node` pointed at `crates/craft-studio-shell/ui/package-lock.json`, which did not exist, and `npm ci` requires a lockfile. **Fixed:** `package-lock.json` was generated and `npm ci` now exits 0.
- **Fixed:** `cargo fmt --all` was run, so `cargo fmt --check` now passes. `cargo clippy -D warnings` also passes (the unused import and `new_without_default` were fixed), and the workspace resolves.

**CI status:** all five workflow commands — frontend build, `cargo fmt --check`, clippy, tests and release build — pass locally. The workflow still has to be committed and pushed before GitHub can execute it.

---

## 3. Functional defects

### 3.1 The signature workflow was broken in the UI (fixed)

`apps/vectorcraft/src/lib.rs` used to write the clipboard directly:

```rust
let state = app.state::<SharedState>();
let mut clip = state.global_clipboard.write()...;
*clip = Some(ClipboardItem { ... });
```

Only the Tauri command `set_clipboard` (`src/main.rs:26-31`) emitted `clipboard-updated`, and the frontend never called that command. Clicking **Export SVG** therefore changed backend state while the left "Shared Clipboard" panel stayed on "Empty". The drag-drop rasterize path still worked because it calls `get_clipboard`, but the advertised "Vector → Photo" demo looked broken.

**Resolution:** writes are centralized in `SharedState::set_clipboard`, which stores the item, releases the lock and emits `clipboard-updated`. `VectorCraftModule::export_svg` and the `set_clipboard` command both call it, so no module can forget the notification.

### 3.2 Frontend error handling

`ui/src/app.ts:72-90`: the drop handler has no `try/catch`, no `dragenter` guard, and no `else` branch. If the clipboard is not an SVG, or `rasterize_svg` returns `Err`, the zone is left permanently on "Rasterizing..." and the promise rejection is unhandled. The `<img>` success branch also never revokes/limits payload size.

### 3.3 Untrusted SVG injected via `innerHTML`

`ui/src/app.ts:109-110` decodes a base64 payload with `atob()` and interpolates the raw SVG string into `innerHTML`. `tauri.conf.json` sets `"csp": null` (CSP disabled). Any future module that writes a clipboard item controls executable markup in the shell context. Use an `<img src="data:image/svg+xml;base64,...">` preview (no script execution) or sanitize, and set a real CSP.

Also note `atob()` only handles Latin-1: non-ASCII SVG text will corrupt. Use a UTF-8 decode (`TextDecoder`) or `Blob`/`URL.createObjectURL`.

### 3.4 Desktop run path (hooks fixed; CLI still undeclared)

- **Fixed:** `tauri.conf.json` now uses `npm --prefix ui run dev` / `npm --prefix ui run build`. Tauri runs these hooks in the crate directory, which has no `package.json`, so the previous bare `npm run` would have failed.
- **Fixed by the crate move:** `Justfile:7` `cd crates/craft-studio-shell` now resolves, as do the `ui/` paths in the README and CI.
- **Open:** `cargo tauri` requires the Tauri CLI, which is neither declared in the README prerequisites nor pinned in the repo. Add it to the docs (`cargo install tauri-cli --version "^2"`) or a `cargo-binstall`/npm devDependency.

### 3.5 Silent-success stubs

Eight of the ten modules return `Ok(json!({"status":"success","action": action}))` for every action (`filmcraft`, `wordcraft`, `deckcraft`, `designcraft`, `effectcraft`, `lightcraft`, `gridcraft`, `pdfcraft`), and `vectorcraft`/`photocraft` do the same for any action they do not recognise. The frontend shows no difference between "rendered a video" and "did nothing". At minimum, unknown actions should return `Err(format!("Unsupported action: {action}"))` so the UI can surface a real error instead of a fake success.

### 3.6 Metadata/config gaps for packaging

- No `bundle`/`icons` configuration and no `icons/` directory; `tauri build` installer generation will fail or fall back to a default, and Windows will use a generic icon.
- No `capabilities/` directory. App commands work today, but any plugin added later will be denied by default, and there is no audited permission surface.
- `main.rs` lacks the usual `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, so release binaries on Windows open a console window.

---

## 4. Documentation and repository drift

> **Status:** the documentation findings below are fixed — the README was rewritten, `LICENSE` added and placeholder images generated (see §0). The table records the original claims for reference.

`README.md` was the most misleading file in the repo. Specific claims vs. reality:

| README claim | Reality |
|---|---|
| "zero-latency shared memory", "zero-copy asset transfer" (`README.md:5,53`) | `ClipboardItem.payload` is a Base64 `String` copied through a `std::sync::RwLock` and serialized over IPC. It is neither shared memory nor zero-copy. Base64 adds ~33% and forces decode/re-encode at each hop. |
| "dynamic GUI generation" | `ui/src/app.ts` hardcodes ten `if/else` HTML template strings; the only dynamic part is the toolbar from `capabilities()`. |
| "module lazy-loading", "modular updates / updater" | No lazy loading, no updater plugin, no versioning, no signature verification. Modules are statically linked and registered at startup. |
| "cargo test (Unit Tests)" | Zero tests in the workspace; `cargo test` would report `running 0 tests`. |
| "strict GitHub Actions pipeline on every PR" | Workflow is not in `.github/workflows/` (see 2.5). |
| "starts with `git clone https://github.com/storytold/artcraft-studio.git`" (`README.md:26`) | The actual remote is `https://github.com/dev-justin-time/artdesktop.git` (confirmed with `git remote -v`). |
| "production-grade", "10-App Workspace Compilation" | No app is implemented beyond placeholder responses; the one real pipeline does not compile. |
| Images: hero banner + 17 screenshots (`README.md:47-74`) | `assets/` does not exist at all. Every image on the GitHub page is a broken link. |
| "10 specialized creative applications" vs. "A Suite, Not Eight Apps" / "Eight modules, one process" / screenshot tables covering only eight (`README.md:5,44,53-73`) | GridCraft and PDFCraft are missing from the screenshot section; the copy contradicts itself repeatedly. |
| "Apache-2.0" (`README.md:79`) | No `LICENSE` file exists (see §1 #9). |
| Final section ends mid-sentence: "…switching to PhotoCraft, and dropping " (`README.md:86`) | Document is truncated. |

`txt.txt` (177 lines, untracked) is not project content: it is a paste of a previous AI review plus 36 Midjourney/DALL·E prompt drafts, including instructions to change the clone URL and stray artifacts ("Copy", "A"). It duplicates and contradicts the README and should not be committed; delete it or move the image-prompt brief to `docs/design/prompts.md` and the actionable feedback into issues.

Version/format inconsistencies: `README.md` still says "10 tabs" in its final checklist but shows eight-module art; the table of apps is correct (10). CRLF line endings are mixed across `.toml`/`.rs` files, and `apps/lightcraft/Cargo.toml`, `apps/photocraft/Cargo.toml`, `apps/vectorcraft/Cargo.toml` lack trailing newlines.

---

## 5. Hygiene and low-severity items

- **Root `src/lib.rs` (fixed).** The dead duplicate of `apps/photocraft/src/lib.rs` has been deleted.
- **`src/build.rs` (fixed).** The dead duplicate build script has been deleted.
- **Unused `Manager` import (fixed).** Removed from `src/main.rs:3`, so `cargo clippy -- -D warnings` now passes.
- **Unused `tokio` dependency (open).** Declared in `[workspace.dependencies]` and `crates/craft-libs/Cargo.toml` with `features = ["full"]`. Nothing in the workspace references `tokio`; removing it will noticeably shrink build time.
- **Lockfiles (partially fixed).** `Cargo.lock` and `ui/package-lock.json` now exist but are untracked; commit both for reproducible builds.
- **`.github/workflows` (fixed).** Now contains `ci.yml`.
- **`ui/Cargo.toml` duplicate (fixed).** Deleted.
- **Placeholder icons (new).** `crates/craft-studio-shell/icons/` currently holds generated placeholder artwork; replace it before a release build.
- **Generated Tauri schemas are tracked.** `crates/craft-studio-shell/gen/schemas/*.json` (four files, ~4.6k lines) were produced by `tauri-build` and committed. Add `gen/schemas` to `.gitignore` and remove them from the index.
- **Tauri config has no `$schema`** and no `bundle` section; harmless for `cargo build`, but it disables editor validation and leaves packaging unconfigured.
- **Blocking `std::sync::RwLock` inside an `async` Tauri command** (`set_clipboard`). Fine at current scale, but it will block the async runtime under contention; consider `parking_lot` or an actor/channel.
- **`get_clipboard` returns `Option<ClipboardItem>`** while `app.ts:80` types the result as `ClipboardItem` (non-null). Works only because of the defensive `if (clip && ...)`; type it `ClipboardItem | null`.
- **No `CONTRIBUTING.md`**, no module-authoring documentation despite the extensibility being the project's main selling point.
- **`.freebuff/project-id`** is local tool metadata and is untracked; ensure it stays out of the repo.

---

## 6. What is genuinely good

- The `CraftModule` trait + `ModuleRegistry` + `SharedState` split (`crates/craft-libs/src/lib.rs`) is a clean, idiomatic seam: object-safe, `Send + Sync`, no per-module coupling.
- The Tauri command surface (`invoke_module_action`, `get_module_capabilities`, clipboard get/set) is small and consistent with the frontend's usage.
- The frontend is compact and readable for a PoC; Tailwind + Vite + strict `tsconfig` is a sane baseline, and the capability-driven toolbar is the right idea.
- Workspace dependency inheritance (`[workspace.dependencies]`) is set up correctly, and per-app manifests are minimal.
- The `Justfile` mirrors the CI steps (including the frontend-before-Rust ordering), and every step now passes.

---

## 7. Verification performed / not performed

**Original audit (before fixes):**

- `git ls-files`, `git status`, `git log`, `git remote -v` — 43 tracked files, one commit `40e9b80`.
- Read all Rust sources, manifests, build files, Tauri config, frontend sources/configs, CI, Justfile, README, `txt.txt`.
- `cargo metadata --no-deps` → exit 101, missing workspace member (2.1).
- `cargo metadata --no-deps` from `ui/` → exit 101, no targets (2.4).
- `rustc --emit=metadata build.rs` → parse errors (2.2).
- Cross-checked `resvg` 0.42/0.43/0.44/0.45 and `usvg` 0.42 API on docs.rs for the rasterizer claims (2.3).

**After the fix pass (all commands run in the repo):**

- `cargo metadata --no-deps` → exit 0, all 12 packages resolved.
- `cargo build --workspace` → exit 0 (6m47s), producing `target/debug/craft-studio-shell.exe` (19.8 MB) with zero warnings.
- `cargo check --workspace` → exit 0. (The first attempt failed in `tauri-build`: `icons/icon.ico` not found; adding the icon set fixed it.)
- `cargo clippy --workspace --all-targets -- -D warnings` → exit 0.
- `npm ci` in `crates/craft-studio-shell/ui` → exit 0 (90 packages).
- `npm run build` (`tsc && vite build`) → exit 0, 8 modules transformed.
- `cargo fmt --all -- --check` → exit 0 after running `cargo fmt --all`.
- `cargo clippy --workspace --all-targets -- -D warnings` → exit 0 (re-run after formatting).
- `cargo test --workspace` → exit 0 (0 tests exist).
- After the clipboard fix: `cargo check`, `cargo clippy -D warnings`, `cargo test` and `cargo fmt --check` all exit 0.
- `cargo build --release --workspace` → exit 0 (10m28s), producing a stripped 11.7 MB `craft-studio-shell.exe`.
- Documentation: all 14 `assets/*.png` references resolve to generated files; `LICENSE` is the 11,357-byte Apache-2.0 text; no `storytold` clone URL or production/zero-copy claims remain in the README.

**Not performed:** `tauri build` bundling/installers, a real interaction test of the desktop window (the clipboard fix is compile-verified and the event path reviewed, but not exercised in a running webview), and execution of the workflow on GitHub — the changes have not been committed or pushed.

---

## 8. Recommended fix order

Items 1–5 of the original list are done. Remaining, in order:

1. Add error handling to the PhotoCraft drop zone (§3.2) so failed rasterizations recover instead of hanging on "Rasterizing...".
2. Commit `ui/package-lock.json` and push the branch so GitHub Actions runs for the first time; remove `crates/craft-studio-shell/gen/schemas` from the index and ignore it.
3. Remove `txt.txt` and the unused `tokio` dependency; add tests for the rasterize path and clipboard behavior.
4. Replace the placeholder image and icon artwork with real captures/icons before a release build.
