# ArtCraft Studio — Repository Audit

**Date:** 2026-10-24
**Repository:** `dev-justin-time/artdesktop` (branch `main`, HEAD `0fbf574 "add protocal;s"`, plus the uncommitted corrections from this pass)
**Scope:** 170 tracked files — Rust workspace (16 `.rs`), Tauri shell, Vite/TypeScript frontend, 26 HTML pages, docs/SEO/discovery generators, MCP server, CI, packaging scripts.
**Verdict:** the build is healthy and every Linux CI step passes locally. This revision covers the largest remaining structural item: **each app now runs on its own origin**. Ten per-module protocols serve the embedded builds from `http://<module>.localhost` (WebView2) or `<module>://localhost` (WebKit), each response carries an app-specific CSP, and the sandbox's `allow-same-origin` is now honest — the frames keep their own storage and cannot read the shell's or each other's, and an `invoke` from an app origin does not complete. That was verified in the running window: **47 of 47 checks pass**. Startup failures now write `startup-error.log` and show a message box, SwiftShader is opt-in, `capabilities/default.json` exists, the MSI is in CI, `featureList` is emitted only where the page renders it, and `.gitattributes` removes the line-ending churn — though 26 files still need a one-time `git add --renormalize`. What remains is mostly build and copy hygiene: `cargo build --release`/`just build` produce a dev-URL binary, the A2A card still advertises a JSON-RPC endpoint that returns HTML, and four app pages still show fictional telemetry.

---

## 1. What changed since the previous audit

The previous revision described 165 tracked files at `5d4f087`. The repository is now at `0fbf574` (three commits: `3343bb1 "Tests and CI"`, `a6a2370 "audit refactor"`, `0fbf574 "add protocal;s"`) with 170 tracked files. The material changes are:

- **One origin per app.** `crates/craft-studio-shell/src/protocols.rs` (303 lines, 6 tests) registers a custom scheme per module. `main.rs` calls `register_uri_scheme_protocol` once per registry id; `get_module_frame_urls` returns the URL for each module; `app.ts` frames that URL instead of `apps/<id>/index.html?webgl`, falling back to the relative path only in a plain browser. `asset_key()` percent-decodes, normalises backslashes, rejects `.`/`..`, and refuses module ids that are not short ASCII slugs, so a request cannot escape `apps/<module>/`. Responses carry a dedicated CSP (no `ipc:`, no `frame-ancestors`, `script-src` with `'unsafe-inline' 'wasm-unsafe-eval'` for the upstream builds), `X-Content-Type-Options: nosniff`, and a MIME type per extension. The shell CSP now uses `frame-ancestors 'none'` and lists the ten module origins in `frame-src`.
- **Startup diagnostics** (`startup.rs`, 204 lines, 3 tests). `--software-webgl` or `ARTCRAFT_SOFTWARE_WEBGL=1` merges `--use-angle=swiftshader --enable-unsafe-swiftshader` into `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` before Tauri boots; the flags are no longer unconditional. A failed start writes `%APPDATA%\com.storytold.artcraft\startup-error.log`, prints to stderr, and shows a `MessageBoxW` dialog on Windows before exiting 1.
- **Capabilities.** `capabilities/default.json` grants `core:default` to the `main` window, so the event API the clipboard panel uses is allowed. This closes the "ACL is empty" defect that the previous revision listed as still open.
- **A live-window check.** `scripts/check-tauri-window.mjs` grew to 47 assertions: ten clickable tabs, all ten builds load, frames persist across switches, Reload replaces one frame, both clipboard actions succeed, the log records a validated kind, and — new in this pass — ten distinct origins, shell/app/other-app storage isolation, no access to the shell's document, and no successful `invoke` from an app frame. It is manual because CI has no WebView2.
- **CI.** The Windows job now builds and uploads **both** NSIS and MSI. The `npm audit` gate tolerates a registry outage (network errors become a warning) while still failing on a real advisory.
- **Site and structured data.** `softwareApplicationNode` takes `featureList` as an opt-in; only the docs pages, which render every feature, emit it. The remaining `rtrvr-*` scraper attributes are stripped from the four captured app pages. The suite landing page is cleaned of the last captured telemetry and carries the "UI concept" notice. The MCP hub copy lists all six tools and `operatingSystem` is `Windows`.
- **Line endings.** `.gitattributes` (`* text=auto eol=lf`, binary exceptions) is committed and `package-lock.json` was renormalised. Twenty-six tracked files still carry CRLF in the index and need one `git add --renormalize .`; see finding 27.
- **Tests.** 28 Rust tests now pass: 18 in `craft-studio-shell` (8 notifications, 7 protocols, 3 startup), 6 in `craft-libs`, 4 in `photocraft`.
- **README and the protocol comment.** The README's frame-hardening, WebGL and storage paragraphs now describe the per-module origins and the opt-in SwiftShader flag, and the `protocols` module comment no longer claims a foreign frame does not receive the injected bridge (findings 28, 33).

