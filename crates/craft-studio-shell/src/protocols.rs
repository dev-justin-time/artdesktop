//! One browser origin per app.
//!
//! The shell document is served from Tauri's own origin (`tauri://localhost`,
//! `http://tauri.localhost` on Windows). Each module's web build is served from a
//! custom-protocol scheme named after the module (`photocraft://localhost/…`,
//! `http://photocraft.localhost/…` on Windows), so a frame that runs an upstream
//! build sits on an origin of its own.
//!
//! That is what makes the sandbox honest: a frame keeps `allow-same-origin` so the
//! app's own `localStorage`, IndexedDB and OPFS work, but "same origin" now means
//! that one app. It cannot read the shell's storage, cannot read another app's
//! storage, and does not receive `window.__TAURI_INTERNALS__` (Tauri does not
//! expose its IPC bridge to foreign origins), so it cannot call shell commands.
//!
//! Each response carries its own policy: the configured CSP is written for the
//! shell document and includes the shell's `connect-src`/`ipc:` allowances, which
//! an app document has no business inheriting.

use std::borrow::Cow;
use std::path::PathBuf;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Runtime};

const MAX_MODULE_ID_CHARS: usize = 32;
const INDEX: &str = "index.html";
const QUERY: &str = "?webgl";

/// Policy for documents and assets served from an app origin.
///
/// Two deliberate differences from the shell's policy:
///
/// * no `frame-ancestors`: the app origins exist to be framed by the shell, and the
///   shell's own `frame-src` is what decides who may embed the shell. Inheriting
///   the shell's `frame-ancestors 'none'` here would block the frame outright,
///   because the shell is a different origin now.
/// * `script-src` allows inline script, because the upstream builds ship inline
///   bootstrap scripts. They are third-party code running inside their own origin
///   with no IPC bridge, so allowing their inline script cannot reach the shell.
///
/// `ipc:` is deliberately absent: an app document has no business talking to the
/// shell's IPC endpoint.
pub const APP_CSP: &str = "default-src 'self'; script-src 'self' 'unsafe-inline'; \
style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; \
connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

struct Served {
    bytes: Vec<u8>,
    mime: String,
}

/// Where the frontend put the extracted upstream builds, for debug builds only.
fn dev_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ui/public")
}

/// The URL the shell mounts for a module.
///
/// WebView2 maps custom protocols onto `http://<scheme>.localhost`, WebKitGTK and
/// WKWebView keep `<scheme>://localhost`, so the same scheme name yields a distinct
/// origin on every platform.
pub fn frame_url(module: &str) -> String {
    if cfg!(windows) {
        format!("http://{module}.localhost/{INDEX}{QUERY}")
    } else {
        format!("{module}://localhost/{INDEX}{QUERY}")
    }
}

/// Same rules the notification log applies to module ids, so a scheme can never be
/// registered for something that is not a registered module.
fn valid_module_id(module: &str) -> bool {
    !module.is_empty()
        && module.len() <= MAX_MODULE_ID_CHARS
        && module.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = input.get(index + 1..index + 3)?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/// Maps a request path onto an embedded asset key inside `apps/<module>/`.
///
/// Rejects anything that could escape that directory, because the key is also used
/// to read from disk in debug builds.
pub fn asset_key(module: &str, request_path: &str) -> Option<String> {
    if !valid_module_id(module) {
        return None;
    }
    let path = request_path.split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_decode(path)?.replace('\\', "/");
    let mut segments: Vec<&str> = decoded
        .trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments
        .iter()
        .any(|segment| *segment == ".." || *segment == "." || segment.contains('\0'))
    {
        return None;
    }
    if segments.is_empty() || decoded.ends_with('/') {
        segments.push(INDEX);
    }
    Some(format!("apps/{module}/{}", segments.join("/")))
}

fn mime_for(path: &str) -> &'static str {
    let extension = path
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "html" | "htm" => "text/html",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" | "map" => "application/json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

fn dev_asset(key: &str) -> Option<Served> {
    // Release builds embed the frontend, so there is nothing to read from disk.
    if !cfg!(debug_assertions) {
        return None;
    }
    let bytes = std::fs::read(dev_root().join(key)).ok()?;
    Some(Served {
        bytes,
        mime: mime_for(key).to_string(),
    })
}

fn load<R: Runtime>(app: &AppHandle<R>, key: &str) -> Option<Served> {
    // The resolver reads the embedded asset in release builds and falls back to
    // `frontendDist` on disk in dev; `ui/public` is the second dev fallback because
    // `npm run dev` serves the extracted builds from there.
    if let Some(asset) = app.asset_resolver().get(key.to_string()) {
        return Some(Served {
            bytes: asset.bytes,
            mime: asset.mime_type,
        });
    }
    dev_asset(key)
}

fn response(status: StatusCode, mime: &str, bytes: Vec<u8>) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_SECURITY_POLICY, APP_CSP)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(Cow::Owned(bytes))
        .unwrap_or_else(|_| Response::new(Cow::Owned(Vec::new())))
}

