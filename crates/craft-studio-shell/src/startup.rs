//! Startup diagnostics and the one runtime choice the shell makes before Tauri boots.
//!
//! Release builds carry `windows_subsystem = "windows"`, so there is no console
//! attached and a message on stderr is invisible. A failed start now also writes
//! `startup-error.log` next to the app's data (the same directory as the agent
//! notification log) and shows a message box on Windows, so the failure is
//! something a user can report instead of a window that silently never appears.

use std::io::Write;
use std::path::{Path, PathBuf};

/// Must match `identifier` in `tauri.conf.json`, which is what Tauri's
/// `app_data_dir` appends to the platform data directory.
const IDENTIFIER: &str = "com.storytold.artcraft";
pub const ERROR_LOG: &str = "startup-error.log";

/// The WebView2 flags that put the webview on software WebGL.
///
/// EffectCraft needs this path; on a machine with a working GPU the other nine
/// apps are slower for no benefit, so it is opt-in per launch rather than a fixed
/// part of `tauri.conf.json`. Pass `--software-webgl`, or set
/// `ARTCRAFT_SOFTWARE_WEBGL=1` (useful for a shortcut or a CI run).
const SOFTWARE_WEBGL_FLAGS: [&str; 2] = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

fn enabled(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn is_software_webgl_flag(args: &[String]) -> bool {
    args.iter().any(|arg| arg == "--software-webgl")
}

fn software_webgl_requested(args: &[String]) -> bool {
    is_software_webgl_flag(args)
        || std::env::var("ARTCRAFT_SOFTWARE_WEBGL").is_ok_and(|value| enabled(&value))
}

/// Merges the software-WebGL flags into the WebView2 argument environment variable.
///
/// Tauri passes no `additionalBrowserArgs` of its own, so WebView2 honours
/// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`; anything already in it (a debugging
/// port, for example) is preserved. Returns whether the flags were applied.
pub fn configure_webgl() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if !software_webgl_requested(&args) {
        return false;
    }

    let mut value = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    for flag in SOFTWARE_WEBGL_FLAGS {
        if value.split_whitespace().any(|existing| existing == flag) {
            continue;
        }
        if !value.is_empty() {
            value.push(' ');
        }
        value.push_str(flag);
    }
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", value);
    true
}

/// The app's data directory, mirroring Tauri's `app_data_dir` without needing a
/// running app (a start that never reaches `setup` still has to report itself).
fn data_dir() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
        })
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(|home| PathBuf::from(home).join(".local").join("share"))
            })
    };
    base.map(|base| base.join(IDENTIFIER))
}

/// Writes the failure to `dir/startup-error.log`, replacing the previous one so a
/// stale error is never mistaken for the current start.
pub fn write_error_log(dir: &Path, message: &str) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(ERROR_LOG);
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)?;
    writeln!(file, "{message}")?;
    Ok(path)
}

/// Reports a start that cannot continue: log file, stderr, and a dialog on Windows.
pub fn report_fatal(message: &str) {
    let detail = match data_dir().map(|dir| write_error_log(&dir, message)) {
        Some(Ok(path)) => format!(
            "{message}\n\nThe details were written to:\n{}",
            path.display()
        ),
        Some(Err(error)) => format!("{message}\n\nThe log could not be written: {error}"),
        None => message.to_string(),
    };
    eprintln!("ArtCraft Studio: {detail}");
    show_dialog(&detail);
}

#[cfg(windows)]
fn show_dialog(message: &str) {
    use std::os::windows::ffi::OsStrExt;

    const MB_OK: u32 = 0x0000_0000;
    const MB_ICONERROR: u32 = 0x0000_0010;
    // MessageBoxW caps the text near 1024 characters; keep well inside it.
    const MAX_CHARS: usize = 1000;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            window: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            kind: u32,
        ) -> i32;
    }

    fn wide(value: &str) -> Vec<u16> {
        std::ffi::OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let truncated: String = message.chars().take(MAX_CHARS).collect();
    let text = wide(&truncated);
    let caption = wide("ArtCraft Studio could not start");
    // SAFETY: both buffers are null-terminated UTF-16 and outlive the call; a null
    // owner window makes the dialog application-modal, which is what a start that
    // is about to exit wants.
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR,
        )
    };
}

#[cfg(not(windows))]
fn show_dialog(_message: &str) {
    // stderr already carries the message on the other platforms.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_flag_is_opt_in() {
        assert!(!is_software_webgl_flag(&[]));
        assert!(!is_software_webgl_flag(&["--webgl".into()]));
        assert!(is_software_webgl_flag(&["--software-webgl".into()]));
    }

    #[test]
    fn the_environment_variable_accepts_the_usual_spellings() {
        assert!(enabled("1"));
        assert!(enabled(" TRUE "));
        assert!(enabled("on"));
        assert!(!enabled(""));
        assert!(!enabled("0"));
        assert!(!enabled("no"));
    }

    #[test]
    fn the_error_log_is_written_and_replaced() {
        let dir =
            std::env::temp_dir().join(format!("artcraft-startup-test-{}", std::process::id()));
        let first = write_error_log(&dir, "first failure").expect("log should be written");
        assert!(first.ends_with(ERROR_LOG));
        assert_eq!(
            std::fs::read_to_string(&first).unwrap().trim(),
            "first failure"
        );

        let second = write_error_log(&dir, "second failure").expect("log should be rewritten");
        assert_eq!(second, first);
        assert_eq!(
            std::fs::read_to_string(&second).unwrap().trim(),
            "second failure"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
