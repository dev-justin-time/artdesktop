use craft_libs::{CraftModule, ModuleAction};
use serde_json::{json, Value};
use tauri::AppHandle;

pub struct PDFCraftModule;
impl CraftModule for PDFCraftModule {
    fn id(&self) -> &str { "pdfcraft" }
    fn name(&self) -> &str { "PDFCraft" }
    fn capabilities(&self) -> Vec<ModuleAction> {
        vec![
            ModuleAction { id: "merge_pdfs".into(), label: "Merge".into(), icon: "📑".into(), category: "Tools".into() },
            ModuleAction { id: "split_pdf".into(), label: "Split".into(), icon: "✂️".into(), category: "Tools".into() },
            ModuleAction { id: "add_watermark".into(), label: "Watermark".into(), icon: "💧".into(), category: "Edit".into() },
        ]
    }
    fn handle_action(&self, _app: &AppHandle, action: &str, _payload: Value) -> Result<Value, String> {
        Ok(json!({ "status": "success", "action": action }))
    }
}
