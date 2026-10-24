use craft_libs::{CraftModule, ModuleAction};
use serde_json::{json, Value};
use tauri::AppHandle;
use base64::{engine::general_purpose, Engine as _};

pub struct PhotoCraftModule;
impl CraftModule for PhotoCraftModule {
    fn id(&self) -> &str { "photocraft" }
    fn name(&self) -> &str { "PhotoCraft" }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction { id: "rasterize_svg".into(), label: "Rasterize Vector".into(), icon: "🖼️".into(), category: "Import".into() },
            ModuleAction { id: "apply_filter".into(), label: "Apply Filter".into(), icon: "🎨".into(), category: "Edit".into() },
        ]
    }
    fn handle_action(&self, _app: &AppHandle, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            "rasterize_svg" => {
                let svg_data_b64 = payload["svg_data"].as_str().ok_or("Missing svg_data")?;
                let decoded_bytes = general_purpose::STANDARD.decode(svg_data_b64).map_err(|e| e.to_string())?;
                let svg_str = String::from_utf8(decoded_bytes).map_err(|e| e.to_string())?;
                let opt = usvg::Options::default();
                let tree = usvg::Tree::from_str(&svg_str, &opt).map_err(|e| e.to_string())?;
                let size = tree.size.to_int_size();
                let mut pixmap = tiny_skia::Pixmap::new(size.width(), size.height()).ok_or("Pixmap alloc failed")?;
                resvg::render(&tree, usvg::FitTo::Original, pixmap.as_mut()).ok_or("Render failed")?;
                let png_bytes = pixmap.encode_png().map_err(|e| e.to_string())?;
                Ok(json!({ "status": "success", "payload": general_purpose::STANDARD.encode(&png_bytes) }))
            },
            _ => Ok(json!({ "status": "success", "action": action })),
        }
    }
}
