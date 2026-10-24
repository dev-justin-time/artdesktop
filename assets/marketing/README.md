# ArtCraft Studio — launch marketing kit

Accurate launch assets for the current proof-of-concept build. The visuals use the dark-obsidian / neon-cyan / violet language of the app; the copy only claims what the repository actually does.

## Assets

| File | Size | Use |
|---|---|---|
| [`social-card.png`](social-card.png) | 1200 × 1200 (1:1) | Instagram, X, LinkedIn, community posts |
| [`display-banner.png`](display-banner.png) | 1920 × 1080 (16:9) | Web banners, sponsorship slots, developer-platform headers |
| [`email-header.png`](email-header.png) | 1600 × 900 (16:9) | Newsletter hero / launch-email header |
| [`launch-email.html`](launch-email.html) | responsive HTML | Launch email template |

![Social card](social-card.png)

![Display banner](display-banner.png)

![Email header](email-header.png)

## Headlines and copy

- **Primary:** One workspace. Ten creative modules.
- **Supporting:** Rust + Tauri 2.0 shell · shared module registry · IPC clipboard.
- **Proof line:** Ten interactive module pages. Two live Rust pipelines.
- **Status:** Open-source proof of concept · Apache-2.0.
- **Call to action:** Explore the source / Browse the source / Read the audit.

## Claims corrected from the original brief

The first draft repeated claims that do not match the repository:

| Original claim | What the kit now says | Why |
|---|---|---|
| “Built with Rust & WebGPU” | “Rust + Tauri 2.0” | The app renders in the platform WebView through Tauri; there is no WebGPU renderer. |
| “Zero Latency” | “Two working pipelines” / “Eight interactive mockups” | Payloads cross Tauri IPC as Base64 strings; latency is not zero and was never measured. |
| “10 Creative Engines” | “Ten creative modules” | All ten embed pages, but eight keep their Rust actions as stubs. |
| “Download Free” | “Explore the source” | No installer, store listing or published binary exists. |
| `cargo install artcraft-studio` | `git clone …` + `cargo build --workspace` | The crate is not published to crates.io. |
| “v1.0 Launch Edition” | “v0.1 · Proof of concept” | Bundling, native file workflows and most module actions are still open. |

## Using the email

1. Open `launch-email.html` in a browser for the local preview.
2. Host `email-header.png` and replace the relative `src` with the absolute URL before sending.
3. Replace `{{unsubscribe_url}}` with the list provider’s unsubscribe link.
4. Keep the “what this is — and what it isn’t” block; it is the honest counterweight to launch copy.

## Files

The three PNGs are self-contained and ready to upload. The email template references `email-header.png` locally; host the image and update the `src` before sending.
