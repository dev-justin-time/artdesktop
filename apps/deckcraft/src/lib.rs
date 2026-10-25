use craft_libs::{CraftModule, ModuleAction};
use serde_json::Value;
use tauri::AppHandle;

pub struct DeckCraftModule;
impl CraftModule for DeckCraftModule {
    fn id(&self) -> &str {
        "deckcraft"
    }
    fn name(&self) -> &str {
        "DeckCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction {
                id: "add_slide".into(),
                label: "New Slide".into(),
                icon: "🖼️".into(),
                category: "Insert".into(),
            },
            ModuleAction {
                id: "apply_theme".into(),
                label: "Apply Theme".into(),
                icon: "🎭".into(),
                category: "Design".into(),
            },
            ModuleAction {
                id: "start_presentation".into(),
                label: "Present".into(),
                icon: "📽️".into(),
                category: "View".into(),
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
            &["add_slide", "apply_theme", "start_presentation"],
        )
    }
}