### Resolved in this pass

- **Finding 1 — origin isolation.** The High finding from the previous revision is resolved in the running window: the shell is `http://tauri.localhost`, the apps are `http://photocraft.localhost` … `http://pdfcraft.localhost`, all ten distinct, and the storage probes pass in both directions. The residual risks are deliberate, not accidental: each app still runs `'unsafe-inline'` and WASM in its own origin, and the injected bridge object is visible to the frame even though its calls do not complete (see 4.1).
- **Finding 11 — startup/release guard rails.** `windows_subsystem` is set, startup errors are logged and shown in a dialog, and the capability file exists.
- **Finding 19 — SwiftShader.** The flags are opt-in per launch (`--software-webgl` / `ARTCRAFT_SOFTWARE_WEBGL`) instead of global. The live window was verified *with* `--software-webgl`, which exercises the opt-in path; the default path is the same binary without the flag.
- **Structured data — metadata claims.** `featureList` is gone from the marketing pages and the suite page, and remains on the docs pages that actually render the features. `FAQPage` remains only on the docs hub.
- **Findings 15 and 25 — audit gates and MSI.** `cargo audit` is enforced in CI; the `npm audit` gate no longer reddens a build on a registry outage; CI builds the MSI as well as the NSIS.
- **Finding 27 — line endings, mostly.** `.gitattributes` exists. The remaining step is renormalising the index, not adding a policy.
- **Finding 29 — EffectCraft service worker.** The module frame URL is `?webgl&nosw`, using the app's own switch to skip its PWA registration. WebView2 does not route the service-worker script fetch through the custom-protocol handler, so registration 404'd even though `fetch("sw.js")` returned 200. The app frame now loads cleanly, and the live window passes all 47 checks.
- **Findings 28, 33 — documentation.** The README now states that each app has its own origin and storage, that software WebGL is opt-in, and that the shell policy is `frame-ancestors 'none'`; the `protocols` comment now describes the bridge object as possibly present but unable to complete a call, matching the live probe.

Re-verified after those changes: `cargo fmt`, clippy at `-D warnings`, 28 tests, `cargo audit` (0 vulnerabilities, 3 unmaintained warnings), the frontend build, the docs/SEO `--check` guards, the MCP smoke test, the Expert test, the glib watchdog, and the assembled Pages tree (101 files / 9.1 MB, 504 local references, 0 missing).

---

## 2. Verification performed

