# ArtCraft Studio — Repository Audit

**Date:** 2026-10-24
**Repository:** `dev-justin-time/artdesktop` (branch `main`, HEAD `40e9b80 "poc"`)
**Scope:** all tracked files plus the untracked `txt.txt` — Rust workspace, Tauri shell, frontend, CI, tooling, docs.
**Verdict:** The architecture is sound on paper, but **the repository cannot currently be built, tested, or run**. The Cargo workspace points at a non-existent member, the shell's `build.rs` is a corrupted paste of Markdown/JSON, the one real feature does not compile against its pinned dependency versions, and CI is filed where GitHub never reads it.

---

## 1. Severity summary

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **Blocker** | Workspace member path does not exist; `cargo` fails before compiling anything | `Cargo.toml:5` |
| 2 | **Blocker** | `build.rs` is not valid Rust (Markdown fence + pasted `tauri.conf.json`) | `crates/craft-libs/craft-studio-shell/build.rs:4` |
| 3 | **Blocker** | PhotoCraft uses a `resvg`/`usvg` API from a different major era than the pinned 0.42 | `apps/photocraft/src/lib.rs:24-26` |
| 4 | **High** | Front-end folder contains a duplicate, invalid Cargo manifest | `crates/craft-libs/craft-studio-shell/ui/Cargo.toml` |
| 5 | **High** | CI workflow is in `.github/ci.yml`; Actions only reads `.github/workflows/*.yml` | `.github/ci.yml` |
| 6 | **High** | `npm ci` / setup-node cache require a `package-lock.json` that does not exist | `.github/ci.yml`, `Justfile:18` |
| 7 | **High** | "Export SVG" never emits `clipboard-updated`, so the Shared Clipboard sidebar never updates | `apps/vectorcraft/src/lib.rs:17-28` |
| 8 | **High** | `just dev` / `just ci` / README Quick Start use a directory that does not exist | `Justfile:7,18`, `README.md:26-42` |
| 9 | **High** | No `LICENSE` file despite the README licensing the project as Apache-2.0 | repo root |
| 10 | **Medium** | Clippy `-D warnings` will fail on an unused `Manager` import | `crates/craft-libs/craft-studio-shell/src/main.rs:3` |
| 11 | **Medium** | Frontend swallows every IPC error; the drop zone can hang on "Rasterizing..." | `ui/src/app.ts:76-92` |
| 12 | **Medium** | README claims (zero-copy, lazy loading, updater, tests, CI) are not implemented | `README.md` |
| 13 | **Medium** | All 18 images in the README are broken links (no `assets/` directory) | `README.md:47-74` |
| 14 | **Medium** | Dead, uncompilable duplicate of PhotoCraft at the repo root | `src/lib.rs` |
| 15 | **Medium** | No tests exist anywhere, though CI advertises "Unit Tests" | workspace |
| 16 | **Low** | Repo hygiene: 177-line scratch file `txt.txt`, unused `tokio` dependency, dead `src/build.rs`, CRLF/no-newline inconsistencies | multiple |

---

## 2. Broken build, tooling and CI (fix first)

### 2.1 Workspace member points at a path that does not exist

`Cargo.toml:5`:

```toml
members = [
    "crates/craft-libs",
    "crates/craft-studio-shell",   # <-- actual path is crates/craft-libs/craft-studio-shell
```

Verified:

```
$ cargo metadata --no-deps --format-version 1
error: failed to load manifest for workspace member `.../crates/craft-studio-shell`
Caused by: failed to read `.../crates/craft-studio-shell/Cargo.toml`
Caused by: The system cannot find the path specified. (os error 3)
```

Consequence: every Cargo command — `cargo build`, `cargo test`, `cargo fmt`, `cargo clippy` — fails at manifest resolution. The same stale path appears in:

