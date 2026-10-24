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

// Completed mockup pages live in assets/pages and are copied into ui/public/pages.
const COMPLETED_PAGES: Record<string, string> = {
  photocraft: "pages/photocraft/index.html",
  vectorcraft: "pages/vectercraft/index.html",
  filmcraft: "pages/filmcraft/index.html",
  wordcraft: "pages/wordcraft/index.html",
  deckcraft: "pages/deckcraft/index.html",
  designcraft: "pages/designcraft/index.html",
  effectcraft: "pages/effectcraft/index.html",
  lightcraft: "pages/lightcraft/index.html",
  gridcraft: "pages/gridcraft/index.html",
  pdfcraft: "pages/pdfcraft/index.html",
};

// The three extracted mockups carry their own duplicate global header/sidebar.
const HIDE_PAGE_CHROME = new Set(["filmcraft", "lightcraft", "pdfcraft"]);

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

  const completedPage = COMPLETED_PAGES[moduleId];
  if (completedPage) {
    mountCompletedPage(canvas, completedPage, moduleId, HIDE_PAGE_CHROME.has(moduleId));
  }

  const actions = await invoke<ModuleAction[]>("get_module_capabilities", { moduleId });
  document.getElementById("dynamic-toolbar")!.innerHTML = actions.map(a => `
    <button onclick="window.executeTool('${a.id}')" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-medium flex items-center gap-1.5 border border-gray-700">
      <span>${a.icon}</span> ${a.label}
    </button>
  `).join("");
}

function mountCompletedPage(canvas: HTMLElement, src: string, moduleId: string, hideChrome: boolean) {
  canvas.innerHTML = `<iframe class="w-full h-full border-0 bg-[#0b0d12]" src="${src}" title="${moduleId} module interface"></iframe>`;
  const frame = canvas.querySelector("iframe")!;
  frame.addEventListener("load", () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      if (hideChrome) {
        const style = doc.createElement("style");
        style.textContent = `
          body > header, body > aside { display: none !important; }
          main { padding-top: 0 !important; }
        `;
        doc.head.appendChild(style);
      }
      doc.body.style.background = "#0b0d12";
      wireModuleNavigation(doc);
      wirePageActions(doc, moduleId);
    } catch (error) {
      console.warn("Unable to initialize the embedded module page", error);
    }
  });
}

function moduleIdFromPagePath(path: string): string | null {
  const normalized = path.replace(/^artcraft-studio-/, "").replace(/-launcher$/, "");
  if (normalized === "dashboard") return "";
  return MODULES.some(m => m.id === normalized) ? normalized : null;
}

function showDashboard() {
  activeModuleId = null;
  document.getElementById("canvas-workspace")!.innerHTML =
    `<h2 class="text-4xl text-gray-600 font-bold">Select a Module to Begin</h2>`;
  document.getElementById("dynamic-toolbar")!.innerHTML =
    `<span class="text-gray-500 text-sm italic">Select a module</span>`;
}

// The mockup pages are same-origin iframes, so their nav links can drive the studio tabs.
function wireModuleNavigation(doc: Document) {
  doc.querySelectorAll<HTMLAnchorElement>("a[data-path]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = moduleIdFromPagePath(link.dataset.path ?? "");
      if (target === null) return;
      if (target === "") {
        showDashboard();
      } else {
        void activateModule(target);
      }
    });
  });
}

// Buttons inside the embedded page can invoke their module's Rust actions.
function wirePageActions(doc: Document, moduleId: string) {
  doc.querySelectorAll<HTMLElement>("[data-studio-action]").forEach((control) => {
    control.addEventListener("click", async (event) => {
      event.preventDefault();
      const action = control.dataset.studioAction;
      if (!action) return;

      control.setAttribute("aria-busy", "true");
      control.style.opacity = "0.65";
      control.style.pointerEvents = "none";
      try {
        const payload: Record<string, unknown> = {};
        if (control.dataset.studioPayload) {
          Object.assign(payload, JSON.parse(control.dataset.studioPayload));
        }
        if (control.dataset.studioSvg) {
          const source = doc.querySelector(control.dataset.studioSvg);
          if (!source) throw new Error(`SVG source ${control.dataset.studioSvg} not found`);
          payload.svg_data = toBase64Utf8(source.outerHTML);
        } else if (control.dataset.studioClipboard === "true") {
          const clip = await invoke<ClipboardItem | null>("get_clipboard");
          if (!clip || clip.data_type !== "image/svg+xml") {
            throw new Error("Shared clipboard is empty. Export an SVG from VectorCraft first.");
          }
          payload.svg_data = clip.payload;
        }

        const result = await invoke<{ payload?: string; message?: string }>("invoke_module_action", {
          moduleId,
          action,
          payload,
        });
        if (action === "rasterize_svg" && result?.payload) {
          showRasterPreview(doc, result.payload);
          showPageToast(doc, "Rasterized SVG to PNG");
        } else {
          showPageToast(doc, result?.message ?? `${action} completed`);
        }
      } catch (error) {
        showPageToast(doc, String(error), true);
      } finally {
        control.removeAttribute("aria-busy");
        control.style.opacity = "";
        control.style.pointerEvents = "";
      }
    });
  });
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function showPageToast(doc: Document, message: string, isError = false) {
  let toast = doc.getElementById("studio-page-toast");
  if (!toast) {
    toast = doc.createElement("div");
    toast.id = "studio-page-toast";
    Object.assign(toast.style, {
      position: "fixed",
      left: "50%",
      bottom: "22px",
      transform: "translateX(-50%)",
      padding: "8px 14px",
      borderRadius: "8px",
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      zIndex: "2147483000",
      pointerEvents: "none",
      transition: "opacity .2s",
      boxShadow: "0 12px 30px rgba(0,0,0,.45)",
    });
    doc.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.color = isError ? "#fecaca" : "#bbf7d0";
  toast.style.background = isError ? "rgba(60, 16, 22, .96)" : "rgba(18, 34, 25, .96)";
  toast.style.border = isError ? "1px solid rgba(248, 113, 113, .5)" : "1px solid rgba(74, 222, 128, .4)";
  window.setTimeout(() => { toast!.style.opacity = "0"; }, 2600);
}

function showRasterPreview(doc: Document, pngBase64: string) {
  doc.getElementById("studio-raster-preview")?.remove();
  const overlay = doc.createElement("div");
  overlay.id = "studio-raster-preview";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147482999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "28px",
    background: "rgba(4, 6, 10, .9)",
    cursor: "zoom-out",
  });
  overlay.title = "Click to close";
  overlay.onclick = () => overlay.remove();
  const image = doc.createElement("img");
  image.src = `data:image/png;base64,${pngBase64}`;
  image.alt = "Rasterized SVG preview";
  Object.assign(image.style, {
    maxWidth: "92%",
    maxHeight: "92%",
    objectFit: "contain",
    borderRadius: "8px",
    boxShadow: "0 30px 80px rgba(0,0,0,.65)",
  });
  overlay.appendChild(image);
  doc.body.appendChild(overlay);
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