All commands were run from the repository root on the committed HEAD unless a directory is given.

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` | exit 0 |
| `cargo clippy --workspace --all-targets -- -D warnings` | exit 0 |
| `cargo test --workspace` | exit 0 — **28 tests** (18 shell: 8 notifications, 7 protocols, 3 startup; 6 `craft-libs`; 4 `photocraft`); 20 other test binaries report `running 0 tests` |
| `npm run test:expert` (`ui/`) | exit 0 — 10 app questions, comparison, task, list, fallback and stemming pass |
| `npx tsc --noEmit` (`ui/`) | exit 0 |
| `cargo audit` | exit 0 — 0 vulnerabilities, 3 `unmaintained` warnings (`proc-macro-error`, `rustybuzz`, `ttf-parser`); the `RUSTSEC-2024-0429` glib exception in `.cargo/audit.toml` is honoured |
| `npm audit --audit-level=high` (`ui/`) | exit 0 — 0 vulnerabilities |
| `npx @tauri-apps/cli@^2 build --no-bundle` | exit 0 — `beforeBuildCommand` re-ran, all 10 pinned builds were cached, `tsc && vite build` produced a 13.15 kB stylesheet and a 35.46 kB bundle, `dist` = **457 MB**, release binary built |
| `node scripts/generate-docs.mjs --check` | exit 0 — 11 pages current |
| `node scripts/generate-seo.mjs --check` | exit 0 — artefacts current |
| `node scripts/check-mcp.mjs` | exit 0 — initialize, tools, fixture guide, catalogue fallback, recommendation, resources, templates, untrusted notifications |
| `node scripts/check-glib-advisory.mjs` | exit 0 — glib 0.18.5 still needs the documented exception |
| Site assembly simulated exactly as `pages.yml` does (`_site`) | **101 files / 9.1 MB**; `.nojekyll`, docs hub, Agent Card, sitemap/robots/llms and vendor assets all present |
| Link and asset check over the assembled tree | 504 local `src`/`href` references across the site: **504 resolve, 0 missing, 0 root-absolute** (the email template's `{{unsubscribe_url}}` placeholder is excluded) |
| Live window over WebView2 DevTools (`scripts/check-tauri-window.mjs`, app started with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` and `--software-webgl`) | **47 of 47 checks pass** — ten tabs, ten running builds (EffectCraft at `…?webgl&nosw`), ten distinct origins, storage isolated in all directions, no shell command reachable from a frame, both clipboard actions, validated log entry, Expert answer, no console or CSP errors |
| README and `protocols` claims re-checked against `tauri.conf.json` and the live probe | no stale "share the shell's origin", `frame-ancestors 'self'`, global-SwiftShader or "no isolation" text remains; `cargo fmt --check` still passes |
| `cargo build --release --workspace` | exit 0, but **not a runnable app**: the binary it produces loads `http://localhost:1420` (the dev URL) and shows no tabs. Only the Tauri CLI build enables `custom-protocol` and embeds the app tree (finding 30) |

**Not verified in this pass:** the Pages workflow executing on GitHub (no `gh` CLI; it runs on the next push to `main` or through `workflow_dispatch`), NSIS/MSI bundle creation and code signing (`--no-bundle` was used), MSI installation, and page rendering in headless Chrome. The published tree was checked at the file/link level; the previous pass's headless-Chrome result was not re-run. The desktop window itself was re-verified end to end.

---

