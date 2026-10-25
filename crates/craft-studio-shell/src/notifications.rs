use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_ENTRIES: usize = 500;
const MAX_LOG_BYTES: u64 = 1_048_576;
const MAX_MESSAGE_CHARS: usize = 512;
const MAX_MODULE_CHARS: usize = 32;
const LOG_FILE: &str = "agent-notifications.jsonl";
const EVENT_NAME: &str = "agent-notification";

/// Producers the shell accepts. Anything else is rejected so a compromised frame
/// cannot invent event types for an agent to act on. Extend this list when a new
/// producer is added.
const ALLOWED_KINDS: [&str; 2] = ["module.activated", "clipboard.updated"];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNotification {
    pub id: u64,
    pub timestamp_ms: u64,
    pub kind: String,
    pub module: Option<String>,
    pub message: String,
    pub payload: Value,
}

#[derive(Default)]
struct Inner {
    last_id: u64,
    entries: Vec<AgentNotification>,
}

#[derive(Default)]
pub struct AgentNotifier(Mutex<Inner>);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(LOG_FILE))
        .map_err(|error| error.to_string())
}

/// Collapses control characters and caps the length, so a frame cannot flood the log
/// or smuggle terminal/format characters into an agent's context.
fn clean_message(message: &str) -> String {
    let mut cleaned = String::with_capacity(message.len().min(MAX_MESSAGE_CHARS));
    let mut last_was_space = false;
    for character in message.chars() {
        let next = if character.is_control() {
            ' '
        } else {
            character
        };
        if next.is_whitespace() {
            if last_was_space {
                continue;
            }
            last_was_space = true;
        } else {
            last_was_space = false;
        }
        if cleaned.chars().count() >= MAX_MESSAGE_CHARS {
            cleaned.push('…');
            break;
        }
        cleaned.push(next);
    }
    cleaned.trim().to_string()
}

/// Validates the fields a producer controls and returns the values that may be stored.
fn sanitize(
    kind: &str,
    module: Option<String>,
    message: &str,
) -> Result<(String, Option<String>, String), String> {
    let kind = kind.trim();
    if !ALLOWED_KINDS.contains(&kind) {
        return Err(format!(
            "Unsupported notification kind: '{kind}'; expected one of: {}",
            ALLOWED_KINDS.join(", ")
        ));
    }

    let module = module
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(module) = &module {
        let valid = module.len() <= MAX_MODULE_CHARS
            && module
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_');
        if !valid {
            return Err(format!("Invalid module id: '{module}'"));
        }
    }

    Ok((kind.to_string(), module, clean_message(message)))
}

fn next_id(inner: &mut Inner, timestamp_ms: u64) -> u64 {
    let id = timestamp_ms
        .saturating_mul(1000)
        .max(inner.last_id.saturating_add(1));
    inner.last_id = id;
    id
}

fn trim(entries: &mut Vec<AgentNotification>) {
    if entries.len() > MAX_ENTRIES {
        let overflow = entries.len() - MAX_ENTRIES;
        entries.drain(..overflow);
    }
}

fn record(
    inner: &mut Inner,
    kind: String,
    module: Option<String>,
    message: String,
    payload: Value,
    timestamp_ms: u64,
) -> AgentNotification {
    let notification = AgentNotification {
        id: next_id(inner, timestamp_ms),
        timestamp_ms,
        kind,
        module,
        message,
        payload,
    };
    inner.entries.push(notification.clone());
    trim(&mut inner.entries);
    notification
}

fn visible(entries: &[AgentNotification], since_id: Option<u64>) -> Vec<AgentNotification> {
    entries
        .iter()
        .filter(|entry| since_id.is_none_or(|id| entry.id > id))
        .cloned()
        .collect()
}

fn should_rotate(current_len: u64) -> bool {
    current_len >= MAX_LOG_BYTES
}

/// Keeps one previous generation so the log cannot grow without bound.
fn rotate_if_needed(path: &Path) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };
    if !should_rotate(metadata.len()) {
        return;
    }
    let previous = path.with_file_name(format!("{LOG_FILE}.1"));
    let _ = std::fs::remove_file(&previous);
    if let Err(error) = std::fs::rename(path, &previous) {
        eprintln!("agent notifications: cannot rotate log: {error}");
    }
}

fn append_to_log(app: &AppHandle, notification: &AgentNotification) {
    let Ok(path) = log_path(app) else {
        eprintln!("agent notifications: app data directory unavailable");
        return;
    };
    if let Some(parent) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            eprintln!(
                "agent notifications: cannot create {}: {error}",
                parent.display()
            );
            return;
        }
    }
    let line = match serde_json::to_string(notification) {
        Ok(line) => line,
        Err(error) => {
            eprintln!("agent notifications: cannot serialize: {error}");
            return;
        }
    };
    rotate_if_needed(&path);
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut file) => {
            if let Err(error) = writeln!(file, "{line}") {
                eprintln!(
                    "agent notifications: cannot write {}: {error}",
                    path.display()
                );
            }
        }
        Err(error) => eprintln!(
            "agent notifications: cannot open {}: {error}",
            path.display()
        ),
    }
}