fn not_found<R: Runtime>(
    app: &AppHandle<R>,
    module: &str,
    reason: &str,
) -> Response<Cow<'static, [u8]>> {
    let detail = if app
        .asset_resolver()
        .get(format!("apps/{module}/{INDEX}"))
        .is_some()
    {
        format!("{module}: {reason}")
    } else {
        format!(
            "{module}: no embedded web build found. Run `npm run build` in crates/craft-studio-shell/ui \
             to extract the pinned app builds ({reason})"
        )
    };
    response(
        StatusCode::NOT_FOUND,
        "text/plain; charset=utf-8",
        detail.into_bytes(),
    )
}

/// Handles one request on `<module>://localhost/…`.
pub fn serve<R: Runtime>(
    app: &AppHandle<R>,
    module: &str,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let Some(key) = asset_key(module, request.uri().path()) else {
        return response(
            StatusCode::BAD_REQUEST,
            "text/plain; charset=utf-8",
            b"invalid asset path".to_vec(),
        );
    };
    match load(app, &key) {
        Some(asset) => response(StatusCode::OK, &asset.mime, asset.bytes),
        None => not_found(app, module, &format!("{} is missing", key)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_requests_resolve_to_the_index() {
        assert_eq!(
            asset_key("photocraft", "/").as_deref(),
            Some("apps/photocraft/index.html")
        );
        assert_eq!(
            asset_key("photocraft", "").as_deref(),
            Some("apps/photocraft/index.html")
        );
        assert_eq!(
            asset_key("photocraft", "/assets/").as_deref(),
            Some("apps/photocraft/assets/index.html")
        );
    }

    #[test]
    fn nested_paths_stay_inside_the_module_directory() {
        assert_eq!(
            asset_key("filmcraft", "/assets/index-abc123.js?webgl").as_deref(),
            Some("apps/filmcraft/assets/index-abc123.js")
        );
        assert_eq!(
            asset_key("filmcraft", "/my%20font.woff2").as_deref(),
            Some("apps/filmcraft/my font.woff2")
        );
    }

    #[test]
    fn traversal_and_unknown_modules_are_rejected() {
        assert_eq!(asset_key("photocraft", "/../tauri.conf.json"), None);
        assert_eq!(asset_key("photocraft", "/assets/../../Cargo.toml"), None);
        assert_eq!(asset_key("photocraft", "/..%2f..%2fetc%2fpasswd"), None);
        assert_eq!(asset_key("photocraft", "/./index.html"), None);
        assert_eq!(asset_key("../photocraft", "/index.html"), None);
        assert_eq!(asset_key("photo craft", "/index.html"), None);
        assert_eq!(asset_key("", "/index.html"), None);
    }

    #[test]
    fn frame_urls_use_one_origin_per_module() {
        let photocraft = frame_url("photocraft");
        let deckcraft = frame_url("deckcraft");
        assert_ne!(photocraft, deckcraft);
        assert!(photocraft.ends_with(&format!("/{INDEX}{QUERY}")));
        if cfg!(windows) {
            assert_eq!(photocraft, "http://photocraft.localhost/index.html?webgl");
        } else {
            assert_eq!(photocraft, "photocraft://localhost/index.html?webgl");
        }
    }

    #[test]
    fn mime_types_cover_the_bundled_assets() {
        assert_eq!(mime_for("apps/a/index.html"), "text/html");
        assert_eq!(mime_for("apps/a/assets/main.JS"), "text/javascript");
        assert_eq!(mime_for("apps/a/font.woff2"), "font/woff2");
        assert_eq!(mime_for("apps/a/readme"), "application/octet-stream");
    }

    #[test]
    fn the_app_policy_does_not_grant_the_shell_ipc_scheme() {
        assert!(!APP_CSP.contains("ipc:"));
        assert!(!APP_CSP.contains("frame-ancestors"));
    }
}
