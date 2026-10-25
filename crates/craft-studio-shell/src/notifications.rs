use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const MAX_ENTRIES: usize = 500;
const LOG_FILE: &str = "agent-notifications.jsonl";
const EVENT_NAME: &str = "agent-notification";

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
    next_id: u64,
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
    let timestamp_ms = now_ms();
    let notification = {
        let mut inner = state.0.lock().map_err(|error| error.to_string())?;
        inner.next_id = inner.next_id.wrapping_add(1);
        let notification = AgentNotification {
            id: timestamp_ms
                .saturating_mul(1000)
                .saturating_add(inner.next_id % 1000),
            timestamp_ms,
            kind,
            module,
            message,
            payload: payload.unwrap_or(Value::Null),
        };
        inner.entries.push(notification.clone());
        if inner.entries.len() > MAX_ENTRIES {
            let overflow = inner.entries.len() - MAX_ENTRIES;
            inner.entries.drain(..overflow);
        }
        notification
    };

    append_to_log(&app, &notification);
    app.emit(EVENT_NAME, &notification)
        .map_err(|error| error.to_string())?;
    Ok(notification)
}

#[tauri::command]
pub fn get_agent_notifications(
    state: State<'_, AgentNotifier>,
    since_id: Option<u64>,
) -> Result<Vec<AgentNotification>, String> {
    let inner = state.0.lock().map_err(|error| error.to_string())?;
    Ok(inner
        .entries
        .iter()
        .filter(|entry| since_id.is_none_or(|id| entry.id > id))
        .cloned()
        .collect())
}

#[tauri::command]
pub fn get_agent_notification_log_path(app: AppHandle) -> Result<String, String> {
    log_path(&app).map(|path| path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_ids_are_monotonic() {
        let mut inner = Inner::default();
        let mut previous = 0;
        for _ in 0..3 {
            inner.next_id += 1;
            let id = 1_700_000_000_000u64
                .saturating_mul(1000)
                .saturating_add(inner.next_id % 1000);
            assert!(id > previous);
            previous = id;
        }
    }
}
