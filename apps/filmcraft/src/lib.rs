use craft_libs::{CraftModule, ModuleAction};
use serde_json::Value;
use tauri::AppHandle;

pub struct FilmCraftModule;
impl CraftModule for FilmCraftModule {
    fn id(&self) -> &str {
        "filmcraft"
    }
    fn name(&self) -> &str {
        "FilmCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction {
                id: "add_clip".into(),
                label: "Add Clip".into(),
                icon: "🎞️".into(),
                category: "Timeline".into(),
            },
            ModuleAction {
                id: "split_clip".into(),
                label: "Split (C)".into(),
                icon: "🔪".into(),
                category: "Timeline".into(),
            },
            ModuleAction {
                id: "render_timeline".into(),
                label: "Render Video".into(),
                icon: "🎬".into(),
                category: "Export".into(),
            },
        ]
    }
    fn handle_action(
        &self,
        _app: &AppHandle,
        action: &str,
        _payload: Value,
    ) -> Result<Value, String> {
        craft_libs::dispatch_delegated(self.id(), action, &["add_clip", "split_clip", "render_timeline"])
    }
}
