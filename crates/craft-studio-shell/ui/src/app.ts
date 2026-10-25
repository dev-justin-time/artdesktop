import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initExpert } from "./expert";
import suite from "./suite.json";

interface ClipboardItem { source_module: string; data_type: string; payload: string; }
interface Module { id: string; name: string; icon: string; }
interface ModuleAction { id: string; label: string; icon: string; category: string; }

const MODULES: Module[] = suite.apps.map((app) => ({ id: app.id, name: app.tab, icon: app.icon }));

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140" viewBox="0 0 240 140">
  <rect width="240" height="140" rx="14" fill="#0b0d12"/>
  <circle cx="82" cy="70" r="36" fill="#22d3ee"/>
  <path d="M118 30 206 70 118 110Z" fill="#c4b5fd"/>
</svg>`;

let clipboard: ClipboardItem | null = null;
let previewUrl: string | null = null;

export async function initApp() {
  renderTabs();
  setupClipboardListener();
  initExpert();
  (window as any).activateModule = activateModule;
  bindClipboardActions();
  void loadClipboard();
  void labelClipboardActions();
}

async function notifyAgents(kind: string, module: string, message: string, payload: Record<string, unknown> = {}) {
  try {
    await invoke("notify_agents", { kind, module, message, payload });
  } catch (error) {
    console.debug("agent notifications are only available in the desktop shell", error);
  }
}

interface FrameHandle {
  wrapper: HTMLDivElement;
  frame: HTMLIFrameElement;
}

// One live frame per visited module. Replacing the iframe on every tab click threw
// away whatever the app had in memory, so tabs now hide and show a persisted frame
// and "Reload" is the explicit way to discard one.
const frames = new Map<string, FrameHandle>();
let activeModuleId: string | null = null;

function renderTabs() {
  document.getElementById("module-tabs")!.innerHTML = MODULES.map(m => `
    <button id="tab-${m.id}" type="button" aria-pressed="false" onclick="window.activateModule('${m.id}')" class="px-3 py-1.5 rounded hover:bg-gray-800 text-sm font-medium flex items-center gap-2">
      <span aria-hidden="true">${m.icon}</span> ${m.name}
    </button>
  `).join("");
}

function createFrame(module: Module): FrameHandle {
  const label = `${module.name}Craft`;
  const wrapper = document.createElement("div");
  wrapper.className = "absolute inset-0 hidden";
  wrapper.dataset.module = module.id;

  const loading = document.createElement("div");
  loading.className = "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0b0d12] text-gray-400";
  const starting = document.createElement("span");
  starting.className = "text-sm";
  starting.textContent = `Starting ${label}…`;
  const source = document.createElement("span");
  source.className = "text-xs text-gray-600";
  source.textContent = `Loading the official web build from storytold/${module.id}`;
  loading.append(starting, source);

  const frame = document.createElement("iframe");
  frame.className = "absolute inset-0 w-full h-full border-0 bg-[#0b0d12]";
  frame.title = label;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-pointer-lock");
  frame.setAttribute("allow", "clipboard-read; clipboard-write; fullscreen; autoplay");
  frame.src = `apps/${module.id}/index.html?webgl`;
  frame.addEventListener("load", () => {
    loading.remove();
    // The expert panel stays usable even when an app fails to boot.
    if (activeModuleId === module.id) setStatus(`${label} ready.`);
  }, { once: true });

  wrapper.append(loading, frame);
  return { wrapper, frame };
}

function renderToolbar(module: Module) {
  const toolbar = document.getElementById("dynamic-toolbar")!;
  toolbar.replaceChildren();

  const title = document.createElement("span");
  title.className = "text-gray-300 text-xs font-medium";
  title.textContent = `${module.icon} ${module.name}Craft`;

  const provenance = document.createElement("span");
  provenance.className = "text-gray-600 text-xs";
  provenance.textContent = `official web build · storytold/${module.id}`;

  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-400 hover:bg-gray-800";
  reload.textContent = "⟳ Reload";
  reload.title = "Discard this app's in-memory state and load it again";
  reload.addEventListener("click", () => {
    if (!activeModuleId) return;
    frames.get(activeModuleId)?.wrapper.remove();
    frames.delete(activeModuleId);
    activateModule(activeModuleId);
  });

  toolbar.append(title, provenance, reload);
}

async function activateModule(moduleId: string) {
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return;

  let handle = frames.get(moduleId);
  if (!handle) {
    const canvas = document.getElementById("canvas-workspace")!;
    canvas.querySelector("h2")?.remove();
    handle = createFrame(module);
    frames.set(moduleId, handle);
    canvas.append(handle.wrapper);
  }

  for (const [id, entry] of frames) entry.wrapper.classList.toggle("hidden", id !== moduleId);
  activeModuleId = moduleId;

  for (const candidate of MODULES) {
    const tab = document.getElementById(`tab-${candidate.id}`);
    if (!tab) continue;
    const active = candidate.id === moduleId;
    tab.setAttribute("aria-pressed", String(active));
    tab.classList.toggle("bg-gray-800", active);
  }

  renderToolbar(module);
  void notifyAgents("module.activated", moduleId, `${module.name}Craft opened`, { app: moduleId });
}

function setupClipboardListener() {
  listen<ClipboardItem>("clipboard-updated", (event) => {
    renderClipboard(event.payload);
    void notifyAgents("clipboard.updated", event.payload.source_module, `Clipboard updated by ${event.payload.source_module}`, { dataType: event.payload.data_type });
  }).catch((error) => {
    console.debug("clipboard events are only available in the desktop shell", error);
  });
}

function bindClipboardActions() {
  document.getElementById("clipboard-export")?.addEventListener("click", () => { void exportSampleSvg(); });
  document.getElementById("clipboard-rasterize")?.addEventListener("click", () => { void rasterizeClipboard(); });
}

async function labelClipboardActions() {
  try {
    const [vector, photo] = await Promise.all([
      invoke<ModuleAction[]>("get_module_capabilities", { moduleId: "vectorcraft" }),
      invoke<ModuleAction[]>("get_module_capabilities", { moduleId: "photocraft" }),
    ]);
    const exportAction = vector.find((action) => action.id === "export_svg");
    const rasterAction = photo.find((action) => action.id === "rasterize_svg");
    const exportButton = document.getElementById("clipboard-export");
    const rasterButton = document.getElementById("clipboard-rasterize");
    if (exportAction && exportButton) exportButton.textContent = `${exportAction.icon} ${exportAction.label}`;
    if (rasterAction && rasterButton) rasterButton.textContent = `${rasterAction.icon} ${rasterAction.label}`;
  } catch (error) {
    console.debug("module commands are only available in the desktop shell", error);
  }
}

async function loadClipboard() {
  try {
    renderClipboard(await invoke<ClipboardItem | null>("get_clipboard"));
  } catch (error) {
    console.debug("clipboard commands are only available in the desktop shell", error);
  }
}

function decodeBase64Utf8(payload: string): string {
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function setStatus(message: string, isError = false) {
  const status = document.getElementById("clipboard-status");
  if (!status) return;
  status.textContent = message;
  status.className = isError ? "text-[11px] text-rose-400" : "text-[11px] text-gray-500";
}

function renderClipboard(item: ClipboardItem | null) {
  clipboard = item;
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  const preview = document.getElementById("clipboard-preview")!;
  preview.replaceChildren();
  const rasterButton = document.getElementById("clipboard-rasterize") as HTMLButtonElement | null;

  if (!item) {
    const empty = document.createElement("span");
    empty.className = "text-gray-600 text-sm italic";
    empty.textContent = "Empty";
    preview.append(empty);
    if (rasterButton) rasterButton.disabled = true;
    return;
  }

  const source = document.createElement("div");
  source.className = "text-xs text-gray-400 mb-2";
  source.textContent = `From: ${item.source_module}`;
  preview.append(source);

  if (item.data_type === "image/svg+xml") {
    try {
      const blob = new Blob([decodeBase64Utf8(item.payload)], { type: "image/svg+xml" });
      previewUrl = URL.createObjectURL(blob);
      const image = document.createElement("img");
      image.src = previewUrl;
      image.alt = `SVG clipboard item from ${item.source_module}`;
      image.className = "w-full rounded bg-black";
      preview.append(image);
      if (rasterButton) rasterButton.disabled = false;
      setStatus("SVG ready to rasterize.");
    } catch (error) {
      const failed = document.createElement("div");
      failed.className = "text-xs text-rose-400";
      failed.textContent = "Could not decode the SVG payload.";
      preview.append(failed);
      if (rasterButton) rasterButton.disabled = true;
      setStatus(String(error), true);
    }
    return;
  }

  const type = document.createElement("div");
  type.className = "text-gray-300 text-sm";
  type.textContent = item.data_type;
  preview.append(type);
  if (rasterButton) rasterButton.disabled = true;
  setStatus("Clipboard item is not an SVG.");
}

async function exportSampleSvg() {
  setStatus("Exporting sample SVG…");
  try {
    await invoke("invoke_module_action", {
      moduleId: "vectorcraft",
      action: "export_svg",
      payload: { svg_data: SAMPLE_SVG },
    });
    await loadClipboard();
    setStatus("Sample SVG sent to the shared clipboard.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function rasterizeClipboard() {
  if (!clipboard || clipboard.data_type !== "image/svg+xml") {
    setStatus("Copy an SVG first.", true);
    return;
  }

  const rasterButton = document.getElementById("clipboard-rasterize") as HTMLButtonElement | null;
  if (rasterButton) rasterButton.disabled = true;
  setStatus("Rasterizing…");
  try {
    const result = await invoke<{ status?: string; payload?: string }>("invoke_module_action", {
      moduleId: "photocraft",
      action: "rasterize_svg",
      payload: { svg_data: clipboard.payload },
    });
    if (!result?.payload) throw new Error("PhotoCraft returned no PNG payload.");
    showRasterizedPng(result.payload);
    setStatus("Rasterized with PhotoCraft.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    if (rasterButton) rasterButton.disabled = false;
  }
}

function showRasterizedPng(base64: string) {
  const result = document.getElementById("clipboard-result");
  if (!result) return;
  result.replaceChildren();
  result.classList.remove("hidden");

  const label = document.createElement("div");
  label.className = "text-[11px] uppercase tracking-wide text-gray-500 mb-2";
  label.textContent = "Rasterized PNG";
  const image = document.createElement("img");
  image.src = `data:image/png;base64,${base64}`;
  image.alt = "Rasterized PNG from PhotoCraft";
  image.className = "w-full rounded border border-gray-800 bg-black";
  result.append(label, image);
}