#[tauri::command]
pub fn notify_agents(
    app: AppHandle,
    state: State<'_, AgentNotifier>,
    kind: String,
    module: Option<String>,
    message: String,
    payload: Option<Value>,
) -> Result<AgentNotification, String> {
    let (kind, module, message) = sanitize(&kind, module, &message)?;
    let timestamp_ms = now_ms();

    let notification = {
        let mut inner = state.0.lock().map_err(|error| error.to_string())?;
        record(
            &mut inner,
            kind,
            module,
            message,
            payload.unwrap_or(Value::Null),
            timestamp_ms,
        )
    };

    append_to_log(&app, &notification);
    // The entry is already stored and logged, so a failing emit is not a failed call.
    if let Err(error) = app.emit(EVENT_NAME, &notification) {
        eprintln!("agent notifications: cannot emit {EVENT_NAME}: {error}");
    }
    Ok(notification)
}

#[tauri::command]
pub fn get_agent_notifications(
    state: State<'_, AgentNotifier>,
    since_id: Option<u64>,
) -> Result<Vec<AgentNotification>, String> {
    let inner = state.0.lock().map_err(|error| error.to_string())?;
    Ok(visible(&inner.entries, since_id))
}

#[tauri::command]
pub fn get_agent_notification_log_path(app: AppHandle) -> Result<String, String> {
    log_path(&app).map(|path| path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push(inner: &mut Inner, kind: &str, message: &str, timestamp_ms: u64) -> AgentNotification {
        let (kind, module, message) = sanitize(kind, Some("photocraft".into()), message)
            .expect("test notification should validate");
        record(inner, kind, module, message, Value::Null, timestamp_ms)
    }

    #[test]
    fn notification_ids_stay_ordered_within_one_millisecond() {
        let mut inner = Inner::default();
        let mut previous = 0;
        // More than 1000 events in the same millisecond used to reuse an id.
        for _ in 0..1_500 {
            let id = push(&mut inner, "module.activated", "opened", 1_700_000_000_000).id;
            assert!(id > previous, "ids must increase: {id} after {previous}");
            previous = id;
        }
    }

    #[test]
    fn ids_follow_the_clock_across_milliseconds() {
        let mut inner = Inner::default();
        let first = push(&mut inner, "module.activated", "opened", 1_000).id;
        let second = push(&mut inner, "module.activated", "opened", 2_000).id;
        assert_eq!(first, 1_000_000);
        assert_eq!(second, 2_000_000);
    }

    #[test]
    fn memory_buffer_keeps_the_newest_entries() {
        let mut inner = Inner::default();
        for index in 0..(MAX_ENTRIES + 25) {
            push(&mut inner, "module.activated", &format!("opened {index}"), 5_000);
        }
        assert_eq!(inner.entries.len(), MAX_ENTRIES);
        assert_eq!(
            inner.entries.last().map(|entry| entry.message.as_str()),
            Some("opened 524")
        );
        assert_eq!(
            inner.entries.first().map(|entry| entry.message.as_str()),
            Some("opened 25")
        );
    }

    #[test]
    fn since_id_returns_only_newer_entries() {
        let mut inner = Inner::default();
        let first = push(&mut inner, "module.activated", "opened", 1_000);
        let second = push(&mut inner, "clipboard.updated", "copied", 1_001);

        assert_eq!(visible(&inner.entries, None).len(), 2);
        let newer = visible(&inner.entries, Some(first.id));
        assert_eq!(newer.len(), 1);
        assert_eq!(newer[0].id, second.id);
        assert!(visible(&inner.entries, Some(second.id)).is_empty());
    }

    #[test]
    fn unknown_kinds_are_rejected() {
        let error = sanitize("shell.eval", None, "run this").expect_err("unknown kind must fail");
        assert!(error.contains("Unsupported notification kind"), "{error}");
    }

    #[test]
    fn invalid_module_ids_are_rejected() {
        assert!(sanitize("module.activated", Some("../etc".into()), "hi").is_err());
        assert!(sanitize("module.activated", Some("x".repeat(MAX_MODULE_CHARS + 1)), "hi").is_err());
        assert!(sanitize("module.activated", Some("pdfcraft".into()), "hi").is_ok());
        assert!(sanitize("module.activated", Some("  ".into()), "hi")
            .expect("empty module is allowed")
            .1
            .is_none());
    }

    #[test]
    fn messages_are_flattened_and_capped() {
        let (_, _, cleaned) = sanitize(
            "clipboard.updated",
            None,
            &format!("line one\nline two\u{7}{}", "x".repeat(MAX_MESSAGE_CHARS * 2)),
        )
        .expect("message should validate");
        assert!(!cleaned.contains('\n'));
        assert!(!cleaned.contains('\u{7}'));
        assert_eq!(cleaned.chars().count(), MAX_MESSAGE_CHARS + 1);
        assert!(cleaned.ends_with('…'));
    }

    #[test]
    fn log_rotates_at_the_byte_cap() {
        assert!(!should_rotate(MAX_LOG_BYTES - 1));
        assert!(should_rotate(MAX_LOG_BYTES));
        assert!(should_rotate(MAX_LOG_BYTES + 1));
    }
}