## 3. Findings by severity

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **High — resolved** | Ten third-party web builds ran in same-origin iframes under the shell. Each now has its own origin, its own storage and its own CSP, and a frame's `invoke` does not complete. Verified in the running window. | `src/protocols.rs`, `main.rs`, `ui/src/app.ts`, `tauri.conf.json` |
| 2 | **Medium — resolved** | The suite landing page was a captured app mockup with fictional status and eight CDN subresources, and it orphaned the docs. It is now a local-asset landing page linking the docs, apps, sitemap, Agent Card, repository and audit, with an explicit "UI concept" notice. | `assets/pages/suite/index.html` |
| 3 | **Medium — resolved** | Seven marketing pages carried two `<title>` elements. Only the generated one remains; `generate-seo --check` passes. | `assets/pages/*/index.html` |
| 4 | **Medium — resolved** | Modules answered undeclared actions with success. They now reject unknown actions and report declared-but-delegated ones explicitly; VectorCraft requires `svg_data`. | `apps/*/src/lib.rs`, `crates/craft-libs/src/lib.rs` |
| 5 | **Medium — mitigated** | The notification log is allowlisted, slug-validated, flattened, capped, rotated, non-fatal on emit, and labelled "UNTRUSTED DATA" in every MCP export. A same-origin (now same-app-origin) frame can still emit the two allowed kinds, so the content stays attacker-reachable text — labelled and bounded, not trusted. | `src/notifications.rs`, `scripts/mcp-server.mjs` |
| 6 | **Medium — resolved** | Tab switching hid the active app and destroyed it. Frames now persist per module, with an explicit **⟳ Reload** to discard one. Verified: ten frames stay resident. | `ui/src/app.ts` |
| 7 | **Medium — resolved** | Seven promoted pages had no `<h1>`, `deckcraft` had two, and five had no `lang`. Every page now has `lang` and exactly one `<h1>`. | `assets/pages/*/index.html` |
| 8 | **Medium — resolved** | Retired mockups, `_check_*.html` harnesses and `ui/public/vendor` are gone; `vendor/` lives at the repository root and is copied only by the Pages workflow. | `ui/public/`, `vendor/` |
| 9 | **Medium — resolved** | `PdfCraft` vs `PDFCraft` disagreement. The catalogue, docs, JSON-LD, A2A skill, MCP test, Rust module and README all say `PDFCraft`. | `suite.json`, `apps/pdfcraft`, `README.md` |
| 10 | **Low — resolved** | The docs hub listed five MCP tools; it now lists all six, including `get_suite_manifest`. | `scripts/generate-docs.mjs` |
| 11 | **Low — resolved** | Release builds have no console; a failed start writes `startup-error.log`, prints to stderr, shows a Windows message box and exits 1. `capabilities/default.json` grants the window `core:default`, so the event API works (confirmed live). | `src/main.rs`, `src/startup.rs`, `capabilities/default.json` |
| 12 | **Low — resolved** | Rust coverage is 28 tests over the notification helpers, the protocol key/CSP logic, startup flags/logging, module contracts and the rasterizer. The Expert has `check-expert.mjs` in CI. The generators still have no tests beyond `--check`. | `src/*.rs`, `ui/scripts/check-expert.mjs` |
| 13 | **Low — resolved** | `check-mcp.mjs` seeds a temporary guide root and asserts a marker only the fixture README contains, plus the catalogue fallback and the untrusted warning. | `scripts/check-mcp.mjs` |
| 14 | **Low — resolved** | README archive sizes now state 205 MiB / 215 MB and 457 MiB extracted; `package.json` declares `node >=20.19`, matching Vite 7. | `README.md`, `ui/package.json` |
| 15 | **Low — mitigated** | `cargo audit` runs in CI. `npm audit` no longer fails on a registry outage but still fails on a real advisory. Still missing: a Rust `target/` cache, a `permissions:` block and a `concurrency:` group. | `.github/workflows/ci.yml` |
| 16 | **Low — documented** | `.mcp.json` launches `scripts/mcp-server.mjs` by relative path; the README states that the client must use the repository root as its working directory. `.mcp.json` has no portable variable expansion, so this stays documented. | `.mcp.json`, `README.md` |
| 17 | **Low — resolved** | `notify_agents` no longer fails when `emit` fails, and ids are `max(timestamp_ms * 1000, last_id + 1)`, so they stay ordered beyond 1000 events in one millisecond. Covered by tests. | `src/notifications.rs` |
| 18 | **Low — resolved** | `SoftwareApplication.operatingSystem` is `Windows`, matching the shipped installers and the FAQ. | `scripts/lib/site.mjs` |
| 19 | **Low — resolved** | SwiftShader is a per-launch opt-in (`--software-webgl` / `ARTCRAFT_SOFTWARE_WEBGL=1`) instead of a global flag, so the nine apps that do not need software WebGL can use the GPU. | `src/startup.rs`, `tauri.conf.json` |
| 20 | **Low — resolved** | `tree.md` (1.1 MB dump) is deleted. | — |
| 21 | **Low — resolved** | `gen/schemas/` is regenerated by `tauri-build` and no longer tracked. | `crates/craft-studio-shell/gen/` |
| 22 | **Low — resolved** | `ui/public/pages` and the duplicated mockups are deleted; `assets/pages` is the only copy. | `ui/public/` |
| 23 | **Low — resolved** | `assets/pages/readme header/` is deleted. | — |
| 24 | **Low — resolved** | The root redirect carries the same Open Graph/Twitter block as the other generated pages; it stays `noindex, follow` with a canonical pointing at the suite page. | `assets/pages/index.html` |
| 25 | **Low — resolved** | `tailwind.config.js` is deleted; Tailwind 4 reads `@source` in `style.css`, and the rebuilt stylesheet still contains the arbitrary values the UI uses. | `ui/src/style.css` |
| 26 | **Low — resolved** | `tokio` is removed from the workspace and `craft-libs`. | `Cargo.toml`, `crates/craft-libs/Cargo.toml` |
| 27 | **Low — partly resolved** | `.gitattributes` now enforces `* text=auto eol=lf`, but it does not rewrite what is already in the index: **26 tracked files still have CRLF in the index** (the original `Cargo.toml`s, `build.rs`, `tauri.conf.json`, `app.ts`, `web-apps.json`, `ci.yml`, `Justfile`, …). One `git add --renormalize .` finishes the job. | `.gitattributes`, 26 files |
| 28 | **Low — resolved** | The README said the CSP used `frame-ancestors 'self'`, that the apps "share the shell's origin" with "no isolation between apps yet", and that WebView2 "is configured to use SwiftShader". The frame-hardening, WebGL and storage paragraphs now describe the per-module origins, `frame-ancestors 'none'`, the opt-in flag and the real storage boundary. | `README.md` |
| 29 | **Low — resolved** | EffectCraft's PWA called `navigator.serviceWorker.register("sw.js")`; WebView2 does not send that script fetch through the custom-protocol handler, so registration 404'd and logged a console error even though `fetch("sw.js")` returned 200. The module frame now uses the build's own `?nosw` switch (`?webgl&nosw`), the app loads normally without a service worker, and the live check has no console errors. | `src/protocols.rs` |
| 30 | **Low** | `cargo build --release --workspace` (the CI "Build Full Release Binary" step and `just build`) does not enable the `custom-protocol` feature, so the resulting 12 MB binary loads `http://localhost:1420` and is blank without a dev server. The Tauri CLI build (`npx @tauri-apps/cli@^2 build`) enables it, embeds the 457 MB app tree, and produces the 182 MiB standalone binary. Only the Windows installer job uses the correct path. | `Justfile`, `.github/workflows/ci.yml`, `crates/craft-studio-shell/Cargo.toml` |
| 31 | **Low** | The A2A card still sets `preferredTransport: "JSONRPC"` and points `url` at the suite HTML page. The description and the custom `a2a-discovery-only` extension now say it is discovery-only, but a strict client that trusts `preferredTransport` will still try to open a JSON-RPC endpoint that does not exist. | `assets/pages/.well-known/agent-card.json` |
| 32 | **Low** | Four captured app marketing pages still show fictional runtime status in their chrome — "Synced P2P", "GPU: Metal V2 Active", "Cybernetic_Genesis_v4.art" — on pages the sitemap promotes, and unlike the suite page they carry no "UI concept" notice. | `assets/pages/{photocraft,filmcraft,lightcraft,pdfcraft}/index.html` |
| 33 | **Low — resolved** | The `protocols` module doc-comment said a foreign-origin frame "does not receive `window.__TAURI_INTERNALS__`", but in the running window the bridge object **is** present and an `invoke` simply never completes (`no-response`). The comment now says the object may be present, that the app CSP omits `ipc:`, and that the check asserts the call cannot succeed rather than the object being absent. | `src/protocols.rs` |

