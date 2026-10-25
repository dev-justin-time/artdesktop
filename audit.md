# ArtCraft Studio — Repository Audit

**Date:** 2026-10-24
**Repository:** `dev-justin-time/artdesktop` (branch `main`, HEAD `e0c1641 "added a2a,mcp,docs"`, working tree clean, up to date with `origin/main`)
**Scope:** 185 tracked files — Rust workspace (14 `.rs`), Tauri shell, Vite/TypeScript frontend, 40 HTML pages, docs/SEO/discovery generators, MCP server, CI, packaging scripts.
**Verdict:** the build is healthy and every Linux CI step passes locally (the installer job was not re-run). This revision records the security, pruning and landing-page pass: the iframe and clipboard holes are closed or bounded, the suite page is a real landing page built on local assets, the Rust module layer is wired into the clipboard panel, and the retired mockups, file-tree dump, generated schemas, one-off harnesses and `tokio` are gone. What remains is **runtime robustness** (switching tabs destroys in-flight work, the notification log is unbounded and unvalidated), **module contracts** (eight modules still answer unknown actions with a success object), **packaging** (release console window, no capabilities file), and **tests** for the surface added since the last audit.

---

## 1. What changed since the previous audit

The previous revision described 43 tracked files at `40e9b80`. The repository now contains 185 tracked files, and the following are new or materially different:

- **The Rust module layer is no longer what the app runs.** `ui/src/app.ts` mounts each upstream web build in an `<iframe src="apps/<id>/index.html?webgl">`. The `CraftModule` implementations in `apps/*` and six of the seven Tauri commands are not called by the UI.
- **A single catalogue** (`crates/craft-studio-shell/ui/src/suite.json`, 718 lines) drives the tabs, the docs generator, the SEO/JSON-LD generator, the A2A card, the MCP server and the Suite Expert: 10 apps, 65 features, 20 app FAQs, 5 suite FAQs.
- **Generated documentation**: 11 pages under `assets/pages/docs/` (hub + one per app), 195-line shared stylesheet, no JavaScript, no external requests.
- **Generated discovery artifacts**: `sitemap.xml` (22 URLs), `robots.txt`, `llms.txt`, root `index.html`, `.well-known/agent-card.json` + `agent.json` (A2A 0.3.0, 10 skills), and injected meta/JSON-LD on 11 marketing pages.
- **One aggregated MCP server** (`scripts/mcp-server.mjs`, 433 lines, zero dependencies) with 6 tools, 3 resources and 1 resource template, plus `scripts/check-mcp.mjs` as a protocol smoke test.
- **Local agent notifications** (`crates/craft-studio-shell/src/notifications.rs`): in-memory ring buffer (500) + append-only JSONL, `agent-notification` event, three commands.
- **Suite Expert** (`ui/src/expert.ts`, 422 lines): offline retrieval chat panel over the catalogue and bundled READMEs.
- **Pinned upstream builds** (`ui/web-apps.json` + `ui/scripts/fetch-web-apps.mjs`): 10 releases, SHA-256 + exact size verified, path-traversal guard, version cache.
- **Packaging**: Tauri bundle config, icons, code-signing script, Windows NSIS CI job, `package-lock.json` and `Cargo.lock` committed.
- **Publishing**: `.github/workflows/pages.yml` assembles the site into `_site`, adds `.nojekyll`, refreshes `assets/pages/vendor` from `ui/public/vendor`, and deploys to GitHub Pages.

The defects the previous revision listed as blockers (workspace path, `build.rs`, the `resvg`/`usvg` API, duplicate `ui/Cargo.toml`, misplaced CI workflow, missing lockfile, clipboard event, README claims, `LICENSE`, broken image links, dead root `src/lib.rs`, absent tests) are fixed and were re-checked in this pass. They are not repeated below.

### Resolved in this pass (security, pruning, landing page)