- `Justfile:7` — `cd crates/craft-studio-shell && cargo tauri dev`
- `Justfile:18` — `cd crates/craft-studio-shell/ui && npm ci && npm run build`
- `.github/ci.yml` — `working-directory: crates/craft-studio-shell/ui` and the `cache-dependency-path`
- `README.md:34-42` — `cd crates/craft-studio-shell/ui`

Fix: either change the member and every path to `crates/craft-libs/craft-studio-shell`, or (cleaner) move the shell crate to `crates/craft-studio-shell` and keep `craft-libs` flat. Pick one layout and update all five references.

### 2.2 `build.rs` is not Rust

`crates/craft-libs/craft-studio-shell/build.rs` contains:

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

Even after fixing the workspace path, the build script fails to parse, so the shell cannot compile. (The correct script already exists, duplicated, at `src/build.rs`, which Cargo never runs because only the crate-root `build.rs` is used as a build script.)

Fix: restore `build.rs` to the 3-line `fn main() { tauri_build::build(); }` and delete `src/build.rs`. `tauri.conf.json` itself is valid JSON (verified with `node -e 'JSON.parse(...)'`); it was simply pasted into the wrong file during generation.

### 2.3 PhotoCraft's rasterizer does not compile against `resvg`/`usvg` 0.42

`apps/photocraft/Cargo.toml` pins `resvg = "0.42"`, `usvg = "0.42"`, `tiny-skia = "0.11"`, but the code is written for a much older API:

```rust
let size = tree.size.to_int_size();                                    // line 24
resvg::render(&tree, usvg::FitTo::Original, pixmap.as_mut())           // line 26
    .ok_or("Render failed")?;
```

Checked against docs.rs:

- In `usvg 0.42`, `Tree::size` is a **method** `pub fn size(&self) -> Size`; the struct's fields are private. `tree.size` is `E0616`.
- `usvg::FitTo` does not exist in 0.42 (`docs.rs/usvg/0.42.0/usvg/struct.FitTo.html` → 404).
- `resvg 0.42` signature is `pub fn render(tree: &Tree, transform: Transform, pixmap: &mut PixmapMut<'_>)` and returns `()`, so both the argument list and `.ok_or(...)` are wrong. The same signature holds in 0.43, 0.44 and 0.45 — `FitTo` was removed long before.

Net result: 4 compile errors in the only non-stub feature in the suite. Fix by targeting the pinned version:

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

(or bump `resvg`/`usvg` and use their current API — but then adjust the imports too). The identical broken block is duplicated at `src/lib.rs:24-26`.

### 2.4 Duplicate invalid Cargo manifest inside the frontend

`crates/craft-libs/craft-studio-shell/ui/Cargo.toml` is a byte-for-byte style copy of the shell manifest (including `photocraft = { path = "../../apps/photocraft" }`, which resolves to the wrong directory from `ui/`). It has no target, so any Cargo command run from `ui/` dies:

```
$ cd .../craft-studio-shell/ui && cargo metadata
error: failed to parse manifest at .../ui/Cargo.toml
Caused by: no targets specified in the manifest
```

It is not a workspace member, so it does not break the root build today, but it is a trap for anyone running `cargo` from the UI folder and it is guaranteed to rot. Delete it.

### 2.5 CI can never run

- The workflow lives at `.github/ci.yml`. GitHub Actions only loads `.github/workflows/*.yml|yaml`; the `.github/workflows/` directory exists but is **empty**. The badge-worthy "strict pipeline on every PR" advertised in `README.md` has never executed.
- Even after moving it, the job fails early: `setup-node` is configured with `cache-dependency-path: crates/craft-studio-shell/ui/package-lock.json` (wrong path *and* no lockfile committed), and `npm ci` requires a lockfile. There is no `package-lock.json` anywhere.
- `cargo fmt --check` will fail on the current formatting (every module is written with single-line `fn` bodies that rustfmt expands), `cargo clippy -D warnings` will fail on the unused import below, and the workspace cannot resolve (2.1).