---

## 4. Detail

### 4.1 Origin isolation (finding 1, 33)

The shell no longer serves the app builds from its own origin. `protocols.rs` registers one scheme per module and maps requests into `apps/<module>/…`; `frame_url()` emits `http://<module>.localhost/index.html?webgl` on WebView2 and `<module>://localhost/index.html?webgl` elsewhere. The shell document stays on `tauri://localhost` / `http://tauri.localhost`. `app.ts` obtains the URLs from `get_module_frame_urls` and falls back to a relative path only when the shell command is unavailable (a plain Vite page).

Each app response carries its own policy rather than inheriting the shell's:

```text
default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:;
connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
```

There is deliberately no `frame-ancestors` (the app origins exist to be framed by the shell, which is now a different origin) and no `ipc:`. Responses also set `X-Content-Type-Options: nosniff`. The shell's own policy now ends in `frame-ancestors 'none'` and lists the ten module origins in `frame-src`. `asset_key()` percent-decodes, converts backslashes, rejects any `.`/`..` segment, and validates the module id before building the key, so a request cannot escape the module directory. The tests cover `..`, encoded traversal, unknown modules, MIME types and the absence of `ipc:`/`frame-ancestors` from the app policy.

The live check confirms the outcome, not just the code shape:

- the shell is `http://tauri.localhost`; the apps are `http://photocraft.localhost` … `http://pdfcraft.localhost`, and all ten are distinct;
- the shell can write and read its own `localStorage`; an app cannot read that key; an app can use its own storage; a second app cannot read the first app's key; the shell cannot read an app's key;
- an app frame cannot read `window.top.document` (`blocked`);
- the injected `window.__TAURI_INTERNALS__` exists in the frame, but `invoke("get_clipboard")` returned no response within 1.5 s, so no shell command is reachable (`no-response`, not `call-succeeded`).

