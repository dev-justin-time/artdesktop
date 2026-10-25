use base64::{engine::general_purpose, Engine as _};
use craft_libs::{CraftModule, ModuleAction};
use serde_json::{json, Value};
use tauri::AppHandle;

pub struct PhotoCraftModule;
impl CraftModule for PhotoCraftModule {
    fn id(&self) -> &str {
        "photocraft"
    }
    fn name(&self) -> &str {
        "PhotoCraft"
    }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction {
                id: "rasterize_svg".into(),
                label: "Rasterize Vector".into(),
                icon: "🖼️".into(),
                category: "Import".into(),
            },
            ModuleAction {
                id: "apply_filter".into(),
                label: "Apply Filter".into(),
                icon: "🎨".into(),
                category: "Edit".into(),
            },
        ]
    }
    fn handle_action(
        &self,
        _app: &AppHandle,
        action: &str,
        payload: Value,
    ) -> Result<Value, String> {
        match action {
            "rasterize_svg" => {
                let svg_data_b64 = payload["svg_data"].as_str().ok_or("Missing svg_data")?;
                let png_bytes = rasterize_svg_data(svg_data_b64)?;
                Ok(
                    json!({ "status": "success", "payload": general_purpose::STANDARD.encode(&png_bytes) }),
                )
            }
            // Declared, but the filter stack lives in the embedded PhotoCraft build.
            "apply_filter" => Err(craft_libs::delegated_action(self.id(), action)),
            other => Err(craft_libs::unsupported_action(other)),
        }
    }
}

/// Decodes a Base64 SVG payload and rasterizes it to PNG bytes.
pub fn rasterize_svg_data(svg_data_b64: &str) -> Result<Vec<u8>, String> {
    let decoded_bytes = general_purpose::STANDARD
        .decode(svg_data_b64)
        .map_err(|e| e.to_string())?;
    let svg_str = String::from_utf8(decoded_bytes).map_err(|e| e.to_string())?;
    rasterize_svg_str(&svg_str)
}

fn rasterize_svg_str(svg: &str) -> Result<Vec<u8>, String> {
    let opt = usvg::Options::default();
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| e.to_string())?;
    let size = tree.size().to_int_size();
    let mut pixmap =
        tiny_skia::Pixmap::new(size.width(), size.height()).ok_or("Pixmap alloc failed")?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    pixmap.encode_png().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_size(bytes: &[u8]) -> (u32, u32) {
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"), "not a PNG");
        assert_eq!(&bytes[12..16], b"IHDR");
        let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
        let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
        (width, height)
    }

    #[test]
    fn rasterizes_svg_at_document_size() {
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18"><rect width="32" height="18" fill="#22d3ee"/></svg>"##;
        let png = rasterize_svg_str(svg).expect("valid SVG should rasterize");
        assert_eq!(png_size(&png), (32, 18));
    }

    #[test]
    fn rasterizes_base64_payload() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="7" height="5"><circle cx="3.5" cy="2.5" r="2" fill="red"/></svg>"#;
        let encoded = general_purpose::STANDARD.encode(svg.as_bytes());
        let png = rasterize_svg_data(&encoded).expect("Base64 SVG should rasterize");
        assert_eq!(png_size(&png), (7, 5));
    }

    #[test]
    fn rejects_invalid_base64() {
        let error = rasterize_svg_data("not base64!").unwrap_err();
        assert!(!error.is_empty());
    }

    #[test]
    fn rejects_invalid_svg() {
        let error = rasterize_svg_str("<svg><broken").unwrap_err();
        assert!(!error.is_empty());
    }
}
