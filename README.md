# 🎨 ArtCraft Studio

**A unified desktop shell for ten creative modules**

ArtCraft Studio is a Rust + Tauri 2.0 monorepo that registers ten creative modules behind a shared `CraftModule` trait and hosts them in one desktop process. It is an early-stage proof of concept: the shell, module registry, shared clipboard and two asset pipelines are implemented; eight modules embed completed interactive mockup pages, while PhotoCraft and VectorCraft expose the two working pipelines.

> **Status:** proof of concept. PhotoCraft's SVG → PNG rasterizer and VectorCraft's SVG export to the shared clipboard work. FilmCraft, WordCraft, DeckCraft, DesignCraft, EffectCraft, LightCraft, GridCraft and PDFCraft embed completed interactive mockup pages from `assets/pages` (their Rust actions are still stubs). See [audit.md](audit.md) for the current known issues.

## 🌟 The ten modules

| Module | Domain | Current state |
| :--- | :--- | :--- |
| **PhotoCraft** | Raster editing | **Implemented:** `rasterize_svg` decodes a Base64 SVG and renders it to PNG with `usvg` + `tiny-skia` + `resvg` |
| **VectorCraft** | Vector graphics | **Implemented:** `export_svg` writes an SVG into the shared clipboard |
| **FilmCraft** | Video editing | **Completed mockup UI** embedded from `assets/pages/filmcraft`; `add_clip`, `split_clip`, `render_timeline` are stubs |
| **WordCraft** | Word processing | **Completed mockup UI** embedded from `assets/pages/wordcraft`; `insert_text`, `apply_style`, `export_pdf` are stubs |
| **DeckCraft** | Presentations | **Completed mockup UI** embedded from `assets/pages/deckcraft`; `add_slide`, `apply_theme`, `start_presentation` are stubs |
| **DesignCraft** | Page layout | **Completed mockup UI** embedded from `assets/pages/designcraft`; `create_grid`, `place_text_frame`, `export_print_ready` are stubs |
| **EffectCraft** | Motion graphics | **Completed mockup UI** embedded from `assets/pages/effectcraft`; `add_compositor_node`, `set_keyframe`, `render_frame` are stubs |
| **LightCraft** | RAW editing | **Completed mockup UI** embedded from `assets/pages/lightcraft`; `adjust_white_balance`, `apply_tone_curve`, `sync_edits` are stubs |
| **GridCraft** | Spreadsheets | **Completed mockup UI** embedded from `assets/pages/gridcraft`; `add_row`, `apply_formula`, `export_csv` are stubs |
| **PDFCraft** | PDF tools | **Completed mockup UI** embedded from `assets/pages/pdfcraft`; `merge_pdfs`, `split_pdf`, `add_watermark` are stubs |

## ✅ What works today

- **One process, ten modules.** Modules implement the `CraftModule` trait and are registered in a `ModuleRegistry`; the shell invokes their actions through Tauri commands.
- **Capability-driven toolbar.** Each module declares its actions, and the frontend renders the toolbar from that list.
- **Completed module mockups.** Eight modules embed their completed page from `ui/public/pages` inside the canvas, with duplicate shell chrome hidden so they fit the studio. Each page injects a compact module nav bar; clicking it switches the studio's active tab, including back to the dashboard.
- **Shared clipboard state.** A `SharedState` clipboard holds a Base64 payload with its source module and MIME type, exposed through `get_clipboard` / `set_clipboard`.
- **SVG → PNG pipeline.** Dropping onto the PhotoCraft canvas rasterizes the clipboard's SVG and displays the PNG.
- **Ten module tabs** — completed mockup pages for eight modules and the two working pipelines for PhotoCraft and VectorCraft.

The clipboard is an in-process `RwLock<Option<ClipboardItem>>`; payloads are Base64-encoded and copied across Tauri IPC. It is not shared memory and it is not zero-copy. Both the `set_clipboard` command and VectorCraft's export write through `SharedState::set_clipboard`, which emits `clipboard-updated` so the sidebar refreshes.