Fix: move to `.github/workflows/ci.yml`, correct the paths, run `npm install` once and commit `package-lock.json`, then run `just ci` for real until green.

---

## 3. Functional defects

### 3.1 The signature workflow is broken in the UI

`apps/vectorcraft/src/lib.rs` writes the clipboard directly:

```rust
let state = app.state::<SharedState>();
let mut clip = state.global_clipboard.write()...;
*clip = Some(ClipboardItem { ... });
```

Only the Tauri command `set_clipboard` (`src/main.rs:26-31`) emits `clipboard-updated`, and the frontend never calls that command. Therefore clicking **Export SVG** changes backend state but the left "Shared Clipboard" panel stays on "Empty" until something else emits. The drag-drop rasterize path still works because it calls `get_clipboard`, but the advertised "Vector → Photo" demo looks broken.

Fix: emit `clipboard-updated` from `VectorCraftModule::handle_action` (it already has `&AppHandle`), preferably by moving the write+emit into one `SharedState` helper so no module can forget.

### 3.2 Frontend error handling

`ui/src/app.ts:72-90`: the drop handler has no `try/catch`, no `dragenter` guard, and no `else` branch. If the clipboard is not an SVG, or `rasterize_svg` returns `Err`, the zone is left permanently on "Rasterizing..." and the promise rejection is unhandled. The `<img>` success branch also never revokes/limits payload size.

### 3.3 Untrusted SVG injected via `innerHTML`

`ui/src/app.ts:109-110` decodes a base64 payload with `atob()` and interpolates the raw SVG string into `innerHTML`. `tauri.conf.json` sets `"csp": null` (CSP disabled). Any future module that writes a clipboard item controls executable markup in the shell context. Use an `<img src="data:image/svg+xml;base64,...">` preview (no script execution) or sanitize, and set a real CSP.

Also note `atob()` only handles Latin-1: non-ASCII SVG text will corrupt. Use a UTF-8 decode (`TextDecoder`) or `Blob`/`URL.createObjectURL`.

### 3.4 Desktop run path is wrong in three places

- `tauri.conf.json` sets `"beforeDevCommand": "npm run dev"` / `"beforeBuildCommand": "npm run build"`. Tauri runs those in the crate directory (`crates/.../craft-studio-shell`), which has no `package.json`; it must be `npm --prefix ui run dev` / `npm --prefix ui run build` (or `cd ui && npm ...`).
- `Justfile:7` `cd crates/craft-studio-shell` — non-existent path (see 2.1).
- `cargo tauri` requires the Tauri CLI, which is neither declared in the README prerequisites nor pinned in the repo. Add it to the docs (`cargo install tauri-cli --version "^2"`) or a `cargo-binstall`/npm devDependency.

### 3.5 Silent-success stubs

Eight of the ten modules return `Ok(json!({"status":"success","action": action}))` for every action (`filmcraft`, `wordcraft`, `deckcraft`, `designcraft`, `effectcraft`, `lightcraft`, `gridcraft`, `pdfcraft`), and `vectorcraft`/`photocraft` do the same for any action they do not recognise. The frontend shows no difference between "rendered a video" and "did nothing". At minimum, unknown actions should return `Err(format!("Unsupported action: {action}"))` so the UI can surface a real error instead of a fake success.

### 3.6 Metadata/config gaps for packaging

