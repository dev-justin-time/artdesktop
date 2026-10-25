use craft_libs::{CraftModule, ModuleAction};
use serde_json::Value;
use tauri::AppHandle;

pub struct WordCraftModule;
impl CraftModule for WordCraftModule {
    fn id(&self) -> &str {
        "wordcraft"
    }
    fn name(&self) -> &str {
        "WordCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction {
                id: "insert_text".into(),
                label: "Insert Text".into(),
                icon: "📝".into(),
                category: "Edit".into(),
            },
            ModuleAction {
                id: "apply_style".into(),
                label: "Apply Style".into(),
                icon: "🅰️".into(),
                category: "Format".into(),
            },
            ModuleAction {
                id: "export_pdf".into(),
                label: "Export PDF".into(),
                icon: "📕".into(),
                category: "File".into(),
            },
        ]
    }
    fn handle_action(
        &self,
        _app: &AppHandle,
        action: &str,
        _payload: Value,
    ) -> Result<Value, String> {
        craft_libs::dispatch_delegated(
            self.id(),
            action,
            &["insert_text", "apply_style", "export_pdf"],
        )
    }
}
