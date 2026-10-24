import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ModuleAction { id: string; label: string; icon: string; category: string; }
interface ClipboardItem { source_module: string; data_type: string; payload: string; }

const MODULES = [
  { id: "photocraft", name: "Photo", icon: "📷" },
  { id: "vectorcraft", name: "Vector", icon: "✒️" },
  { id: "filmcraft", name: "Film", icon: "🎬" },
  { id: "wordcraft", name: "Word", icon: "📝" },
  { id: "deckcraft", name: "Deck", icon: "📊" },
  { id: "designcraft", name: "Design", icon: "🎨" },
  { id: "effectcraft", name: "Effect", icon: "✨" },
  { id: "lightcraft", name: "Light", icon: "💡" },
  { id: "gridcraft", name: "Grid", icon: "📈" },
  { id: "pdfcraft", name: "PDF", icon: "📄" },
];

let activeModuleId: string | null = null;

export async function initApp() {
  renderTabs();
  setupClipboardListener();
  (window as any).activateModule = activateModule;
  (window as any).executeTool = executeTool;
}

function renderTabs() {
  document.getElementById("module-tabs")!.innerHTML = MODULES.map(m => `
    <button onclick="window.activateModule('${m.id}')" class="px-3 py-1.5 rounded hover:bg-gray-800 text-sm font-medium flex items-center gap-2">
      <span>${m.icon}</span> ${m.name}
    </button>
  `).join("");
}

async function activateModule(moduleId: string) {
  activeModuleId = moduleId;
  const canvas = document.getElementById("canvas-workspace")!;
  
  if (moduleId === "photocraft") {
    canvas.innerHTML = `<div id="photo-drop-zone" class="w-[600px] h-[400px] border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center hover:border-blue-500 transition bg-gray-900/50"><span class="text-gray-400 text-lg mb-2">Drop VectorCraft SVGs Here</span></div>`;
    setupDropZone();
  } else if (moduleId === "vectorcraft") {
    canvas.innerHTML = `<div class="text-center"><h2 class="text-2xl font-bold mb-4">VectorCraft Canvas</h2><button onclick="window.executeTool('export_svg')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium">Export SVG to Shared Clipboard</button></div>`;
  } else if (moduleId === "filmcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex flex-col items-center justify-center bg-gray-950"><div class="w-[800px] h-[450px] bg-black rounded-lg mb-4 flex items-center justify-center border border-gray-800"><span class="text-gray-600 font-mono text-sm">[ Video Preview Monitor ]</span></div><div class="w-[800px] h-32 bg-gray-900 rounded-lg border border-gray-800 flex items-center px-4 gap-2"><div class="h-16 w-32 bg-blue-900/50 rounded border border-blue-700/50"></div><div class="h-16 w-48 bg-purple-900/50 rounded border border-purple-700/50"></div></div></div>`;
  } else if (moduleId === "wordcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-800 overflow-auto p-8"><div class="w-[600px] min-h-[800px] bg-white text-gray-900 p-12 shadow-2xl rounded-sm"><h1 class="text-3xl font-bold mb-4">Untitled Document</h1><p class="text-gray-600">Start typing your masterpiece here...</p></div></div>`;
  } else if (moduleId === "deckcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-900 p-8"><div class="w-[800px] h-[450px] bg-white rounded shadow-2xl flex flex-col items-center justify-center text-gray-800"><h1 class="text-4xl font-bold mb-2">Slide 1</h1><p class="text-xl text-gray-500">Click 'New Slide' to add to your deck</p></div></div>`;
  } else if (moduleId === "designcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-800 overflow-auto p-8"><div class="w-[600px] h-[800px] bg-white shadow-2xl relative"><div class="absolute inset-4 border-2 border-dashed border-red-400/50 pointer-events-none"></div><div class="absolute top-20 left-8 text-gray-400 text-xs font-mono">[ Master Page Grid ]</div></div></div>`;
  } else if (moduleId === "effectcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex bg-gray-950"><div class="flex-1 p-4 border-r border-gray-800"><div class="text-gray-500 text-xs font-mono mb-2">NODE GRAPH</div><div class="w-full h-64 bg-gray-900 rounded border border-gray-800 flex items-center justify-center"><span class="text-gray-600">[ Compositor Node Tree ]</span></div></div><div class="w-1/3 p-4"><div class="text-gray-500 text-xs font-mono mb-2">PREVIEW</div><div class="w-full h-64 bg-black rounded border border-gray-800 flex items-center justify-center"><span class="text-gray-600">[ Render Output ]</span></div></div></div>`;
  } else if (moduleId === "lightcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex bg-gray-900"><div class="flex-1 flex items-center justify-center p-8"><div class="w-[600px] h-[400px] bg-gray-800 rounded shadow-xl flex items-center justify-center relative overflow-hidden"><div class="absolute inset-0 bg-gradient-to-r from-gray-700 to-gray-600 opacity-50"></div><span class="relative z-10 text-gray-300 font-mono">RAW Image Preview</span></div></div><div class="w-72 bg-gray-950 border-l border-gray-800 p-4 space-y-4"><div class="text-gray-400 text-xs font-mono uppercase">Develop</div><div class="space-y-2"><div class="flex justify-between text-sm text-gray-300"><span>Exposure</span><span>+0.5</span></div><div class="h-1 bg-gray-800 rounded"><div class="w-1/2 h-full bg-blue-500 rounded"></div></div></div></div></div>`;
  } else if (moduleId === "gridcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-900 p-8 overflow-auto"><div class="bg-gray-800 rounded shadow-xl border border-gray-700 overflow-hidden"><table class="text-sm text-gray-300 font-mono"><thead class="bg-gray-700 text-gray-400 uppercase text-xs"><tr><th class="px-4 py-2 border-r border-gray-600"></th><th class="px-4 py-2 border-r border-gray-600">A</th><th class="px-4 py-2 border-r border-gray-600">B</th><th class="px-4 py-2">C</th></tr></thead><tbody><tr><td class="px-4 py-2 border-r border-b border-gray-700 bg-gray-700 text-center">1</td><td class="px-4 py-2 border-r border-b border-gray-700 bg-gray-800">Item</td><td class="px-4 py-2 border-r border-b border-gray-700 bg-gray-800">Qty</td><td class="px-4 py-2 border-b border-gray-700 bg-gray-800">Price</td></tr></tbody></table></div></div>`;
  } else if (moduleId === "pdfcraft") {
    canvas.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gray-900 p-8"><div class="w-[500px] h-[600px] bg-white shadow-2xl rounded flex flex-col items-center justify-center text-gray-800 relative overflow-hidden"><div class="absolute top-4 right-4 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">PDF</div><h2 class="text-2xl font-bold mb-4">Document.pdf</h2><p class="text-gray-500 text-sm mb-8">14 Pages • 2.4 MB</p><div class="flex gap-4"><button onclick="window.executeTool('merge_pdfs')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm">Merge</button><button onclick="window.executeTool('split_pdf')" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm">Split</button></div></div></div>`;
  }

  const actions = await invoke<ModuleAction[]>("get_module_capabilities", { moduleId });
  document.getElementById("dynamic-toolbar")!.innerHTML = actions.map(a => `
    <button onclick="window.executeTool('${a.id}')" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium flex items-center gap-1.5 border border-gray-700">
      <span>${a.icon}</span> ${a.label}
    </button>
  `).join("");
}

