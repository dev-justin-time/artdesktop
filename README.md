# 🎨 ArtCraft Studio

**A unified desktop shell for the ten Storytold Craft apps**

ArtCraft Studio is a Rust + Tauri 2.0 shell that runs the official browser builds of PhotoCraft, VectorCraft, FilmCraft, WordCraft, DeckCraft, DesignCraft, EffectCraft, LightCraft, GridCraft and PDFCraft from [github.com/storytold](https://github.com/storytold) inside one window. Each app is downloaded from its GitHub release at build time, checksum-verified, and embedded as a pinned web build.

> **Status:** proof of concept. All ten tabs load the real upstream apps offline from bundled assets, with WebGL2 forced for WebView2 compatibility. The shell's shared clipboard is wired to the Rust module layer: VectorCraft exports an SVG into it and PhotoCraft rasterizes it, and the app frames are sandboxed under a content security policy. The upstream apps themselves do not call the shell clipboard yet. See [audit.md](audit.md) for the remaining issues.

<p align="center">
  <img src="assets/marketing/display-banner.png" alt="ArtCraft Studio — one workspace, ten creative modules" width="100%" />
</p>

<p align="center"><sub><strong>Future UI concept</strong>, not a screenshot of the current build. The shipping app embeds the upstream web builds in tabs; see the <a href="#-concept-gallery">concept gallery</a>.</sub></p>

## 🎬 Intro film

<video controls muted loop playsinline poster="assets/video/intro-poster.jpg" width="100%">
  <source src="assets/video/intro.mp4" type="video/mp4">
  Your browser does not support the video tag. <a href="assets/video/intro.mp4">Open the MP4</a>.
</video>

[▶ Watch the 5-second intro film](assets/video/intro.mp4) · *Future-UI concept film, not a screen recording.*

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
- **WebGL2 first.** Iframes load with `?webgl` so the apps use the WebGL2 backend instead of waiting on an unavailable WebGPU adapter in WebView2 or headless browsers. EffectCraft needs software WebGL; start the app with `--software-webgl` (or set `ARTCRAFT_SOFTWARE_WEBGL=1`) to force WebView2 onto SwiftShader. Without the flag the nine apps that can use the GPU keep it.
- **Fast rebuilds.** Extracted apps are cached by version; `npm run build` only downloads an app when its pinned version is not present (or when run with `--force`).
- **Tabs keep their work.** Switching tabs hides the previous frame instead of destroying it, so in-memory documents survive a detour into another app; the toolbar's **⟳ Reload** button is the explicit way to discard one frame.
- **Wired module actions.** The clipboard panel calls the Rust registry through `invoke_module_action`: **Export SVG** asks VectorCraft to put a sample SVG on the shared clipboard, and **Rasterize SVG** hands the clipboard SVG to PhotoCraft's rasterizer and shows the PNG it returns. Capability labels come from `get_module_capabilities`. The other eight modules declare their actions but answer them with an explicit error until they are implemented, and unknown action ids are rejected instead of reporting success.
- **Hardened frames.** Each app is served from its own origin (`http://photocraft.localhost` … on WebView2, `photocraft://localhost` … elsewhere) by a per-module protocol, so `allow-same-origin` gives a frame its own storage rather than the shell's. Every app response carries its own CSP (no `ipc:`, no `frame-ancestors`), the shell policy keeps `frame-ancestors 'none'`, app iframes still carry an explicit `sandbox` and `referrerpolicy="no-referrer"`, SVG previews render from a Blob into an `<img>` rather than inline markup, and the shell uses listeners rather than inline `onclick` attributes so `script-src 'self'` leaves it working. `capabilities/default.json` grants the window the core APIs it uses (events, app, window, path).

The retired local mockups are gone; the two wired actions above are the only bridge between the shell and the upstream apps, and the upstream builds do not push to the clipboard themselves.

Each app runs on its own browser origin, so its `localStorage`, IndexedDB and OPFS data are isolated from the shell and from the other apps. The upstream builds are still third-party code with their own storage, and their policies allow inline script and WASM in that origin on purpose, so do not treat the embedded builds as a place for irreplaceable work.

## 🚀 Quick start

Requires **Rust stable**, **Node.js 20.19+**, network access for the first build, and the **Tauri 2 CLI**. `just` is optional. The first frontend build downloads about 205 MiB (215 MB) of app archives, about 457 MiB after extraction; later builds reuse them.

```bash
# 1. Clone the repository
git clone https://github.com/dev-justin-time/artdesktop.git
cd artdesktop

# 2. Install frontend dependencies (Node.js 20.19+)
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

The frontend build runs `node scripts/fetch-web-apps.mjs` first. The ten app archives total about 205 MiB (215 MB; about 457 MiB extracted), so the installers are substantially larger than the bare shell. Use `node scripts/fetch-web-apps.mjs --force` to re-download the pinned versions.

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

### Dependency security

`npm audit` is clean after the Vite 7, Tailwind 4 and adm-zip 0.6.1 upgrades. One Rust advisory remains: `glib 0.18.5` ([RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)) is pulled in by Tauri 2's GTK 0.18 stack on Linux. It is fixed only in glib 0.20, which `gtk 0.18` does not accept; it cannot be resolved until Tauri moves to a newer GTK binding. It does not affect the Windows build.

## 🧭 Documentation, search and agent discovery

One catalogue drives everything: `crates/craft-studio-shell/ui/src/suite.json` holds each app's name, category, description, keywords, 65 documented features, FAQ and release metadata. After editing it, regenerate the artifacts:

```bash
node scripts/generate-docs.mjs
node scripts/generate-seo.mjs
```

Both scripts accept `--check`, and CI runs them, so changing the catalogue without regenerating the pages fails the build. `node scripts/check-mcp.mjs` smoke-tests the agent server.

**App documentation.** `assets/pages/docs/` contains a documentation hub and a feature-by-feature page for every app, with a shared header, sidebar, footer, breadcrumb trail, table of contents, FAQ and previous/next navigation. The pages are static HTML with one shared stylesheet, relative links, no JavaScript and no external font or CDN requests.

**Google-format rich data.** Each marketing page and documentation page carries JSON-LD using schema.org types Google supports: `Organization`, `WebSite`, `SoftwareApplication` (category, free offer, feature list, pinned version), `BreadcrumbList`, `FAQPage` (only on the documentation hub, which shows the questions), and `TechArticle` or `CollectionPage`. The same pages get canonical URLs, descriptions, Open Graph and Twitter metadata. The generator also writes `sitemap.xml` (22 URLs), `robots.txt` and `llms.txt`.

**Publishing.** `site.url` and `site.pagesPath` in `suite.json` point at `https://dev-justin-time.github.io/artdesktop/assets/pages/`; canonicals, the sitemap, Open Graph URLs and the A2A card all derive from them. `.github/workflows/pages.yml` deploys that tree on every push to `main` (or via `workflow_dispatch`): it re-runs the `--check` guards, assembles `_site` from `assets/`, replaces `_site/assets/pages/vendor` with a fresh copy of `vendor/`, writes `.nojekyll`, verifies the required files are present, and uploads the result to GitHub Pages. `assets/pages/vendor/` is generated, not committed, so a plain static server pointed at `assets/` needs that copy step first. Set Settings → Pages → Source to **GitHub Actions** once before the first deploy.

**A2A discovery.** `assets/pages/.well-known/agent-card.json` (with an `agent.json` alias) publishes an A2A 0.3.0 Agent Card listing all ten apps as skills, with tags, examples and documentation links. It is **discovery-only**: the suite does not accept remote A2A tasks yet, and the card declares that through a `capabilities.extensions` entry. Do not point an agent at it expecting a JSON-RPC endpoint.

**MCP server.** `scripts/mcp-server.mjs` is one aggregated Model Context Protocol server over stdio, with no dependencies and no network access. `.mcp.json` registers it for compatible clients:

```bash
node scripts/mcp-server.mjs
```

Tools: `list_apps`, `search_apps`, `recommend_app`, `get_app_guide`, `get_agent_notifications` and `get_suite_manifest`. Resources include the catalogue, a guide index, the notification log and a `suite://apps/{app}/guide` template. Guides come from the bundled upstream `README.md` files when present (override the search root with `ARTCRAFT_APPS_ROOT`) and fall back to the catalogue in a fresh checkout. `.mcp.json` launches the server by relative path, so the client must start it with the repository root as its working directory. `node scripts/check-mcp.mjs` exercises both guide paths and the notification warning.

**Agent notifications.** The shell appends a JSON line for each module activation and clipboard update, emits an `agent-notification` event, and keeps the last 500 entries in memory. The log rotates to `agent-notifications.jsonl.1` at 1 MB, `kind` is limited to the two events the shell emits, module ids must be short alphanumeric slugs, and messages are flattened and capped at 512 characters. The MCP tool prefixes its output with an explicit "UNTRUSTED DATA" warning, because the entries are attacker-reachable text from any frame in the webview. Agents read the same file through the MCP tool:

| Platform | Log path |
| :--- | :--- |
| Windows | `%APPDATA%\com.storytold.artcraft\agent-notifications.jsonl` |
| macOS | `~/Library/Application Support/com.storytold.artcraft/agent-notifications.jsonl` |
| Linux | `~/.local/share/com.storytold.artcraft/agent-notifications.jsonl` |

The Rust commands are `notify_agents`, `get_agent_notifications` and `get_agent_notification_log_path` in `crates/craft-studio-shell/src/notifications.rs`. Set `ARTCRAFT_NOTIFICATION_LOG` to point the MCP server at a different file.

**Suite Expert.** The **✦ Suite Expert** button opens an offline chat panel. It answers from the shared catalogue and the bundled app READMEs with tokenised retrieval, cites its sources and suggests follow-up questions. It uses no API key, no model provider and no network request; it is a deterministic retrieval assistant, not a neural model, so it will say when it cannot match a question. `npm run test:expert` in `crates/craft-studio-shell/ui` pins the ranking with a bundled regression test (one question per app, a comparison, a task query, the fallback and the stemmer).

## 🏗️ Architecture

- **`crates/craft-studio-shell`** — the Tauri 2 application, its commands, `tauri.conf.json`, and the Vite + TypeScript frontend in `ui/`.
- **`ui/src/suite.json`** — the single source for app metadata, keywords, features and FAQ used by the shell, docs generator, SEO generator, A2A card, MCP server and Suite Expert.
- **`scripts/generate-docs.mjs`, `scripts/generate-seo.mjs`** — generate documentation pages from the catalogue and inject schema/SEO metadata into the marketing pages.
- **`scripts/mcp-server.mjs`** — the aggregated MCP server; `scripts/check-mcp.mjs` is its smoke test.
- **`crates/craft-studio-shell/src/notifications.rs`** — the local agent notification log and its Tauri commands.
- **`crates/craft-studio-shell/capabilities/default.json`** — the Tauri 2 capability that grants the `main` window `core:default`; without it the ACL is empty and the event API is denied.
- **`ui/src/expert.ts`** — the offline Suite Expert retrieval and chat panel.
- **`crates/craft-studio-shell/ui/src/app.ts`** — the tab shell that mounts each upstream web app and drives the shared clipboard panel.
- **`crates/craft-studio-shell/ui/web-apps.json`** — pinned app versions, release assets and SHA-256 hashes.
- **`crates/craft-studio-shell/ui/scripts/fetch-web-apps.mjs`** — downloads, verifies and extracts the web builds into `ui/public/apps` before dev/build.
- **`vendor/`** — the vendored fonts, images and Tailwind runtime the published pages use. It lives outside `ui/public/` so the desktop bundle does not ship it, and `pages.yml` copies it into the site build.
- **`crates/craft-libs`** and **`apps/*`** — the `CraftModule` trait, registry and shared clipboard used by the shell's commands, plus one crate per app with the actions the UI can call.
- **`assets/pages/suite/index.html`** — the suite landing page: real navigation to the docs, sitemap and repository, local vendor assets, and no fictional runtime telemetry.

## 🛡️ CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- `npm ci` and `npm run build` (frontend, including the app download and checksum verification)
- `node scripts/generate-docs.mjs --check` and `node scripts/generate-seo.mjs --check` (docs, schema and discovery artifacts are current)
- `node scripts/check-mcp.mjs` (MCP handshake, tools, bundled guide and catalogue fallback, recommendations, resources, untrusted-notification warning)
- `npm run test:expert` (Suite Expert ranking: one question per app, comparison, task, list, fallback, stemmer)
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo audit` (Rust advisories; the documented glib exception in `.cargo/audit.toml` is honoured)
- `cargo test --workspace` (unit tests for the SVG rasterizer, clipboard state, module contracts and the notification log)
- `cargo build --release --workspace`
- a Windows job builds the NSIS installer and uploads it as the `artcraft-studio-nsis` workflow artifact (unsigned unless code signing is configured)

The Linux checks are available locally through `just ci`.

For an end-to-end check of the desktop window itself (tabs, embedded builds, clipboard, notification log, console errors), build the binary with `npx @tauri-apps/cli@^2 build --no-bundle`, start it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333"`, then run `node scripts/check-tauri-window.mjs`. It drives the running window over the WebView2 DevTools protocol and exits non-zero on any failure; it is manual because GitHub runners have no WebView2.

## 🖼️ Concept gallery

> **Future UI concepts, not current screenshots.** These renders are design exploration for a planned interface and are kept as the intended visual direction. The build today embeds the upstream web apps in tabs, not these screens. See [audit.md](audit.md) for what actually works.

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

The module boundary is the `CraftModule` trait in `crates/craft-libs/src/lib.rs`: implement `id`, `name`, `capabilities` and `handle_action`, then register the module in `crates/craft-studio-shell/src/main.rs`. Registered actions are callable from the UI through the `invoke_module_action` command; the clipboard panel currently labels the VectorCraft and PhotoCraft demo actions. `handle_action` must reject anything it cannot do: return `craft_libs::dispatch_delegated` for a declared action the embedded web build performs, and `craft_libs::unsupported_action` for an unknown one, rather than answering with a success object. See [audit.md](audit.md) for the open work items.

## 📜 License

Licensed under the [Apache License, Version 2.0](LICENSE).
