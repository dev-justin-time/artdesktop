use craft_libs::{CraftModule, ModuleAction};
use serde_json::Value;
use tauri::AppHandle;

pub struct GridCraftModule;
impl CraftModule for GridCraftModule {
    fn id(&self) -> &str {
        "gridcraft"
    }
    fn name(&self) -> &str {
        "GridCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction {
                id: "add_row".into(),
                label: "Add Row".into(),
                icon: "➕".into(),
                category: "Cells".into(),
            },
            ModuleAction {
                id: "apply_formula".into(),
                label: "Formula".into(),
                icon: "🧮".into(),
                category: "Data".into(),
            },
            ModuleAction {
                id: "export_csv".into(),
                label: "Export CSV".into(),
                icon: "📊".into(),
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
            &["add_row", "apply_formula", "export_csv"],
        )
    }
}
