use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::AppHandle;

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
    fn handle_action(&self, app: &AppHandle, action: &str, payload: Value) -> Result<Value, String>;
}

// ==========================================
// 3. MODULE REGISTRY
// ==========================================
pub struct ModuleRegistry {
    modules: HashMap<String, Box<dyn CraftModule>>,
}

impl ModuleRegistry {
    pub fn new() -> Self { Self { modules: HashMap::new() } }
    
    pub fn register<M: CraftModule + 'static>(&mut self, module: M) {
        self.modules.insert(module.id().to_string(), Box::new(module));
    }
    
    pub fn get(&self, id: &str) -> Option<&dyn CraftModule> {
        self.modules.get(id).map(|m| m.as_ref())
    }
}

