#!/usr/bin/env node
// End-to-end check of a running ArtCraft Studio window over WebView2's DevTools
// protocol. Manual by design: CI has no WebView2, so it is not wired into the
// workflows.
//
//   crates/craft-studio-shell$ npx @tauri-apps/cli@^2 build --no-bundle
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" \
//     ./target/release/craft-studio-shell.exe            # add --software-webgl to test the opt-in path
//   node scripts/check-tauri-window.mjs
//
// The shell document and the ten app builds now live on different origins, so a
// frame cannot be read through `contentDocument`. Each frame is inspected in its
// own JavaScript context instead: as its own DevTools target when WebView2 puts it
// out of process, or through the execution context of the frame otherwise.
//
// Exits non-zero if any check fails.
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE = "http://127.0.0.1:9333";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function devtoolsTargets() {
  return (await fetch(`${BASE}/json/list`)).json();
}

class Remote {
  #socket;
  #nextId = 0;
  #pending = new Map();

  constructor(socket) {
    this.#socket = socket;
    this.consoleMessages = [];
    this.logEntries = [];
    this.contexts = [];
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.#pending.has(message.id)) {
        this.#pending.get(message.id)(message);
        this.#pending.delete(message.id);
        return;
      }
      if (message.method === "Runtime.consoleAPICalled") {
        this.consoleMessages.push({
          type: message.params.type,
          text: message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "),
        });
      }
      if (message.method === "Log.entryAdded") {
        this.logEntries.push({ level: message.params.entry.level, text: message.params.entry.text });
      }
      if (message.method === "Runtime.executionContextCreated") {
        const { id, origin, auxData } = message.params.context;
        this.contexts.push({ id, origin, frameId: auxData?.frameId ?? null, isDefault: auxData?.isDefault ?? false });
      }
      if (message.method === "Runtime.executionContextDestroyed") {
        const id = message.params.executionContextId;
        this.contexts = this.contexts.filter((context) => context.id !== id);
      }
    };
  }

  static async attach(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error(`could not attach to ${webSocketDebuggerUrl}`));
    });
    return new Remote(socket);
  }

  send(method, params = {}) {
    const id = (this.#nextId += 1);
    this.#socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, (message) =>
        message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result),
      );
    });
  }

  async evaluate(expression, contextId) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId === undefined ? {} : { contextId }),
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async enable() {
    await this.send("Runtime.enable");
    await this.send("Log.enable");
  }

  close() {
    try {
      this.#socket.close();
    } catch {
      // Already gone.
    }
  }
}

async function findPageTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const page = (await devtoolsTargets()).find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // WebView2 not up yet.
    }
    await sleep(500);
  }
  throw new Error("no page target exposed on the debugging port");
}

const pageTarget = await findPageTarget();
const page = await Remote.attach(pageTarget.webSocketDebuggerUrl);
console.log(`shell target: ${pageTarget.title} — ${pageTarget.url}`);

const frameRemotes = new Map();

/** The two shapes a per-module origin takes across platforms. */
function originCandidates(moduleId) {
  return [`http://${moduleId}.localhost`, `${moduleId}://localhost`];
}

const normalizeOrigin = (value) => String(value ?? "").replace(/\/$/, "");

/**
 * Evaluates an expression inside the frame that owns `origin`.
 *
 * WebView2 may run a cross-site frame in its own process (a separate DevTools
 * target) or in the page's process (a separate execution context), so both are
 * tried before giving up.
 */