- No `bundle`/`icons` configuration and no `icons/` directory; `tauri build` installer generation will fail or fall back to a default, and Windows will use a generic icon.
- No `capabilities/` directory. App commands work today, but any plugin added later will be denied by default, and there is no audited permission surface.
- `main.rs` lacks the usual `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, so release binaries on Windows open a console window.

---

## 4. Documentation and repository drift

`README.md` is the most misleading file in the repo. Specific claims vs. reality:

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

- **Root `src/lib.rs` is dead code.** The root `Cargo.toml` is a virtual workspace (no `[package]`), so `src/lib.rs` is never compiled; it is a near-duplicate of `apps/photocraft/src/lib.rs` and carries the same broken `resvg` calls. Delete it.
- **`src/build.rs` dead duplicate** of `build.rs` inside the shell crate (not used by Cargo). Delete after fixing 2.2.
- **Unused `Manager` import** at `src/main.rs:3`: `set_clipboard` receives `State` directly and `Builder::manage` is inherent, so `Manager` is unused. `cargo clippy -- -D warnings` fails on this. (Keep `Emitter` — it is used.)
- **Unused `tokio` dependency** in `[workspace.dependencies]` and `crates/craft-libs/Cargo.toml`, pulled with `features = ["full"]`. Nothing in the workspace references `tokio`. Removing it shrinks build time noticeably.
- **No `Cargo.lock` committed.** For a binary/workspace application the lockfile should be tracked for reproducible builds; it is not in `.gitignore` either, it simply does not exist.
- **No `.github/workflows` content**; empty directory (git does not track it, so it will vanish on clone).
- **`ui/Cargo.toml` duplicate** — see 2.4.
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
- The `Justfile` mirrors the intended CI steps, which is the right instinct — it just points at the wrong paths and cannot pass yet.

---

## 7. Verification performed / not performed

**Performed (all commands exit statuses checked):**

- `git ls-files`, `git status`, `git log`, `git remote -v` — 43 tracked files, one commit `40e9b80`, only `README.md` modified and `txt.txt` untracked.
- Read all Rust sources, manifests, build files, Tauri config, frontend sources/configs, CI, Justfile, README, `txt.txt`.
- `cargo metadata --no-deps` → exit 101, missing workspace member (2.1).
- `cargo metadata --no-deps` from `ui/` → exit 101, no targets (2.4).
- `rustc --emit=metadata build.rs` → parse errors (2.2).
- `node` JSON parse of `tauri.conf.json` → valid JSON (isolation not the problem; the paste location is).
- Cross-checked `resvg` 0.42/0.43/0.44/0.45 and `usvg` 0.42 API on docs.rs for the rasterizer claims (2.3).
- Confirmed absent: `LICENSE`, `assets/`, `Cargo.lock`, `package-lock.json`, `node_modules/`, `icons/`, `capabilities/`, `.github/workflows/*`.

**Not performed:** a full `cargo build`/`cargo test` or `npm run build`. The workspace cannot resolve (2.1), and the frontend has no installed dependencies or lockfile. Once 2.1–2.4 are fixed, run `just ci` end-to-end; expect additional friction from `cargo fmt --check` and the unused import (§5), plus possible `usvg` API drift that only a real compile will reveal.

---

## 8. Recommended fix order

1. Fix `Cargo.toml` member path (or move the crate), then run `cargo metadata` until clean.
2. Replace the corrupted `build.rs`; delete `src/build.rs` and `ui/Cargo.toml`.
3. Port the PhotoCraft rasterizer to the pinned `resvg` 0.42 API in both places (better: delete root `src/lib.rs` and fix only `apps/photocraft`).
4. Fix `beforeDevCommand`/`beforeBuildCommand` and every `crates/craft-studio-shell` path in `Justfile`, README and CI; add `package-lock.json`.
5. Move CI to `.github/workflows/ci.yml`, then make `cargo fmt --check`, `clippy -D warnings` and the frontend build actually pass.
6. Emit `clipboard-updated` from VectorCraft's export (or centralize clipboard writes), and add error handling to the drop zone.
7. Add `LICENSE` (Apache-2.0), fix the clone URL, either add `assets/` or remove the broken image embeds, and reconcile the 8-vs-10 copy; finish the truncated README.
8. Remove `txt.txt`, unused `tokio`, and commit `Cargo.lock`; add tests for the rasterize path and the registry/clipboard commands.
