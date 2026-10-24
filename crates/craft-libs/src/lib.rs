use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter, Runtime};

// ==========================================
// 1. SHARED MEMORY (Zero Serialization Overhead)
// ==========================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub source_module: String,
    pub data_type: String, // "image/png", "image/svg+xml", "text/plain"
    pub payload: String,   // Base64 encoded for binary data
}

#[derive(Default, Clone)]
pub struct SharedState {
    pub global_clipboard: Arc<RwLock<Option<ClipboardItem>>>,
}

impl SharedState {
    /// Stores an item and notifies the frontend so every panel refreshes.
    pub fn set_clipboard<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        item: ClipboardItem,
    ) -> Result<(), String> {
        self.store_and_notify(item, |item| app.emit("clipboard-updated", item))
    }

    fn store_and_notify<F, E>(&self, item: ClipboardItem, notify: F) -> Result<(), String>
    where
        F: FnOnce(&ClipboardItem) -> Result<(), E>,
        E: std::fmt::Display,
    {
        {
            let mut clip = self.global_clipboard.write().map_err(|e| e.to_string())?;
            *clip = Some(item.clone());
        }
        notify(&item).map_err(|e| e.to_string())
    }
}

// ==========================================
// 2. MODULE TRAIT & CAPABILITIES
// ==========================================
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleAction {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub category: String,
}

pub trait CraftModule: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn capabilities(&self) -> Vec<ModuleAction>;
    fn handle_action(&self, app: &AppHandle, action: &str, payload: Value)
        -> Result<Value, String>;
}

// ==========================================
// 3. MODULE REGISTRY
// ==========================================
pub struct ModuleRegistry {
    modules: HashMap<String, Box<dyn CraftModule>>,
}

impl ModuleRegistry {
    pub fn new() -> Self {
        Self {
            modules: HashMap::new(),
        }
    }

    pub fn register<M: CraftModule + 'static>(&mut self, module: M) {
        self.modules
            .insert(module.id().to_string(), Box::new(module));
    }

    pub fn get(&self, id: &str) -> Option<&dyn CraftModule> {
        self.modules.get(id).map(|m| m.as_ref())
    }
}

impl Default for ModuleRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn clipboard_item() -> ClipboardItem {
        ClipboardItem {
            source_module: "vectorcraft".into(),
            data_type: "image/svg+xml".into(),
            payload: "PHN2Zy8+".into(),
        }
    }

    #[test]
    fn clipboard_starts_empty() {
        let state = SharedState::default();
        assert!(state.global_clipboard.read().unwrap().is_none());
    }

    #[test]
    fn stores_item_and_notifies_listener() {
        let state = SharedState::default();
        let notified = RefCell::new(None);

        state
            .store_and_notify(clipboard_item(), |item| {
                *notified.borrow_mut() = Some(item.clone());
                Ok::<(), String>(())
            })
            .expect("store should succeed");

        let stored = state
            .global_clipboard
            .read()
            .unwrap()
            .clone()
            .expect("item should be stored");
        assert_eq!(stored.source_module, "vectorcraft");

        let notified = notified.into_inner().expect("listener should be called");
        assert_eq!(notified.data_type, "image/svg+xml");
        assert_eq!(notified.payload, stored.payload);
    }

    #[test]
    fn notification_errors_are_returned() {
        let state = SharedState::default();

        let error = state
            .store_and_notify(clipboard_item(), |_| Err::<(), _>("emit failed"))
            .unwrap_err();

        assert_eq!(error, "emit failed");
        // The item is still stored so the backend state matches what the UI saw before the error.
        assert!(state.global_clipboard.read().unwrap().is_some());
    }

    #[test]
    fn clipboard_item_serializes_for_the_frontend() {
        let value = serde_json::to_value(clipboard_item()).expect("item should serialize");
        assert_eq!(value["source_module"], "vectorcraft");
        assert_eq!(value["data_type"], "image/svg+xml");
        assert_eq!(value["payload"], "PHN2Zy8+");
    }
}