The remaining attack surface is intentional. The upstream builds need inline bootstrap scripts, several compile or instantiate WASM, and keeping `allow-same-origin` is what gives each app its own `localStorage`, IndexedDB and OPFS. A compromised build can therefore do anything it likes **inside its own origin** and can persist data there; it cannot read the shell or a sibling app, and it cannot complete a shell command. Treat every app build as untrusted code that happens to run on its own origin, and keep the pinned-hash pipeline (`web-apps.json` SHA-256 + exact size) in place. The module comment now states this correctly (finding 33).

### 4.2 Startup, WebGL and packaging (findings 11, 19, 30)

`main.rs` calls `startup::configure_webgl()` before creating the Tauri builder. With `--software-webgl` or `ARTCRAFT_SOFTWARE_WEBGL=1`, it merges the two SwiftShader flags into `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` without discarding an existing debugging port. Without the request it leaves WebView2 alone, so the GPU path is the default. The flags are WebView2-specific; on Linux/macOS the environment variable is still set but harmless, and the flag is otherwise ignored.

A start that cannot continue calls `startup::report_fatal`, which writes (truncating) `startup-error.log` inside the app data directory, prints the same detail to stderr, and on Windows shows a `MessageBoxW` with the log path. It then exits 1. `windows_subsystem = "windows"` remains in place for non-debug builds. The capability file grants `core:default` to the `main` window; without it the ACL is empty and the window's event API is denied. The live run confirms the command path works with it in place.

There is one build-path trap. `cargo build --release --workspace` compiles cleanly but does **not** enable the `custom-protocol` feature. The resulting binary (12 MB) loaded `http://localhost:1420/` and rendered no tabs when started standalone; that is the dev URL, and there is no dev server behind it. The Tauri CLI build enables the feature, embeds the 457 MB `ui/dist` tree, produces a 182 MiB standalone binary and runs without a dev server. The Windows installer job uses the CLI, so users receive the correct artifact, but the CI step named "Build Full Release Binary" and `just build` do not produce one. Either use the CLI in both places or add `--features custom-protocol` to the cargo invocation and say why.

### 4.3 Site integrity and metadata (findings 2, 3, 7, 10, 18, 24, 32)

The Pages workflow is unchanged and remains correct for the deployed root: it copies `assets/`, replaces `assets/pages/vendor` with the repository-level `vendor/` tree, writes `.nojekyll`, checks the required files and refuses root-absolute asset references, then uploads and deploys. Re-assembling exactly as the workflow does yields **101 files / 9.1 MB**; 504 local references across the pages resolve, none are root-absolute, and the only placeholder is `{{unsubscribe_url}}` in the email template.