function setupDropZone() {
  const zone = document.getElementById("photo-drop-zone")!;
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("border-blue-500", "bg-blue-900/20"); };
  zone.ondragleave = () => { zone.classList.remove("border-blue-500", "bg-blue-900/20"); };
  zone.ondrop = async (e) => {
    e.preventDefault();
    zone.classList.remove("border-blue-500", "bg-blue-900/20");
    zone.innerHTML = `<span class="text-blue-400">Rasterizing...</span>`;
    const clip = await invoke<ClipboardItem>("get_clipboard");
    if (clip && clip.data_type === "image/svg+xml") {
      const result = await invoke<any>("invoke_module_action", {
        moduleId: "photocraft", action: "rasterize_svg", payload: { svg_data: clip.payload }
      });
      if (result.status === "success") {
        zone.innerHTML = `<img src="data:image/png;base64,${result.payload}" class="max-w-full max-h-full object-contain" />`;
      }
    }
  };
}

async function executeTool(actionId: string) {
  if (!activeModuleId) return;
  if (actionId === "export_svg") {
    await invoke("invoke_module_action", {
      moduleId: activeModuleId, action: actionId, 
      payload: { svg_data: "<svg width='100' height='100'><circle cx='50' cy='50' r='40' fill='blue'/></svg>" }
    });
  } else {
    await invoke("invoke_module_action", { moduleId: activeModuleId, action: actionId, payload: {} });
  }
}

function setupClipboardListener() {
  listen<ClipboardItem>("clipboard-updated", (event) => {
    const item = event.payload;
    const preview = document.getElementById("clipboard-preview")!;
    if (item.data_type === "image/svg+xml") {
      const svgString = atob(item.payload);
      preview.innerHTML = `<div class="text-xs text-gray-400 mb-2">From: ${item.source_module}</div><div class="bg-black p-2 rounded w-full flex items-center justify-center">${svgString}</div>`;
    } else {
      preview.innerHTML = `<div class="text-xs text-gray-400 mb-2">From: ${item.source_module}</div><div class="text-gray-300 text-sm">${item.data_type}</div>`;
    }
  });
}