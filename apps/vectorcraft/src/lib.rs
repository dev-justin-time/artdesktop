use craft_libs::{CraftModule, ModuleAction, ClipboardItem, SharedState};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use base64::{engine::general_purpose, Engine as _};

pub struct VectorCraftModule;
impl CraftModule for VectorCraftModule {
    fn id(&self) -> &str { "vectorcraft" }
    fn name(&self) -> &str { "VectorCraft" }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction { id: "export_svg".into(), label: "Export SVG".into(), icon: "📤".into(), category: "File".into() },
        ]
    }
    fn handle_action(&self, app: &AppHandle, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            "export_svg" => {
                let svg_data = payload["svg_data"].as_str().unwrap_or("<svg></svg>");
                let encoded_svg = general_purpose::STANDARD.encode(svg_data.as_bytes());
                let state = app.state::<SharedState>();
                let mut clip = state.global_clipboard.write().map_err(|e| e.to_string())?;
                *clip = Some(ClipboardItem {
                    source_module: "vectorcraft".into(),
                    data_type: "image/svg+xml".into(),
                    payload: encoded_svg,
                });
                Ok(json!({ "status": "success" }))
            },
            _ => Ok(json!({ "status": "success", "action": action })),
        }
    }
}