The embedded mockups are fully offline: the Tailwind runtime is vendored at `ui/public/vendor/tailwind.js`, Google Fonts are mirrored under `ui/public/vendor/fonts`, and the photographic artwork is downloaded into `ui/public/vendor/images`. No external network requests are made at runtime.

## 🚀 Quick start

Requires **Rust stable**, **Node.js 20+**, and the **Tauri 2 CLI**. `just` is optional.

```bash
# 1. Clone the repository
git clone https://github.com/dev-justin-time/artdesktop.git
cd artdesktop

# 2. Install frontend dependencies (Node.js 20+)
cd crates/craft-studio-shell/ui && npm ci && cd ../../..

# 3. Install the Tauri CLI once
cargo install tauri-cli --version "^2"

# 4. Run in development mode
just dev
```

Without `just`:

```bash
cd crates/craft-studio-shell
cargo tauri dev
```

Build the release workspace (the frontend must be built first):

```bash
cd crates/craft-studio-shell/ui && npm run build && cd ../../..
cargo build --release --workspace
```

No installer/bundler configuration exists yet; the release build produces the binary but not packaged installers.

## 🏗️ Architecture

- **`crates/craft-libs`** — the `CraftModule` trait, `ModuleAction` capabilities, `ModuleRegistry`, and `SharedState` (clipboard).
- **`crates/craft-studio-shell`** — the Tauri 2 application, its commands, `tauri.conf.json`, and the Vite + TypeScript frontend in `ui/`.
- **`apps/*`** — one crate per creative module, each implementing `CraftModule`.
- **`crates/craft-studio-shell/ui/public/pages`** — the completed module mockups embedded by the frontend (source copies live in `assets/pages`).

## 🛡️ CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- `npm ci` and `npm run build` (frontend)
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace` (unit tests for the SVG rasterizer and clipboard state)
- `cargo build --release --workspace`

The same sequence is available locally through `just ci`.

## 🖼️ Screenshots

> **Placeholder images:** every image below is a generated placeholder, not a screenshot of the running app. Replace them with real captures as the modules land.

<p align="center">
  <img src="assets/hero-banner.png" alt="ArtCraft Studio unified workspace" width="100%" />
</p>

| Unified shell | Shared clipboard | SVG → PNG |
|:---:|:---:|:---:|
| ![Dashboard](assets/03-dashboard.png) | ![Clipboard](assets/07-clipboard-svg.png) | ![Rasterize](assets/13-success.png) |
| Ten modules, one process | Base64 payload in `SharedState` | Rendered in pure Rust |

| Vector → Photo | Drop target |
|:---:|:---:|
| ![Workflow](assets/31-workflow.png) | ![Drop zone](assets/11-dropzone.png) |
| Export SVG, then rasterize in PhotoCraft | PhotoCraft accepts a dropped SVG |

<details>
<summary>🎛️ Module placeholders (expand)</summary>

| Module | Preview |
|---|---|
| PhotoCraft | ![](assets/15-photocraft.png) |
| VectorCraft | ![](assets/16-vectorcraft.png) |
| FilmCraft | ![](assets/17-filmcraft.png) |
| WordCraft | ![](assets/18-wordcraft.png) |
| DeckCraft | ![](assets/19-deckcraft.png) |
| EffectCraft | ![](assets/20-effectcraft.png) |
| LightCraft | ![](assets/21-lightcraft.png) |
| DesignCraft | ![](assets/22-designcraft.png) |

</details>

## 🤝 Contributing

The module boundary is the `CraftModule` trait in `crates/craft-libs/src/lib.rs`: implement `id`, `name`, `capabilities` and `handle_action`, then register the module in `crates/craft-studio-shell/src/main.rs`. See [audit.md](audit.md) for the open work items.

## 📜 License

Licensed under the [Apache License, Version 2.0](LICENSE).
