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

## 📜 License

Apache-2.0. Part of the [Storytold](https://github.com/storytold) ArtCraft initiative.
### 🏆 Final Execution

To bring this masterpiece to life:
1. Copy every file above into its exact path.
2. Run `just build` to compile the entire 10-app workspace.
3. Run `just dev` to launch the unified IDE.
4. Click through all 10 tabs to experience the dynamic GUI swapping.
5. Test the Vector → Photo pipeline by clicking "Export SVG" in VectorCraft, switching to PhotoCraft, and dropping 