- **Finding 1 — iframe and clipboard boundary.** App frames now carry `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock"` and `referrerpolicy="no-referrer"`; `tauri.conf.json` ships a real CSP (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ipc: ipc://localhost http://ipc.localhost http://localhost:1420 ws://localhost:1420; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`); the clipboard preview renders the SVG through a `Blob` URL into an `<img>` instead of `innerHTML`; Base64 is decoded with `TextDecoder`. Frames still share the shell origin on purpose so their storage works, so this is a mitigation, not full origin isolation.
- **Finding 2 — suite landing page.** `assets/pages/suite/index.html` is now a landing page: local font CSS, `../vendor/tailwind.js`, local images, navigation to the docs hub, every app guide, the sitemap, `robots.txt`, `llms.txt`, the Agent Card, the repository and the audit, plus an explicit "UI concept" notice. The fictional status ("Synced P2P", "GPU: Metal V2 Active", "IPC Ring Buffer", fake versions, fake recent projects) is gone.
- **Findings 4, 8, 20, 21, 22, 26 — shipped surface.** `ui/public/pages`, the three `_check_*.html` harnesses, `tree.md`, `gen/schemas` and `tokio` are removed (the schema directory is now gitignored and regenerated by `tauri-build`). The clipboard panel calls `get_module_capabilities` and `invoke_module_action` again: VectorCraft's `export_svg` fills the shared clipboard and PhotoCraft's `rasterize_svg` returns a PNG that the panel displays.
- **Findings 3, 9, 10, 14 — copy and metadata.** The seven duplicate captured `<title>` elements are removed, the catalogue says `PDFCraft`, the docs hub lists all six MCP tools, `operatingSystem` is `Windows`, `package.json` pins `node >=20.19`, and the README's status, app list, architecture and concept-image notes match the build.

Re-verified after the changes: `cargo check --workspace --all-targets` and `cargo test --workspace` (9 tests) pass; `tsc --noEmit` and `vite build` produce a 43 kB stylesheet and 34 kB bundle; `generate-docs --check`, `generate-seo --check`, `check-mcp` and `check-glib-advisory` pass; the rewritten suite page renders in headless Chrome with 20 local subresources, no external subresources and no missing files, and all 36 links resolve (only in-page anchors remain).

---

## 2. Verification performed

All commands were run from the repository root on the committed HEAD unless a directory is given.

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets -- -D warnings` | exit 0 |
| `cargo test --workspace` | exit 0 — **9 tests** pass (4 `craft-libs`, 4 `photocraft`, 1 `notifications`); 20 other test binaries report `running 0 tests` |
| `npm run build` (`crates/craft-studio-shell/ui`) | exit 0 — 10 app archives verified/cached, 10 modules transformed, `dist` = **460 MB** |
| `npm audit --audit-level=high` (`ui/`) | exit 0 — 0 vulnerabilities (Vite 7.3.7, Tailwind 4.3.3) |
| `node scripts/generate-docs.mjs --check` | exit 0 — 11 pages current |
| `node scripts/generate-seo.mjs --check` | exit 0 — artefacts current |
| `node scripts/check-mcp.mjs` | exit 0 — initialize, 6 tools, guide, recommendation, catalog resource, template |
| `node scripts/check-glib-advisory.mjs` | exit 0 — glib 0.18.5 present, RUSTSEC-2024-0429 exception still required |
| `npx @tauri-apps/cli@^2 build --no-bundle` | `beforeBuildCommand` ran correctly in `ui/`, `fetch-web-apps` and `tsc && vite build` succeeded (I stopped it before the Rust link) |
| Custom HTML audit (24 pages) | 23 pages carry JSON-LD; 0 broken relative links in generated docs; all TOC/anchors resolve; canonicals and `og:url` agree; sitemap's 22 URLs map to real files; `llms.txt` lists all 10 guides |
| Headless Chrome, 10 app pages served from the repo root | 0 failed network requests, 0 broken images, Inter + Material Symbols loaded, `window.tailwind` active on the 4 pages that include it, no horizontal overflow |
| SEO head placement (12 marketing pages) | `<meta charset>` at byte 40–138 on every page; no `FAQPage` node outside the docs hub; JSON-LD parses everywhere |
| Site assembly simulated locally (`_site`, 102 files, 9.2 MB) | `.nojekyll`, docs hub, Agent Card, sitemap/robots/llms, vendor fonts/images and the marketing social card all present; 0 root-absolute references in 24 pages |
| Headless Chrome against the assembled tree | PhotoCraft page and two docs pages load with 0 failed subresources; the only 404 is the browser's `/favicon.ico` probe |

The custom audit also found 25 `FAQPage` Q&A pairs that were not on the page and `<meta charset>` beyond the first 1024 bytes; both were fixed during this pass. Every marketing page now declares charset at byte 40–138 and emits no `FAQPage`, while the docs hub keeps its node and renders the same FAQ. Seven pages still carry two `<title>` elements.

**Not verified in this pass:** the new Pages workflow executing on GitHub (no `gh` CLI; it runs on the next push to `main` or through `workflow_dispatch`), a fresh installer build, and visual rendering in the Tauri webview.

---

## 3. Findings by severity

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **High — mitigated** | Ten third-party web builds run in **same-origin** iframes. The frames now carry a `sandbox` policy and `referrerpolicy`, `tauri.conf.json` sets a real CSP, and the clipboard preview renders through a `Blob`/`<img>` with `TextDecoder`. `allow-same-origin` is still required for app storage, so a compromised build still shares the shell's storage and command surface. | `ui/src/app.ts`, `tauri.conf.json` `security.csp` |
| 2 | **Medium — resolved** | The suite landing page — the canonical `/assets/pages/suite/` entry point — is a captured app mockup showing fictional status ("Synced P2P", "GPU: Metal V2 Active", "Cybernetic_Genesis_v4.art") and pulls 8 subresources from `cdn.tailwindcss.com`, `fonts.googleapis.com` and `lh3.googleusercontent.com`. It also has no link to the docs, sitemap or repository, so the new docs are orphaned from the site's front door. | `assets/pages/suite/index.html` |
| 3 | **Medium — resolved** | Seven marketing pages carry two `<title>` elements: the generated title plus the mockup's captured one, which is invalid and lets the metadata block compete with the page it is injected into. | `assets/pages/*/index.html`, `scripts/lib/site.mjs` |
| 4 | **Medium — mostly resolved** | The clipboard panel now calls `get_clipboard`, `get_module_capabilities` and `invoke_module_action` (VectorCraft `export_svg`, PhotoCraft `rasterize_svg`), but `set_clipboard` and `get_agent_notifications` remain unused by the UI, and 8 modules still answer every action with `{"status":"success"}` instead of rejecting unknown actions. | `ui/src/app.ts`, `apps/*/src/lib.rs` |
| 5 | **Medium** | The agent notification log is an unauthenticated, free-form, append-only channel served verbatim to LLM clients over MCP. Any same-origin frame can inject arbitrary `message`/`payload` text, and the on-disk file grows without bound (the 500-entry cap is memory only). | `src/notifications.rs`, `scripts/mcp-server.mjs` |
| 6 | **Medium** | No unsaved-work guard when switching tabs: `activateModule` replaces the canvas and destroys the previous `<iframe>` on every click, with no `beforeunload`/lifecycle handshake and no confirmation. Nothing indicates that in-app state may be lost. | `ui/src/app.ts:33-55` |
| 7 | **Medium — resolved** | Page-level accessibility/SEO defects on the pages the sitemap promotes: 7 pages had no `<h1>`, `deckcraft` had two, and `suite`, `filmcraft`, `lightcraft`, `pdfcraft`, `photocraft` had no `lang`. Every page now has `lang` and exactly one `<h1>`. | `assets/pages/*/index.html` |
| 8 | **Medium — resolved** | The UI is built with 2.8 MB of retired mockups (`ui/public/pages`, `ui/public/vendor`) and 3 `_check_*.html` diagnostics that the shell never loads but Vite copies into the 460 MB `dist`. | `ui/public/` |
| 9 | **Medium — resolved** | Brand name is inconsistent: `PdfCraft` in `suite.json`, docs `<h1>`, JSON-LD `name` and the MCP test; `PDFCraft` in the Rust module, README table and tab label `PDF`. Structured data therefore disagrees with the project's own copy. | `suite.json`, `apps/pdfcraft`, `README.md` |
| 10 | **Low — resolved** | Docs state the MCP server exposes 5 tools; the server exposes 6 (`get_suite_manifest` missing from the hub copy). | `scripts/generate-docs.mjs` `hubBody` |
| 11 | **Low** | Release binaries open a console window: `main.rs` has no `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, and startup failure only panics via `.expect(...)`. | `crates/craft-studio-shell/src/main.rs:1,71-73` |
| 12 | **Low** | Test coverage has not grown with the new surface: no test for `notify_agents`, the 500-entry trim, `since_id` filtering or the log path; the one notification test re-implements the ID expression instead of calling it; the Expert and both generators have no tests beyond `--check`. | `src/notifications.rs:136-149` |
| 13 | **Low** | `check-mcp.mjs` asserts that the PhotoCraft guide mentions "PSD", which also passes from the catalogue fallback — so the bundled-guide path is not actually exercised when `public/apps` is absent. | `scripts/check-mcp.mjs:76-79` |
| 14 | **Low — resolved** | README numbers are slightly off and unpinned: 205 MB of archives vs 214.9 MB in `web-apps.json`; "Node.js 20+" while Vite 7 needs 20.19+/22.12+ and `package.json` has no `engines`. | `README.md:78,109` |
| 15 | **Low** | `.cargo/audit.toml` documents a RUSTSEC exception, but `cargo audit` never runs in CI; only the bespoke glib checker does, so other advisories are unmonitored. `npm audit --audit-level=high` also makes CI fail on unrelated new advisories. | `.cargo/audit.toml`, `ci.yml:48-50` |
| 16 | **Low** | `.mcp.json` launches `scripts/mcp-server.mjs` by relative path; clients that do not set the project root as cwd cannot start the server. | `.mcp.json` |
| 17 | **Low** | `notify_agents` persists the entry and writes the log before emitting; if `emit` fails the command returns `Err` although the event was stored and logged. IDs are `timestamp_ms * 1000 + n % 1000`, colliding above 1000 events in one millisecond. | `src/notifications.rs:75-105` |
| 18 | **Low** | `SoftwareApplication.operatingSystem` is `"Windows, macOS, Linux"` while the project only produces Windows installers (its own FAQ says so). | `scripts/lib/site.mjs` `softwareApplicationNode` |
| 19 | **Low** | SwiftShader is forced for every app (`--use-angle=swiftshader --enable-unsafe-swiftshader`), so all ten run on software WebGL; it is required for EffectCraft but caps performance elsewhere. | `tauri.conf.json` `additionalBrowserArgs` |
| 20 | **Low — resolved** | `tree.md` (1.1 MB, 23k+ lines) is a committed dump that includes `.git/`, `target/`, `node_modules` and the 457 MB app tree. It goes stale on every commit. | `tree.md` |
| 21 | **Low — resolved** | Generated Tauri schemas (4 files, ~4.6k lines) remain tracked; `gen/schemas` is regenerated by `tauri-build`. | `crates/craft-studio-shell/gen/schemas/` |
| 22 | **Low — resolved** | Retired mockups are duplicated: `assets/pages/*` (marketing, SEO-injected) and `ui/public/pages/*` (runtime copy). The old `vectercraft` typo was fixed only in `assets/`, so `ui/public/pages/vectercraft` still disagrees with the renamed `vectorcraft`. | `assets/pages/`, `ui/public/pages/` |
| 23 | **Low** | `assets/pages/readme header/index.html`: a path containing a space, no description/canonical/JSON-LD, orphaned from navigation, and it loads CDN Tailwind plus Google Fonts. | `assets/pages/readme header/` |
| 24 | **Low** | `assets/pages/index.html` is the only generated page without Open Graph/Twitter metadata, and its canonical points at the page it redirects to while the page itself is `noindex`. | `assets/pages/index.html` |
| 25 | **Low** | `tailwind.config.js` is dead: Tailwind 4 is configured CSS-first through `@source` in `style.css`, and nothing references the JS config. | `ui/tailwind.config.js` |
| 26 | **Low — resolved** | `tokio` is declared in `[workspace.dependencies]` and `craft-libs` with `features = ["full"]` and is referenced by no crate. | `Cargo.toml:21`, `crates/craft-libs/Cargo.toml:10` |
| 27 | **Low** | Line endings are inconsistent: the new files (`expert.ts`, `suite.json`, `notifications.rs`, `mcp-server.mjs`) are LF while sibling Rust/TS/TOML files are CRLF. The captured pages also retain 20 `rtrvr-*` instrumentation attributes. | multiple |

---

## 4. Detail

### 4.1 Deployment and site integrity (findings 2, 7, 23, 24)

The site now has a delivery path. `.github/workflows/pages.yml` runs on every push to `main` and on demand: it re-runs the docs/SEO `--check` guards, assembles `_site` from `assets/`, replaces `_site/assets/pages/vendor` with a fresh copy of `crates/craft-studio-shell/ui/public/vendor`, writes `.nojekyll`, verifies the required files and the absence of root-absolute asset references, then uploads and deploys to GitHub Pages. The artifact is laid out so the deployed root matches the `site.url` + `site.pagesPath` pair in `suite.json` (`…/artdesktop/assets/pages/`), which is what every canonical, sitemap entry and card URL already assumes. Two operational notes: the repository's Pages source must be set to "GitHub Actions" once, and `assets/pages/vendor/` is generated and gitignored rather than committed, so serving `assets/` directly needs that one copy step.

The app pages were written for the web root of `ui/public/`, where `/vendor/` and `/pages/` exist. Their 62 root-absolute references (61 attributes plus one inline `background-image`) are now relative (`../vendor/fonts/…`, `../vendor/tailwind.js`, `../vendor/images/…`, `../_studio.css`, `../_studio.js`, and `url('../vendor/images/…')`), and the deployed tree carries a self-contained copy of the 13 font files, 11 images, 2 font stylesheets and the Tailwind runtime (2.4 MB) at `assets/pages/vendor`. Headless Chrome against a repo-root server confirms all ten pages load with 0 failed requests, 0 broken images, Inter and Material Symbols available, `window.tailwind` active on the four pages that include it, and no horizontal overflow. The workflow materialises that directory from `crates/craft-studio-shell/ui/public/vendor` on every deploy, so `assets/pages/vendor/` is gitignored and has one source.

The suite page is no longer a scraped design capture. It is a hand-built landing page on the same design tokens: a fixed header with links to the overview, the documentation hub, the ten apps, the shell description and the repository; a hero using the catalogue description; ten app cards that carry the real pinned tag and link to `../docs/<id>/` and the upstream release; a "what the shell does today" section; and an explore block linking the docs hub, `sitemap.xml`, `robots.txt`, `llms.txt`, the Agent Card and `audit.md`. All assets are local (`../vendor/fonts/…`, `../vendor/tailwind.js`, `../vendor/images/…`), there are no `rtrvr-*` attributes, no external subresources, and the fictional telemetry and recent-project panels are gone. An explicit banner states that the page previews the intended interface rather than screenshotting the build. Verified in headless Chrome: the page renders with Tailwind applied, 20 local subresources resolve, the only request outside the page tree is the browser's own `/favicon.ico` probe, and every relative link resolves.

### 4.2 Structured data and head metadata (findings 3, 10, 18, 24)

The marketing pages no longer carry `FAQPage` data. `appGraph()` and `suiteGraph()` used to attach a FAQ node to every app page and to the suite page, neither of which renders a FAQ — 20 app Q&A pairs plus the 5 suite pairs, invisible to readers while the policy requires them on the page. `faqNode` now serves only the docs hub, which renders the suite FAQ under `#faq`; all 5 entries were re-checked against the visible markup. The ten app docs pages render their two FAQs but emit no `FAQPage` node; adding it there would be valid if FAQ rich results are wanted.

`injectHead` now strips any previous block, restores the newline after `<head>`, and inserts the managed metadata immediately after `<meta charset>` instead of at the start of `<head>`. Charset therefore lands at byte 40–138 on every marketing page, inside the required first 1024 bytes, and a second generator run reproduces the same bytes. The seven pages that carried two `<title>` elements (deckcraft, designcraft, effectcraft, gridcraft, lightcraft, vectorcraft, wordcraft) now keep only the generated one; the captured `<title>` was removed from each page and `generate-seo --check` still passes. The other schema/site drifts are fixed too: the hub's MCP paragraph lists all six tools including `get_suite_manifest`, and `operatingSystem` is `Windows`, matching the README and FAQ.

### 4.3 Security and trust boundaries (findings 1, 5)

The shell mounts each upstream build as a sandboxed iframe:

```html
<iframe id="app-frame" src="apps/${moduleId}/index.html?webgl"
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock"
        referrerpolicy="no-referrer" allow="clipboard-read; clipboard-write; fullscreen; autoplay">
```

`tauri.conf.json` now carries a real policy (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ipc: ipc://localhost http://ipc.localhost http://localhost:1420 ws://localhost:1420; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`), the clipboard preview builds a `Blob` from the decoded payload and points an `<img>` at the object URL, and decoding goes through `TextDecoder` so non-ASCII SVG text survives. `innerHTML` no longer receives the payload.

What remains is that frames keep `allow-same-origin` on purpose so each app's `localStorage`, IndexedDB and OPFS keep working, and the builds are still served from the shell's own origin. A compromised build therefore still shares storage with the shell and can call the registered commands. Separating each app onto its own origin (custom protocol with a distinct host per module, or one window per app) is the remaining structural fix; until then the CSP and sandbox keep script from escaping its frame but do not isolate storage.

The notification log is the new boundary. `notify_agents(kind, module, message, payload)` accepts arbitrary strings, appends them to `%APPDATA%\com.storytold.artcraft\agent-notifications.jsonl`, and the MCP tool returns the trailing lines as text to whatever LLM client is connected. That is a prompt-injection path from any frame in the webview into an agent's context. Treat the log as untrusted data (label it as such in the tool result, keep it out of system prompts), cap the file (rotate at ~1 MB or on N entries), and consider validating `kind` against a fixed enum.

### 4.4 Desktop runtime (findings 4, 6, 8, 11, 19)

The Rust layer is partly connected again. `app.ts` calls `get_clipboard` on startup, listens for `clipboard-updated`, labels the panel buttons from `get_module_capabilities`, and drives `invoke_module_action` for VectorCraft's `export_svg` and PhotoCraft's `rasterize_svg`; `notify_agents` still reports module activation and clipboard changes. Still open: eight modules answer every action with a success object (`filmcraft`, `wordcraft`, `deckcraft`, `designcraft`, `effectcraft`, `lightcraft`, `gridcraft`, `pdfcraft`, and the two wired modules for unknown action names), so the commands should reject unknown actions with `Err("Unsupported action: {action}")`; `set_clipboard` and `get_agent_notifications` remain callable but unused by the UI; and the upstream builds never call the shell clipboard themselves, so the cross-app clipboard is still a demonstration rather than a feature.

Tab switching destroys the active iframe with no guard. For apps that keep work in memory (PhotoCraft documents, decks, grids) that is silent data loss. At minimum, ask the frame before replacing it, or keep one iframe per module alive and toggle visibility.

Packaging: the release binary has no `windows_subsystem` attribute, so a console window sits behind the app; startup failure is a panic with no dialog. There is no `capabilities/` directory, so the command surface exists only implicitly and will be denied for the first plugin added. The retired mockups and harnesses are gone, but `ui/public/vendor` (13 fonts, 11 images, two font stylesheets and the Tailwind runtime, 2.4 MB) is still copied into `dist` and therefore into the installer, where the shell never reads it; it is the single source the Pages workflow copies from, so moving it out of `ui/public/` would remove that weight.

### 4.5 Agent layer (findings 12, 13, 16)

The MCP server is well behaved: version negotiation against three protocol revisions, tool schemas with `additionalProperties: false` and enums, structured resources, `-32601`/`-32602`/`-32002` errors, and lazy guide caching. Two caveats: `.mcp.json` uses a relative script path (clients that do not set cwd to the repository cannot start it — an absolute path or a `node ${workspaceFolder}` form is safer), and guide quality depends on `ui/public/apps/<id>/README.md`, which is gitignored. In a fresh clone the server and the Expert both fall back to catalogue text; that is documented, but it means the MCP test's "PSD" assertion passes without touching the bundled-guide code path.

The Expert is deterministic and honest about being retrieval rather than a model. Its weaknesses are retrieval-scale rather than correctness: `scoreApp` adds points for substring hits with weights that are easy to overwhelm ("photo" contributes 2 to every app whose haystack mentions "photograph"), `stem()` strips a trailing `es`, so `features` becomes `featur` while `feature` stays `feature` — a match the retrieval is clearly meant to make, and comparisons only fire when two app names appear by name. It has no tests, which makes regressions in the ranking silent. A handful of table-driven tests over `answer()` — one query per app, one comparison, one fallback — would cover it cheaply, and the function is pure enough to test if the DOM wiring stays in `initExpert()`.

The A2A card is schema-shaped correctly for 0.3.0 (array-valued `capabilities.extensions`, required fields present, 10 skills). The honest problem is that `preferredTransport: "JSONRPC"` and `url: .../suite/` advertise an endpoint that returns HTML. The README says so; a machine reader will not. Either drop `preferredTransport` and the `url`'s endpoint connotation from a discovery-only card (or add `additionalInterfaces: []` and document it in `description`), or ship the small JSON-RPC endpoint the card promises. `agent.json` is byte-identical duplication kept only for clients guessing that name — harmless, but it doubles the maintenance.

### 4.6 Build, CI and packaging (findings 14, 15, 18, 26)

`cargo fmt`, clippy with `-D warnings`, the 9 tests, the frontend build, the npm audit, the docs/SEO `--check` guards, the MCP smoke test and the glib exception check all pass locally; `cargo build --release` was verified in the previous pass and was not re-run here. The Tauri hooks are correct: `beforeBuildCommand: "npm run build"` is executed with `ui/` as the working directory, verified by driving the CLI and watching `prebuild` → `fetch-web-apps` → `tsc && vite build` run. That resolves the doubt the previous revision left around this config.

Remaining CI weaknesses: no Rust cache for `target/` (the release build dominates the job), no `permissions:` block (default token scope), no `concurrency` group (superseded pushes still run to completion), no `cargo audit` although `.cargo/audit.toml` was added (so only glib is tracked), and `npm audit --audit-level=high` is a network-dependent gate that can turn an unrelated advisory into a red build. The Windows job builds only NSIS; the README's MSI path is exercised locally, not in CI.

`tokio` is removed from the workspace and `craft-libs`. `web-apps.json` sums to 214,925,763 bytes — 205 MiB — and the README now states both units; the extracted tree is 457 MiB. `package.json` declares `"engines": { "node": ">=20.19" }`, matching Vite 7.

### 4.7 Content and catalogue consistency (findings 9, 10, 18)

One catalogue is the right architecture, and spot checks confirm the docs are grounded: the PhotoCraft guide's PSD claims match its bundled README (18 mentions), PDFCraft's merge/split features appear in its README, LightCraft's RAW claims are supported. The problems are editorial:

- **PdfCraft vs PDFCraft.** Resolved: the catalogue, docs heading, `SoftwareApplication.name`, A2A skill and MCP test all say `PDFCraft`, matching the Rust module and the README.
- **Operating-system claim** is now `Windows`, matching what is shipped.
- **Hub tool list** lists all six tools, including `get_suite_manifest`.
- **Marketing pages** still carry a `featureList` for content that lives only in the docs. `FAQPage` is gone from every page except the docs hub, which renders the questions, so that half is closed; promoting the feature list onto the page or narrowing the type to `WebPage` remains open.

### 4.8 Repository hygiene (findings 20–27)

- `tree.md` is deleted; if a tree snapshot is ever useful, generate it in CI as an artifact rather than committing it.
- `crates/craft-studio-shell/gen/schemas/` is now gitignored and untracked; `tauri-build` regenerates it. The files still exist locally after a build, which is expected.
- The three `_check_*.html` viewport harnesses are deleted, so the `dist` copy is gone with them.
- `assets/pages/readme header/` has a space in its directory name, no metadata and no inbound links.
- The duplicated mockups are gone: `ui/public/pages` is deleted and `assets/pages` is the only copy. `ui/public/vendor` remains as the single source of the vendored fonts, images and Tailwind runtime that the Pages workflow copies into `assets/pages/vendor`.
- `tailwind.config.js` is ignored by Tailwind 4; `style.css` has the `@source` globs.
- `assets/pages/index.html` lacks Open Graph tags that every other generated page has.
- Line endings split between CRLF (original Rust/TS) and LF (all new files); a `.gitattributes` with `* text=auto` would end the churn.
- `assets/pages/suite/index.html` no longer has `rtrvr-*` attributes, duplicate font links, CDN script tags or remote images.

---

## 5. What is genuinely good

- **The catalogue is a real single source of truth.** `suite.json` → tabs, docs, JSON-LD, sitemap, `llms.txt`, A2A card, MCP and Expert, with `--check` guards in CI so the artefacts cannot drift silently. That is the right shape for this project and it is rare to see it wired this consistently.
- **The MCP server is proportionate.** No dependencies, no network, protocol negotiation, typed schemas, lazy guide loading and a genuine smoke test — a better agent integration than most projects twice its size.
- **The docs are readable and self-contained.** Skip link, sticky header, breadcrumbs, `aria-current`, on-page TOC, FAQ `<details>`, previous/next, `prefers-reduced-motion`, responsive breakpoints at 960/620 px, one stylesheet, zero external requests. The feature content traces back to the upstream READMEs.
- **The download pipeline is careful.** Exact byte length, SHA-256, zip path traversal rejection, single-root detection, `.version` cache, atomic-ish rename, `.build-info.json`.
- **The notification design separates concerns well.** Memory ring buffer under a short lock, file append outside it, event emitted for UI, path exposed for agents, one test, and the MCP reader tolerates a missing file.
- **Engineering hygiene where it counts:** both lockfiles committed, `cargo fmt` clean, clippy at `-D warnings` clean, 0 npm advisories, the glib exception is documented and has a dedicated watchdog, and the README now describes the proof-of-concept honestly, including the shared-origin storage caveat.

---

## 6. Recommended fix order

Done in this pass: the iframe/CSP hardening (1), the suite landing page (2), the prune (8, 20, 21, 22, 26), the clipboard wiring (4), the copy fixes (3, 7, 9, 10, 14, 18) and the duplicate titles (3). Remaining, in order:

1. **Make the module contracts explicit.** Return `Err("Unsupported action: {action}")` for unknown actions in all ten modules, and decide whether `set_clipboard`/`get_agent_notifications` are part of the public surface or should go. (4)
2. **Guard tab switching.** Ask the frame before replacing the canvas, or keep one iframe per module and toggle visibility, so documents are not destroyed silently. (6)
3. **Treat the notification log as untrusted input.** Rotate or cap the file, validate `kind`, label the MCP tool output as untrusted data, and note the prompt-injection risk in the tool description. (5, 17)
4. **Add the guard rails the newer code lacks**: tests for `notify_agents`/trim/`since_id` and the Expert's `answer()`, `cargo audit` in CI, and `windows_subsystem` on release builds. (11, 12, 15)
5. **Smaller cleanups**: the MCP test's "PSD" assertion, `.mcp.json`'s relative path, SwiftShader targeting, `assets/pages/readme header/`, Open Graph on the root redirect, the dead `tailwind.config.js`, line endings, and moving `ui/public/vendor` out of the bundle so it stops shipping in the installer. (13, 16, 19, 23, 24, 25, 27)