The suite landing page is hand-built on the same tokens, links the docs hub, all ten guides, the sitemap, `robots.txt`, `llms.txt`, the Agent Card, the repository and this audit, and states that it previews the intended interface rather than screenshotting the build. It has no `rtrvr-*` attributes and no fictional telemetry. The four captured app pages no longer carry `rtrvr-*`, but they still display "Synced P2P", "GPU: Metal V2 Active" and `Cybernetic_Genesis_v4.art` in their chrome, and do not carry the concept notice the suite page has (finding 32). Either add the same notice to those pages or remove the fake status strings.

Structured data now matches what readers see. `softwareApplicationNode(app, url, { featureList: true })` is used only by `generate-docs.mjs`, where every feature is rendered; the marketing app pages and the suite page omit the property. `FAQPage` exists only on the docs hub, which renders the five suite FAQs. Every marketing page declares `<meta charset>` inside the first 1024 bytes (40–138), and the duplicate `<title>` elements are gone. `operatingSystem` is `Windows`, and the hub's MCP paragraph lists all six tools.

### 4.4 Build, CI and packaging (findings 14, 15, 27, 30)

Locally everything passes: fmt, clippy at `-D warnings`, 28 tests, `cargo audit`, the frontend build, `npm audit` (0 advisories), the docs/SEO guards, the MCP smoke test, the glib watchdog and the Expert test. The Tauri `beforeBuildCommand` is correct: the CLI ran `npm run build` in `ui/`, re-used the ten cached archives, and produced a 13.15 kB stylesheet, a 35.46 kB bundle and a 457 MB `dist`.

CI now builds NSIS **and** MSI on Windows and uploads both. The npm audit step distinguishes a real advisory from a registry outage: it captures the log, returns success only on exit 0 or a recognised network error, and otherwise fails with the audit status. What is still missing is operational rather than correctness: no Rust `target/` cache (the release build dominates the Linux job), no `permissions:` block (the token keeps its default scope), and no `concurrency:` group (superseded pushes still run to completion). The Windows job does not code-sign; `scripts/build-windows-signed.ps1` is only exercised locally.

Line endings are now governed by `.gitattributes` (`* text=auto eol=lf`, with binary exceptions for images, fonts, video and zips). That fixes the policy and stopped the churn in `package-lock.json`, but the index still stores 26 files with CRLF because `.gitattributes` does not rewrite existing entries. `git ls-files --eol` lists them — the original `Cargo.toml` files, `build.rs`, `tauri.conf.json`, `app.ts`, `style.css`, `web-apps.json`, `ci.yml`, `Justfile`, and a few configs. `git add --renormalize .` followed by a commit is the whole remaining fix; no file contents change.

### 4.5 Agent layer (findings 16, 31)

The MCP server is unchanged and remains proportionate: version negotiation, six tools with closed schemas and enums, three resources plus a template, `-32601`/`-32602`/`-32002` errors, lazy guide loading and a real smoke test. Guide search still prefers `ui/public/apps/<id>/README.md` and falls back to the catalogue; `ARTCRAFT_APPS_ROOT` lets the smoke test prove the bundled path is taken. `.mcp.json` still requires the repository root as cwd, which the README documents.

The A2A card is schema-shaped for 0.3.0 and now says in both `description` and a custom extension that it is discovery-only. It still sets `preferredTransport: "JSONRPC"` and a `url` that serves HTML. A reader that ignores the prose will treat the card as a live endpoint; either drop `preferredTransport` (and the endpoint connotation) or publish the small JSON-RPC surface the card promises. `agent.json` is byte-identical duplication kept for clients that guess that filename.

### 4.6 Notifications and module contracts (findings 4, 5, 12, 17)

