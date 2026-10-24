use craft_libs::{ClipboardItem, ModuleAction, ModuleRegistry, SharedState};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
fn invoke_module_action(
    app: AppHandle,
    registry: State<'_, ModuleRegistry>,
    module_id: String,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    let module = registry.get(&module_id).ok_or("Module not found")?;
    module.handle_action(&app, &action, payload)
}

#[tauri::command]
fn get_module_capabilities(
    registry: State<'_, ModuleRegistry>,
    module_id: String,
) -> Result<Vec<ModuleAction>, String> {
    Ok(registry
        .get(&module_id)
        .ok_or("Module not found")?
        .capabilities())
}

#[tauri::command]
async fn set_clipboard(
    app: AppHandle,
    state: State<'_, SharedState>,
    item: ClipboardItem,
) -> Result<(), String> {
    let mut clip = state.global_clipboard.write().map_err(|e| e.to_string())?;
    *clip = Some(item.clone());
    app.emit("clipboard-updated", &item)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_clipboard(state: State<'_, SharedState>) -> Result<Option<ClipboardItem>, String> {
    Ok(state
        .global_clipboard
        .read()
        .map_err(|e| e.to_string())?
        .clone())
}

fn main() {
    let mut registry = ModuleRegistry::new();

    // Register the entire 10-app ArtCraft Suite
    registry.register(photocraft::PhotoCraftModule);
    registry.register(vectorcraft::VectorCraftModule);
    registry.register(filmcraft::FilmCraftModule);
    registry.register(wordcraft::WordCraftModule);
    registry.register(deckcraft::DeckCraftModule);
    registry.register(designcraft::DesignCraftModule);
    registry.register(effectcraft::EffectCraftModule);
    registry.register(lightcraft::LightCraftModule);
    registry.register(gridcraft::GridCraftModule);
    registry.register(pdfcraft::PDFCraftModule);

    tauri::Builder::default()
        .manage(registry)
        .manage(SharedState::default())
        .invoke_handler(tauri::generate_handler![
            invoke_module_action,
            get_module_capabilities,
            set_clipboard,
            get_clipboard,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start ArtCraft Studio");
}
