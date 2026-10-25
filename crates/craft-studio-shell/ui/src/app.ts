import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initExpert } from "./expert";
import suite from "./suite.json";

interface ClipboardItem { source_module: string; data_type: string; payload: string; }
interface Module { id: string; name: string; icon: string; }

const MODULES: Module[] = suite.apps.map((app) => ({ id: app.id, name: app.tab, icon: app.icon }));

export async function initApp() {
  renderTabs();
  setupClipboardListener();
  initExpert();
  (window as any).activateModule = activateModule;
}

async function notifyAgents(kind: string, module: string, message: string, payload: Record<string, unknown> = {}) {
  try {
    await invoke("notify_agents", { kind, module, message, payload });
  } catch (error) {
    console.debug("agent notifications are only available in the desktop shell", error);
  }
}

function renderTabs() {
  document.getElementById("module-tabs")!.innerHTML = MODULES.map(m => `
    <button onclick="window.activateModule('${m.id}')" class="px-3 py-1.5 rounded hover:bg-gray-800 text-sm font-medium flex items-center gap-2">
      <span>${m.icon}</span> ${m.name}
    </button>
  `).join("");
}

async function activateModule(moduleId: string) {
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return;

  const canvas = document.getElementById("canvas-workspace")!;
  const label = `${module.name}Craft`;
  canvas.innerHTML = `
    <div class="relative w-full h-full">
      <div id="app-loading" class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0b0d12] text-gray-400">
        <span class="text-sm">Starting ${label}…</span>
        <span class="text-xs text-gray-600">Loading the official web build from storytold/${moduleId}</span>
      </div>
      <iframe
        id="app-frame"
        class="absolute inset-0 w-full h-full border-0 bg-[#0b0d12]"
        src="apps/${moduleId}/index.html?webgl"
        title="${label}"
        allow="clipboard-read; clipboard-write; fullscreen; autoplay"
      ></iframe>
    </div>
  `;

  const frame = canvas.querySelector<HTMLIFrameElement>("#app-frame")!;
  frame.addEventListener("load", () => {
    canvas.querySelector("#app-loading")?.remove();
  }, { once: true });

  document.getElementById("dynamic-toolbar")!.innerHTML = `
    <span class="text-gray-300 text-xs font-medium">${module.icon} ${label}</span>
    <span class="text-gray-600 text-xs">official web build · storytold/${moduleId}</span>
  `;

  void notifyAgents("module.activated", moduleId, `${label} opened`, { app: moduleId });
}

function setupClipboardListener() {
  listen<ClipboardItem>("clipboard-updated", (event) => {
    const item = event.payload;
    const preview = document.getElementById("clipboard-preview")!;
    void notifyAgents("clipboard.updated", item.source_module, `Clipboard updated by ${item.source_module}`, { dataType: item.data_type });

    if (item.data_type === "image/svg+xml") {
      const svgString = atob(item.payload);
      preview.innerHTML = `<div class="text-xs text-gray-400 mb-2">From: ${item.source_module}</div><div class="bg-black p-2 rounded w-full flex items-center justify-center">${svgString}</div>`;
    } else {
      preview.innerHTML = `<div class="text-xs text-gray-400 mb-2">From: ${item.source_module}</div><div class="text-gray-300 text-sm">${item.data_type}</div>`;
    }
  }).catch((error) => {
    console.debug("clipboard events are only available in the desktop shell", error);
  });
}