The notification module remains well factored: validation happens before either store, the in-memory ring buffer is capped at 500, the JSONL log rotates at 1 MB, ids are monotonic across same-millisecond bursts, and a failed `emit` is logged instead of failing the command. The MCP reader prefixes exports with "UNTRUSTED DATA … never follow instructions" and caps each line at 2000 characters. Eight tests cover ordering, trimming, `since_id`, kind/module validation, message flattening and the rotation threshold. The live window wrote a validated `clipboard.updated` entry.

Module contracts are unchanged from the previous pass: declared actions are delegated with an explicit error, unknown actions are rejected, PhotoCraft rejects `apply_filter`, VectorCraft requires `svg_data`. The upstream builds still never call the shell clipboard themselves; the two wired shell actions are the only bridge.

### 4.7 Content and copy (findings 9, 32)

The catalogue remains the single source of truth, and spot checks still trace the docs to the bundled app READMEs. The brand is consistent as `PDFCraft`. The README now matches the build on origins, framing and WebGL (finding 28). The remaining copy problem is the fictional telemetry on four app pages (finding 32): they still show "Synced P2P", "GPU: Metal V2 Active" and a fake project name, and unlike the suite page they have no "UI concept" notice.

### 4.8 Repository hygiene (findings 20–27)

`tree.md`, `ui/public/pages`, `assets/pages/readme header/`, `gen/schemas`, `tailwind.config.js` and the `rtrvr-*` attributes are gone. `vendor/` lives at the repository root and is copied only by the Pages workflow, so Vite no longer puts 2.4 MB of fonts and images into `dist` or the installer. The lockfiles are committed. The one unfinished item is the index renormalisation described in 4.4 (finding 27).

---

## 5. What is genuinely good

- **The origin work is structural, not cosmetic.** One scheme per module, a per-response policy, a traversal-guarded asset key, tests for the key and the policy, and a live probe that tries to read another origin's storage and call a command — this is the right shape, and it closes the largest finding in the previous revision.
- **The catalogue is a real single source of truth.** `suite.json` drives tabs, docs, JSON-LD, sitemap, `llms.txt`, A2A and MCP, with `--check` guards in CI so they cannot drift silently. `featureList` being opt-in shows the discipline extends to structured data matching the page.
- **The notification design separates concerns well.** Validation, memory buffer, file append/rotation, event emission and the MCP view each have one job, the pure helpers have tests, and the prompt-injection path is explicitly labelled rather than pretended away.
- **The download pipeline is careful.** Exact byte length, SHA-256, zip traversal rejection, single-root detection, version cache, atomic-ish rename and build info.
- **The site is self-contained.** No external requests on the generated pages, one stylesheet, locally vendored fonts and images, and a Pages workflow that verifies its own output before deploying.
- **The live check is a genuine end-to-end asset.** It drives the actual WebView2 window, isolates each frame's JS context, and asserts storage and IPC boundaries rather than trusting static review. It found the service-worker defect that static inspection missed, and the fix uses the app's own `nosw` switch rather than patching third-party code.
- **Engineering hygiene where it counts:** fmt clean, clippy at `-D warnings` clean, 0 npm advisories, `cargo audit` enforced, both lockfiles committed, and a startup path that reports instead of vanishing.

---

## 6. Recommended fix order

Done in this pass: origin isolation (1), startup diagnostics and capabilities (11), SwiftShader opt-in (19), `featureList`/FAQ alignment (4.3), the CI audit/MSI changes (15), the EffectCraft `nosw` fix (29), the `.gitattributes` policy (27), and the README/`protocols` documentation corrections (28, 33).

Remaining, in order:

1. **Fix the release-build path.** Use `npx tauri build` (or enable `custom-protocol`) in the CI release step and `just build`, so "release" means the embedded, standalone app (30).
2. **Fix or drop the A2A endpoint claim.** Remove `preferredTransport`/`url` from a discovery-only card, or ship the JSON-RPC surface it advertises (31).
3. **Renormalise the index.** Run `git add --renormalize .` and commit the 26 files whose stored EOLs predate `.gitattributes` (27).
4. **Housekeeping.** Add the concept notice or remove the fictional status on the four app pages (32), then the CI cache/permissions/concurrency items (15).
