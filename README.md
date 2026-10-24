# 🎨 ArtCraft Studio

**A unified desktop shell for the ten Storytold Craft apps**

ArtCraft Studio is a Rust + Tauri 2.0 shell that runs the official browser builds of PhotoCraft, VectorCraft, FilmCraft, WordCraft, DeckCraft, DesignCraft, EffectCraft, LightCraft, GridCraft and PdfCraft from [github.com/storytold](https://github.com/storytold) inside one window. Each app is downloaded from its GitHub release at build time, checksum-verified, and embedded as a pinned web build.

> **Status:** proof of concept. All ten tabs load the real upstream apps offline from bundled assets, with WebGL2 forced for WebView2 compatibility. The apps run independently: the shell's earlier mockup pages, Rust action stubs and shared-clipboard panel are not connected to the upstream apps. See [audit.md](audit.md) for the remaining issues.

<p align="center">
  <img src="assets/marketing/display-banner.png" alt="ArtCraft Studio — one workspace, ten creative modules" width="100%" />
</p>

## 🎬 Intro film

<video controls muted loop playsinline poster="assets/video/intro-poster.jpg" width="100%">
  <source src="assets/video/intro.mp4" type="video/mp4">
  Your browser does not support the video tag. <a href="assets/video/intro.mp4">Open the MP4</a>.
</video>

[▶ Watch the 5-second intro film](assets/video/intro.mp4) · *Concept film, not a screen recording.*

## 🌟 The ten apps

| Module | Domain | Embedded upstream build |
| :--- | :--- | :--- |
| **PhotoCraft** | Raster editing | [v0.15.1](https://github.com/storytold/photocraft/releases/tag/v0.15.1) |
| **VectorCraft** | Vector graphics | [v0.16.0](https://github.com/storytold/vectorcraft/releases/tag/v0.16.0) |
| **FilmCraft** | Video editing | [v0.12.0](https://github.com/storytold/filmcraft/releases/tag/v0.12.0) |
| **WordCraft** | Word processing | [v0.10.0](https://github.com/storytold/wordcraft/releases/tag/v0.10.0) |
| **DeckCraft** | Presentations | [v0.10.0](https://github.com/storytold/deckcraft/releases/tag/v0.10.0) |
| **DesignCraft** | Page layout | [v0.12.0](https://github.com/storytold/designcraft/releases/tag/v0.12.0) |
| **EffectCraft** | Motion graphics | [v0.16.0](https://github.com/storytold/effectcraft/releases/tag/v0.16.0) |
| **LightCraft** | RAW editing | [v0.13.0](https://github.com/storytold/lightcraft/releases/tag/v0.13.0) |
| **GridCraft** | Spreadsheets | [v0.11.1](https://github.com/storytold/gridcraft/releases/tag/v0.11.1) |
| **PDFCraft** | PDF tools | [v0.13.0](https://github.com/storytold/pdfcraft/releases/tag/v0.13.0) |

## ✅ What works today

- **Ten real apps, one window.** Each tab mounts the corresponding official web build inside the canvas; the app owns its own menus, tools, canvas and dialogs.
- **Pinned, verified assets.** `ui/web-apps.json` pins each release tag, web-build filename and SHA-256 hash. `ui/scripts/fetch-web-apps.mjs` downloads the zips, verifies the hash, rejects unsafe archive paths and extracts them into `ui/public/apps/<id>`.
- **Offline runtime.** The apps are bundled into the installer; no app assets are fetched at runtime. The shell does not need network access after it is built.
- **WebGL2 first.** Iframes load with `?webgl` so the apps use the WebGL2 backend instead of waiting on an unavailable WebGPU adapter in WebView2 or headless browsers.
- **Fast rebuilds.** Extracted apps are cached by version; `npm run build` only downloads an app when its pinned version is not present (or when run with `--force`).
- **Shell chrome.** The ten tabs, per-app status line and clipboard sidebar remain around the embedded apps.

The old local mockups remain under `ui/public/pages` and the Rust `CraftModule` implementations remain in `apps/*`, but neither is wired into the new app tabs. The shared clipboard is therefore not yet shared with the upstream apps.

All ten apps share the shell's browser origin, so their `localStorage`, IndexedDB and OPFS data live under one origin. Each upstream app is designed to keep its own data, but there is no isolation between apps yet; do not store irreplaceable work only in the embedded builds.

## 🚀 Quick start

Requires **Rust stable**, **Node.js 20+**, network access for the first build, and the **Tauri 2 CLI**. `just` is optional. The first frontend build downloads about 205 MB of app archives (about 457 MB after extraction); later builds reuse them.

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

Build the Windows installer (Tauri runs the frontend build first):

```bash
cd crates/craft-studio-shell
cargo tauri build
```

Both installers are written under `target/release/bundle/`:

- `nsis/ArtCraft Studio_0.1.0_x64-setup.exe` — per-user NSIS installer, no administrator prompt required.
- `msi/ArtCraft Studio_0.1.0_x64_en-US.msi` — per-machine WiX MSI, prompts for elevation.

The frontend build runs `node scripts/fetch-web-apps.mjs` first. The ten app archives total about 205 MB (about 457 MB extracted), so the installers are substantially larger than the bare shell. Use `node scripts/fetch-web-apps.mjs --force` to re-download the pinned versions.

### Code signing

Builds are unsigned unless a code-signing certificate is available. To sign the app and both installers with a certificate installed in `Cert:\CurrentUser\My`:

```powershell
# Find the certificate thumbprint
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object Subject, Thumbprint, NotAfter

# Set it for this shell, then build
$env:WINDOWS_CERT_THUMBPRINT = "YOUR_CERTIFICATE_THUMBPRINT"
just signed-bundle
```

Without `just`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-signed.ps1
```

The script merges a temporary `certificateThumbprint`, SHA-256 digest and DigiCert timestamp settings into the Tauri config, builds the installers, and verifies each signature with `signtool`. The overlay is written under the ignored `target/` directory and deleted afterwards; the thumbprint does not need to be committed. Use `-TimestampUrl` or `WINDOWS_TIMESTAMP_URL` to use a different RFC 3161 timestamp service.

Signing identifies the publisher, but SmartScreen reputation is separate: a new certificate can still trigger a warning until Microsoft accumulates reputation for it. Sign every release with the same certificate to build that reputation.

## 🏗️ Architecture

- **`crates/craft-studio-shell`** — the Tauri 2 application, its commands, `tauri.conf.json`, and the Vite + TypeScript frontend in `ui/`.
- **`crates/craft-studio-shell/ui/src/app.ts`** — the tab shell that mounts each upstream web app.
- **`crates/craft-studio-shell/ui/web-apps.json`** — pinned app versions, release assets and SHA-256 hashes.
- **`crates/craft-studio-shell/ui/scripts/fetch-web-apps.mjs`** — downloads, verifies and extracts the web builds into `ui/public/apps` before dev/build.
- **`crates/craft-libs`** and **`apps/*`** — the original `CraftModule` trait, registry, clipboard and module crates, retained for future native integration.
- **`crates/craft-studio-shell/ui/public/pages`** — the retired local mockups, kept for reference.

## 🛡️ CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- `npm ci` and `npm run build` (frontend, including the app download and checksum verification)
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace` (unit tests for the SVG rasterizer and clipboard state)
- `cargo build --release --workspace`
- a Windows job builds the NSIS installer and uploads it as the `artcraft-studio-nsis` workflow artifact (unsigned unless code signing is configured)

The Linux checks are available locally through `just ci`.

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
