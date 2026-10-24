# 🎨 ArtCraft Studio

**The Unified, Tightly-Coupled IDE for the ArtCraft Creative Suite**

ArtCraft Studio is a production-grade monorepo that unifies **10 specialized creative applications** into a single, high-performance desktop environment. Built from scratch in Rust and Tauri 2.0, it features zero-latency shared memory, dynamic GUI generation, and cross-domain asset pipelines.

## 🌟 The 10-App Suite

| Module | Domain | Key Feature |
| :--- | :--- | :--- |
| **PhotoCraft** | Raster Editing | Pure Rust `resvg` SVG-to-PNG pipeline |
| **VectorCraft** | Vector Graphics | Zero-copy shared clipboard export |
| **FilmCraft** | Video Editing | Non-linear timeline & rendering |
| **WordCraft** | Word Processing | Distraction-free writing & PDF export |
| **DeckCraft** | Presentations | Slide management & themes |
| **DesignCraft** | Page Layout | Master grids & print-ready PDFs |
| **EffectCraft** | Motion Graphics | Node-based compositing & keyframes |
| **LightCraft** | RAW Editing | Non-destructive tone curves & batch sync |
| **GridCraft** | Spreadsheets | High-performance data tables & formulas |
| **PDFCraft** | PDF Tools | Merge, split, and watermark documents |

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/storytold/artcraft-studio.git
cd artcraft-studio

# 2. Install frontend dependencies (Requires Node.js 20+)
cd crates/craft-studio-shell/ui && npm install && cd ../../..

# 3. Run in development mode
just dev
```

## 🛡️ Enterprise CI/CD

This monorepo is protected by a strict GitHub Actions pipeline that runs on every PR:
- ✅ `cargo fmt` (Formatting)
- ✅ `cargo clippy` (Linting)
- ✅ `cargo test` (Unit Tests)
- ✅ `npm run build` (Frontend Compilation)
- ✅ `cargo build --release` (Full 10-App Workspace Compilation)
## 🖼️ A Suite, Not Eight Apps

<p align="center">
  <img src="assets/hero-banner.png" alt="ArtCraft Studio unified workspace" width="100%" />
</p>

| Unified Shell | Shared Memory | Live Pipeline |
|:---:|:---:|:---:|
| ![Dashboard](assets/03-dashboard.png) | ![Clipboard](assets/07-clipboard-svg.png) | ![Rasterize](assets/13-success.png) |
| Eight modules, one process | Zero-copy asset transfer | SVG → PNG in pure Rust |

| Vector → Photo | Film → Deck | Modular Updates |
|:---:|:---:|:---:|
| ![Workflow](assets/31-workflow.png) | ![Storyboard](assets/32-film-deck.png) | ![Updater](assets/28-updater.png) |

<details>
<summary>🎛️ Every state, every module (expand)</summary>

| Module / State | Preview |
|---|---|
| PhotoCraft | ![](assets/15-photocraft.png) |
| VectorCraft | ![](assets/16-vectorcraft.png) |
| FilmCraft | ![](assets/17-filmcraft.png) |
| WordCraft | ![](assets/18-wordcraft.png) |
| DeckCraft | ![](assets/19-deckcraft.png) |
| EffectCraft | ![](assets/20-effectcraft.png) |
| LightCraft | ![](assets/21-lightcraft.png) |
| DesignCraft | ![](assets/22-designcraft.png) |
| Drag over target | ![](assets/11-dropzone.png) |
| Error & recovery | ![](assets/14-drop-error.png) |
| High contrast mode | ![](assets/26-accessibility.png) |

</details>
## 📜 License

Apache-2.0. Part of the [Storytold](https://github.com/storytold) ArtCraft initiative.
### 🏆 Final Execution

To bring this masterpiece to life:
1. Copy every file above into its exact path.
2. Run `just build` to compile the entire 10-app workspace.
3. Run `just dev` to launch the unified IDE.
4. Click through all 10 tabs to experience the dynamic GUI swapping.
5. Test the Vector → Photo pipeline by clicking "Export SVG" in VectorCraft, switching to PhotoCraft, and dropping 