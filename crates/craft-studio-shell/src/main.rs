#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notifications;
mod protocols;
mod startup;

use craft_libs::{ClipboardItem, ModuleAction, ModuleRegistry, SharedState};
use notifications::{
    get_agent_notification_log_path, get_agent_notifications, notify_agents, AgentNotifier,
};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, State};

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
fn set_clipboard(
    app: AppHandle,
    state: State<'_, SharedState>,
    item: ClipboardItem,
) -> Result<(), String> {
    state.set_clipboard(&app, item)
}

/// The URL each module's build is mounted from.
///
/// Every app is served from its own origin (see `protocols`), so the shell cannot
/// hard-code a relative path for them.
#[tauri::command]
fn get_module_frame_urls(registry: State<'_, ModuleRegistry>) -> HashMap<String, String> {
    registry
        .ids()
        .into_iter()
        .map(|id| {
            let url = protocols::frame_url(&id);
            (id, url)
        })
        .collect()
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
    // Before Tauri boots: the WebGL choice cannot be changed once WebView2 starts.
    startup::configure_webgl();

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

    // One protocol per module, so each embedded build lands on its own origin.
    let mut builder = tauri::Builder::default();
    for module in registry.ids() {
        let served = module.clone();
        builder = builder.register_uri_scheme_protocol(module, move |context, request| {
            protocols::serve(context.app_handle(), &served, request)
        });
    }

    builder
        .manage(registry)
        .manage(SharedState::default())
        .manage(AgentNotifier::default())
        .invoke_handler(tauri::generate_handler![
            invoke_module_action,
            get_module_capabilities,
            set_clipboard,
            get_clipboard,
            get_module_frame_urls,
            notify_agents,
            get_agent_notifications,
            get_agent_notification_log_path,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            // A release build has no console, so stderr alone would vanish.
            startup::report_fatal(&format!("ArtCraft Studio failed to start: {error}"));
            std::process::exit(1);
        });
}
