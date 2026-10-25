use base64::{engine::general_purpose, Engine as _};
use craft_libs::{ClipboardItem, CraftModule, ModuleAction, SharedState};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub struct VectorCraftModule;
impl CraftModule for VectorCraftModule {
    fn id(&self) -> &str {
        "vectorcraft"
    }
    fn name(&self) -> &str {
        "VectorCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![ModuleAction {
            id: "export_svg".into(),
            label: "Export SVG".into(),
            icon: "📤".into(),
            category: "File".into(),
        }]
    }
    fn handle_action(
        &self,
        app: &AppHandle,
        action: &str,
        payload: Value,
    ) -> Result<Value, String> {
        match action {
            "export_svg" => {
                let svg_data = payload["svg_data"]
                    .as_str()
                    .ok_or("Missing svg_data")?;
                let encoded_svg = general_purpose::STANDARD.encode(svg_data.as_bytes());
                let state = app.state::<SharedState>();
                state.set_clipboard(
                    app,
                    ClipboardItem {
                        source_module: "vectorcraft".into(),
                        data_type: "image/svg+xml".into(),
                        payload: encoded_svg,
                    },
                )?;
                Ok(json!({ "status": "success" }))
            }
            other => Err(craft_libs::unsupported_action(other)),
        }
    }
}
