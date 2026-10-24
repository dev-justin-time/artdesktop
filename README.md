# 🎨 ArtCraft Studio

**A unified desktop shell for ten creative modules**

ArtCraft Studio is a Rust + Tauri 2.0 monorepo that registers ten creative modules behind a shared `CraftModule` trait and hosts them in one desktop process. It is an early-stage proof of concept: the shell, module registry, shared clipboard and two asset pipelines are implemented, and all ten modules embed completed interactive mockup pages from `assets/pages`. PhotoCraft's and VectorCraft's pages wire their buttons to the working pipelines; the other modules' Rust actions are still stubs.

> **Status:** proof of concept. PhotoCraft's SVG → PNG rasterizer and VectorCraft's SVG export to the shared clipboard work. All ten modules embed completed interactive mockup pages from `assets/pages`; only PhotoCraft and VectorCraft currently call real Rust actions from those pages. See [audit.md](audit.md) for the current known issues.

<p align="center">
  <img src="assets/marketing/display-banner.png" alt="ArtCraft Studio — one workspace, ten creative modules" width="100%" />
</p>

## 🎬 Intro film

<video controls muted loop playsinline poster="assets/video/intro-poster.jpg" width="100%">
  <source src="assets/video/intro.mp4" type="video/mp4">
  Your browser does not support the video tag. <a href="assets/video/intro.mp4">Open the MP4</a>.
</video>

[▶ Watch the 5-second intro film](assets/video/intro.mp4) · *Concept film, not a screen recording.*

## 🌟 The ten modules

| Module | Domain | Current state |
| :--- | :--- | :--- |
| **PhotoCraft** | Raster editing | **Completed mockup UI + implemented:** the page's **Rasterize SVG** button sends the shared clipboard SVG to `rasterize_svg`, which renders it to PNG with `usvg` + `tiny-skia` + `resvg` |
| **VectorCraft** | Vector graphics | **Completed mockup UI + implemented:** the page's **Export SVG** button serializes its artboard into the shared clipboard through `export_svg` |
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
- **Completed module pages.** All ten modules embed their completed page from `ui/public/pages` inside the canvas; the three extracted pages have duplicate shell chrome hidden so they fit the studio. Each page injects a compact module nav bar; clicking it switches the studio's active tab, including back to the dashboard.
- **Shared clipboard state.** A `SharedState` clipboard holds a Base64 payload with its source module and MIME type, exposed through `get_clipboard` / `set_clipboard`.
- **SVG → PNG pipeline.** VectorCraft's **Export SVG** writes the artboard to the shared clipboard; PhotoCraft's **Rasterize SVG** button rasterizes that clipboard SVG and opens the PNG preview.
- **Ten module tabs** — every module embeds its completed mockup page; PhotoCraft and VectorCraft additionally connect page buttons to their working Rust pipelines.

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

## 🖼️ Concept gallery

> **Design exploration, not current screenshots.** These renders were produced during the visual exploration of the suite. They show intended UI directions; the build currently embeds simplified interactive pages, and most module actions are stubs. See [audit.md](audit.md) for what actually works.

<p align="center">
  <img src="assets/concepts/dashboard.jpg" alt="ArtCraft Studio dashboard concept" width="100%" />
</p>

| Workstation concept | Detail study |
|:---:|:---:|
| ![Workstation concept](assets/concepts/workstation.jpg) | ![UI detail concept](assets/concepts/detail.jpg) |
| Multi-module workspace direction | Neon control-surface direction |

<details>
<summary>🎛️ Ten module concepts (expand)</summary>

| Module | Concept |
|---|---|
| PhotoCraft | ![](assets/concepts/photocraft.jpg) |
| VectorCraft | ![](assets/concepts/vectorcraft.jpg) |
| FilmCraft | ![](assets/concepts/filmcraft.jpg) |
| WordCraft | ![](assets/concepts/wordcraft.jpg) |
| DeckCraft | ![](assets/concepts/deckcraft.jpg) |
| DesignCraft | ![](assets/concepts/designcraft.jpg) |
| EffectCraft | ![](assets/concepts/effectcraft.jpg) |
| LightCraft | ![](assets/concepts/lightcraft.jpg) |
| GridCraft | ![](assets/concepts/gridcraft.jpg) |
| PDFCraft | ![](assets/concepts/pdfcraft.jpg) |

</details>

## 🚀 Launch kit

Build-aligned launch assets with accurate copy: ten creative modules, Rust + Tauri 2.0, two live pipelines, and an explicit proof-of-concept status.

| Social card | Display banner | Email header |
|:---:|:---:|:---:|
| ![Social card](assets/marketing/social-card.png) | ![Display banner](assets/marketing/display-banner.png) | ![Email header](assets/marketing/email-header.png) |
| 1200 × 1200 | 1920 × 1080 | 1600 × 900 |

[Open the local marketing preview](assets/marketing/preview.html) · [HTML launch email](assets/marketing/launch-email.html) · [Copy deck and asset notes](assets/marketing/README.md)

## 🤝 Contributing

The module boundary is the `CraftModule` trait in `crates/craft-libs/src/lib.rs`: implement `id`, `name`, `capabilities` and `handle_action`, then register the module in `crates/craft-studio-shell/src/main.rs`. See [audit.md](audit.md) for the open work items.

## 📜 License

Licensed under the [Apache License, Version 2.0](LICENSE).
