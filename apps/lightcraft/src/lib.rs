use craft_libs::{CraftModule, ModuleAction};
use serde_json::{json, Value};
use tauri::AppHandle;

pub struct LightCraftModule;
impl CraftModule for LightCraftModule {
    fn id(&self) -> &str { "lightcraft" }
    fn name(&self) -> &str { "LightCraft" }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction { id: "adjust_white_balance".into(), label: "White Balance".into(), icon: "🌡️".into(), category: "RAW".into() },
            ModuleAction { id: "apply_tone_curve".into(), label: "Tone Curve".into(), icon: "📈".into(), category: "Light".into() },
            ModuleAction { id: "sync_edits".into(), label: "Sync Edits".into(), icon: "🔄".into(), category: "Batch".into() },
        ]
    }
    fn handle_action(&self, _app: &AppHandle, action: &str, _payload: Value) -> Result<Value, String> {
        Ok(json!({ "status": "success", "action": action }))
    }
}