async function evalInFrame(origin, expression, timeoutMs = 20000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`evaluating in ${origin} timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([evalInFrameContext(origin, expression), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function evalInFrameContext(origin, expression) {
  let lastError = new Error(`no JavaScript context found for ${origin}`);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let target;
    try {
      target = (await devtoolsTargets()).find(
        (candidate) => candidate.type !== "page" && String(candidate.url ?? "").startsWith(`${origin}/`),
      );
    } catch {
      target = undefined;
    }
    if (target) {
      let remote = frameRemotes.get(target.id);
      if (!remote) {
        try {
          remote = await Remote.attach(target.webSocketDebuggerUrl);
          await remote.enable();
          frameRemotes.set(target.id, remote);
        } catch (error) {
          lastError = error;
        }
      }
      if (remote) {
        try {
          return await remote.evaluate(expression);
        } catch (error) {
          lastError = error;
        }
      }
    }

    const context = page.contexts.filter((candidate) => normalizeOrigin(candidate.origin) === origin).at(-1);
    if (context) {
      try {
        return await page.evaluate(expression, context.id);
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(400);
  }
  throw lastError;
}

async function waitFor(label, probe, { timeout = 30000, interval = 500 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      last = await probe();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(interval);
  }
  throw new Error(`timed out waiting for ${label} (last: ${last})`);
}

const shellEval = (expression) => page.evaluate(expression);

/** Opens a tab and returns the frame's URL, origin and document state. */
async function openTab(moduleId) {
  await shellEval(`document.getElementById('tab-${moduleId}').click()`);
  try {
    return await waitFor(`${moduleId} frame content`, async () => {
      const src = await shellEval(
        "document.querySelector('#canvas-workspace > div:not(.hidden) iframe')?.getAttribute('src') ?? ''",
      );
      if (!src) return null;
      const origin = originCandidates(moduleId).find((candidate) => src.startsWith(`${candidate}/`));
      if (!origin) return { src, origin: null, ready: false };

      const state = await evalInFrame(
        origin,
        "(() => ({ readyState: document.readyState, title: document.title, children: document.body ? document.body.children.length : 0, canvases: document.querySelectorAll('canvas').length, text: document.body ? (document.body.innerText || '').trim().length : 0 }))()",
      );
      if (!state || state.readyState === "loading" || state.children === 0) return null;
      return {
        src,
        origin,
        ready: true,
        title: state.title,
        children: state.children,
        canvases: state.canvases,
        text: state.text,
      };
    });
  } catch (error) {
    return { src: "", origin: null, ready: false, error: error.message };
  }
}

await page.send("Page.enable");
await page.enable();
await page.send("Page.reload", { ignoreCache: false });
await sleep(3000);

// 1. Shell boots.
check("document is interactive", (await shellEval("document.readyState")) !== "loading");
check("ten module tabs render", (await shellEval("document.querySelectorAll('#module-tabs button').length")) === 10);
check(
  "tabs carry no inline handlers",
  await shellEval(
    "[...document.querySelectorAll('#module-tabs button')].every((el) => !el.getAttribute('onclick'))",
  ),
);
check(
  "Suite Expert rendered its greeting",
  (await shellEval("document.querySelectorAll('#expert-messages .expert-message').length")) >= 1,
);

// 2. First tab mounts a frame on the module's own origin.
const photocraft = await openTab("photocraft");
check(
  "photocraft frame points at its own origin",
  photocraft.src === `${photocraft.origin}/index.html?webgl` && photocraft.origin !== null,
  photocraft.src,
);
check("frame URL is not a shell-relative path", !photocraft.src.startsWith("apps/") && photocraft.src.includes("://"));
check(
  "photocraft build actually loads inside the frame",
  photocraft.ready,
  `title=${photocraft.title} children=${photocraft.children} ${photocraft.error ?? ""}`,
);
check("one iframe after the first tab", (await shellEval("document.querySelectorAll('#canvas-workspace iframe').length")) === 1);
check(
  "photocraft tab is marked active",
  (await shellEval("document.getElementById('tab-photocraft').getAttribute('aria-pressed')")) === "true",
);
check("canvas placeholder removed", (await shellEval("document.querySelector('#canvas-workspace h2')")) === null);

// 3. Switching tabs keeps the first frame alive.
const deckcraft = await openTab("deckcraft");
check("two iframes after the second tab", (await shellEval("document.querySelectorAll('#canvas-workspace iframe').length")) === 2);
check(
  "only the active frame is visible",
  (await shellEval(
    "[...document.querySelectorAll('#canvas-workspace > div')].filter((el) => !el.classList.contains('hidden')).length",
  )) === 1,
);
check(
  "hidden frame is still photocraft, retained next to deckcraft",
  (await shellEval("[...document.querySelectorAll('#canvas-workspace iframe')].map((el) => el.getAttribute('src')).join(',')")) ===
    `${photocraft.src},${deckcraft.src}`,
);
check(
  "deckcraft tab is active and photocraft is not",
  (await shellEval("document.getElementById('tab-deckcraft').getAttribute('aria-pressed')")) === "true" &&
    (await shellEval("document.getElementById('tab-photocraft').getAttribute('aria-pressed')")) === "false",
);

// 4. The app origins are actually separate.
check("the two apps have different origins", photocraft.origin !== deckcraft.origin, `${photocraft.origin} vs ${deckcraft.origin}`);
check(
  "no frame shares the shell's origin",
  [photocraft.origin, deckcraft.origin].every((origin) => !origin.includes("tauri")),
);

check("shell storage is reachable from the shell", await shellEval(`(() => {
  try { localStorage.setItem('artcraft-shell-probe', 'shell-secret'); return localStorage.getItem('artcraft-shell-probe') === 'shell-secret'; }
  catch (error) { return false; }
})()`));
check(
  "an app frame cannot read the shell's storage",
  (await evalInFrame(photocraft.origin, "localStorage.getItem('artcraft-shell-probe')")) === null,
);
check(
  "an app frame can still use its own storage",
  (await evalInFrame(
    photocraft.origin,
    "(() => { localStorage.setItem('photocraft-probe', 'pc'); return localStorage.getItem('photocraft-probe'); })()",
  )) === "pc",
);
check(
  "another app cannot read that storage",
  (await evalInFrame(deckcraft.origin, "localStorage.getItem('photocraft-probe')")) === null,
);
check(
  "the shell cannot read an app's storage",
  (await shellEval("localStorage.getItem('photocraft-probe')")) === null,
);

const bridgeProbe = await evalInFrame(
  photocraft.origin,
  `(async () => {
    if (!window.__TAURI_INTERNALS__ || typeof window.__TAURI_INTERNALS__.invoke !== 'function') return 'no-bridge';
    try {
      // A foreign origin gets no answer, so do not wait for one forever.
      const value = await Promise.race([
        window.__TAURI_INTERNALS__.invoke('get_clipboard'),
        new Promise((resolve) => setTimeout(() => resolve('__timeout__'), 1500)),
      ]);
      if (value === '__timeout__') return 'no-response';
      return 'call-succeeded:' + JSON.stringify(value).slice(0, 60);
    } catch (error) {
      return 'rejected:' + String(error).slice(0, 60);
    }
  })()`,
);
check(
  "an app frame cannot call shell commands",
  typeof bridgeProbe === "string" && !bridgeProbe.startsWith("call-succeeded"),
  bridgeProbe,
);
check(
  "an app frame cannot reach the shell's document",
  (await evalInFrame(
    photocraft.origin,
    "(() => { try { return document === window.top.document ? 'same' : 'different'; } catch { return 'blocked'; } })()",
  )) === "blocked",
);

// 5. Reload replaces exactly the active frame.
await shellEval("document.querySelector('#dynamic-toolbar button').click()");
const reloaded = await waitFor("reloaded deckcraft frame", async () => {
  const src = await shellEval(
    "document.querySelector('#canvas-workspace > div:not(.hidden) iframe')?.getAttribute('src') ?? ''",
  );
  if (src !== deckcraft.src) return null;
  const state = await evalInFrame(deckcraft.origin, "document.readyState");
  return state === "complete" ? src : null;
});
check("reload keeps both frames", (await shellEval("document.querySelectorAll('#canvas-workspace iframe').length")) === 2);
check("reload re-created the active frame", reloaded === deckcraft.src);

// 6. Rust commands: export through VectorCraft, rasterize through PhotoCraft.
await shellEval("document.getElementById('clipboard-export').click()");
await sleep(2500);
const exportStatus = await shellEval("document.getElementById('clipboard-status').textContent");
check("Export SVG reports success", /shared clipboard/i.test(exportStatus), exportStatus);
check(
  "clipboard preview renders the SVG through a Blob URL",
  await shellEval("(document.querySelector('#clipboard-preview img')?.src ?? '').startsWith('blob:')"),
);
check("Rasterize is enabled for an SVG", (await shellEval("document.getElementById('clipboard-rasterize').disabled")) === false);

await shellEval("document.getElementById('clipboard-rasterize').click()");
await sleep(4000);
const rasterStatus = await shellEval("document.getElementById('clipboard-status').textContent");
check("Rasterize reports success", /Rasterized with PhotoCraft/i.test(rasterStatus), rasterStatus);
check(
  "PhotoCraft PNG is displayed",
  await shellEval("(document.querySelector('#clipboard-result img')?.src ?? '').startsWith('data:image/png;base64,')"),
);

// 7. Notification log written for the activations.
const logPath = path.join(os.homedir(), "AppData", "Roaming", "com.storytold.artcraft", "agent-notifications.jsonl");
let logLines = [];
try {
  logLines = (await readFile(logPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
} catch {
  // Missing log is a failure below.
}
check("notification log exists", logLines.length > 0, logPath);
const lastEntry = logLines.length ? JSON.parse(logLines.at(-1)) : {};
check("log records a validated kind", ["module.activated", "clipboard.updated"].includes(lastEntry.kind), lastEntry.kind);

// 8. Every one of the ten apps loads its real build, on its own origin.
const tabIds = JSON.parse(
  await shellEval("JSON.stringify([...document.querySelectorAll('#module-tabs button')].map((el) => el.id))"),
);
const loaded = [];
for (const tabId of tabIds) {
  const moduleId = tabId.replace("tab-", "");
  const frame = await openTab(moduleId);
  loaded.push({ moduleId, ...frame });
}
for (const app of loaded) {
  check(
    `${app.moduleId} loads its web build on its own origin`,
    app.ready && app.src.startsWith(`${app.origin}/`),
    `title=${app.title} canvases=${app.canvases ?? 0} text=${app.text ?? 0} ${app.src}`,
  );
}
const origins = loaded.map((app) => app.origin);
check("all ten apps sit on distinct origins", new Set(origins).size === 10, origins.join(" "));
check("all ten frames stay resident", (await shellEval("document.querySelectorAll('#canvas-workspace iframe').length")) === 10);

// 9. The Expert panel answers a question in the running app.
await shellEval("document.getElementById('expert-toggle').click()");
await shellEval(`(() => {
  const input = document.getElementById('expert-input');
  input.value = 'What is PDFCraft?';
  document.getElementById('expert-form').requestSubmit();
})()`);
await sleep(2500);
const expertAnswer = await shellEval(
  "[...document.querySelectorAll('#expert-messages .expert-message-expert p')].at(-1)?.textContent ?? ''",
);
check("Suite Expert answers in the panel", /PDFCraft/.test(expertAnswer), expertAnswer.slice(0, 80));

// 10. Nothing refused the frames, and nothing logged an error.
const remotes = [page, ...frameRemotes.values()];
// The bridge probe in step 4 deliberately provokes its own CSP violation; that
// refusal is asserted there, so it is not a surprise here.
const fromBridgeProbe = /ipc\.localhost\/get_clipboard/;
const consoleMessages = remotes.flatMap((remote) => remote.consoleMessages).filter((entry) => !fromBridgeProbe.test(entry.text));
const logEntries = remotes.flatMap((remote) => remote.logEntries).filter((entry) => !fromBridgeProbe.test(entry.text));
const denied = [...consoleMessages, ...logEntries].filter((entry) =>
  /not allowed|denied|permission|blocked by|refused to/i.test(entry.text),
);
check(
  "no permission or CSP errors in any context",
  denied.length === 0,
  denied.map((entry) => entry.text).join(" | "),
);
const errors = [
  ...consoleMessages.filter((entry) => entry.type === "error"),
  ...logEntries.filter((entry) => entry.level === "error"),
];
check("no console errors", errors.length === 0, errors.map((entry) => entry.text).join(" | "));

for (const remote of frameRemotes.values()) remote.close();
page.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exitCode = failures.length ? 1 : 0;
