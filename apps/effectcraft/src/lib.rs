use craft_libs::{CraftModule, ModuleAction};
use serde_json::Value;
use tauri::AppHandle;

pub struct EffectCraftModule;
impl CraftModule for EffectCraftModule {
    fn id(&self) -> &str {
        "effectcraft"
    }
    fn name(&self) -> &str {
        "EffectCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction {
                id: "add_compositor_node".into(),
                label: "Add Node".into(),
                icon: "🕸️".into(),
                category: "Compositing".into(),
            },
            ModuleAction {
                id: "set_keyframe".into(),
                label: "Keyframe".into(),
                icon: "🔑".into(),
                category: "Animation".into(),
            },
            ModuleAction {
                id: "render_frame".into(),
                label: "Render Frame".into(),
                icon: "🖨️".into(),
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
        craft_libs::dispatch_delegated(
            self.id(),
            action,
            &["add_compositor_node", "set_keyframe", "render_frame"],
        )
    }
}
