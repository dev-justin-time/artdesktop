#!/usr/bin/env node
// End-to-end check of a running ArtCraft Studio window over WebView2's DevTools
// protocol. Manual by design: CI has no WebView2, so it is not wired into the
// workflows.
//
//   crates/craft-studio-shell$ npx @tauri-apps/cli@^2 build --no-bundle
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" \
//     ./target/release/craft-studio-shell.exe
//   node scripts/check-tauri-window.mjs
//
// Exits non-zero if any check fails.
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE = "http://127.0.0.1:9333";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPage() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await (await fetch(`${BASE}/json/list`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // WebView2 not up yet.
    }
    await sleep(500);
  }
  throw new Error("no page target exposed on the debugging port");
}

const page = await findPage();
console.log(`target: ${page.title} — ${page.url}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = () => reject(new Error("could not attach to the page"));
});

let nextId = 0;
const pending = new Map();
const consoleMessages = [];
const logEntries = [];

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled") {
    consoleMessages.push({
      type: message.params.type,
      text: message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "),
    });
  }
  if (message.method === "Log.entryAdded") {
    logEntries.push({ level: message.params.entry.level, text: message.params.entry.text });
  }
};

function send(method, params = {}) {
  const id = (nextId += 1);
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.reload", { ignoreCache: false });
await sleep(3000);

// 1. Shell boots.
check("document is interactive", (await evaluate("document.readyState")) !== "loading");
check("ten module tabs render", (await evaluate("document.querySelectorAll('#module-tabs button').length")) === 10);
check(
  "tabs carry no inline handlers",
  (await evaluate("[...document.querySelectorAll('#module-tabs button')].every((el) => !el.getAttribute('onclick'))")),
);
check(
  "Suite Expert rendered its greeting",
  (await evaluate("document.querySelectorAll('#expert-messages .expert-message').length")) >= 1,
);

// 2. First tab mounts a frame, clicked the way a user would.
await evaluate("document.getElementById('tab-photocraft').click()");
await sleep(2500);
check("one iframe after the first tab", (await evaluate("document.querySelectorAll('#canvas-workspace iframe').length")) === 1);
check(
  "photocraft frame points at its app build",
  (await evaluate("document.querySelector('#canvas-workspace iframe').getAttribute('src')")) === "apps/photocraft/index.html?webgl",
);
check(
  "photocraft tab is marked active",
  (await evaluate("document.getElementById('tab-photocraft').getAttribute('aria-pressed')")) === "true",
);
const photocraftFrame = await evaluate(`(() => {
  const frame = document.querySelector('#canvas-workspace iframe');
  try {
    const doc = frame.contentDocument;
    return { ok: !!doc && doc.body.children.length > 0, title: doc?.title ?? '', children: doc?.body.children.length ?? 0 };
  } catch (error) { return { ok: false, title: String(error), children: 0 }; }
})()`);
check(
  "photocraft build actually loads inside the frame",
  photocraftFrame.ok,
  `title=${photocraftFrame.title} children=${photocraftFrame.children}`,
);
check("canvas placeholder removed", (await evaluate("document.querySelector('#canvas-workspace h2')")) === null);

// 3. Switching tabs keeps the first frame alive.
await evaluate("document.getElementById('tab-deckcraft').click()");
await sleep(2500);
check("two iframes after the second tab", (await evaluate("document.querySelectorAll('#canvas-workspace iframe').length")) === 2);
check(
  "only the active frame is visible",
  (await evaluate("[...document.querySelectorAll('#canvas-workspace > div')].filter((el) => !el.classList.contains('hidden')).length")) === 1,
);
check(
  "hidden frame is still deckcraft's sibling, photocraft retained",
  (await evaluate("[...document.querySelectorAll('#canvas-workspace iframe')].map((el) => el.getAttribute('src')).join(',')")) ===
    "apps/photocraft/index.html?webgl,apps/deckcraft/index.html?webgl",
);
check(
  "deckcraft tab is active and photocraft is not",
  (await evaluate("document.getElementById('tab-deckcraft').getAttribute('aria-pressed')")) === "true" &&
    (await evaluate("document.getElementById('tab-photocraft').getAttribute('aria-pressed')")) === "false",
);

// 4. Reload replaces exactly the active frame.
const before = await evaluate("document.querySelector('#canvas-workspace > div:not(.hidden) iframe') !== null");
await evaluate("document.querySelector('#dynamic-toolbar button').click()");
await sleep(2500);
check("reload keeps both frames", (await evaluate("document.querySelectorAll('#canvas-workspace iframe').length")) === 2);
check("reload re-created the active frame", before === true);
check(
  "active frame still points at deckcraft",
  (await evaluate("document.querySelector('#canvas-workspace > div:not(.hidden) iframe').getAttribute('src')")) ===
    "apps/deckcraft/index.html?webgl",
);

// 5. Rust commands: export through VectorCraft, rasterize through PhotoCraft.
await evaluate("document.getElementById('clipboard-export').click()");
await sleep(2500);
const exportStatus = await evaluate("document.getElementById('clipboard-status').textContent");
check("Export SVG reports success", /shared clipboard/i.test(exportStatus), exportStatus);
check(
  "clipboard preview renders the SVG through a Blob URL",
  await evaluate("(document.querySelector('#clipboard-preview img')?.src ?? '').startsWith('blob:')"),
);
check("Rasterize is enabled for an SVG", (await evaluate("document.getElementById('clipboard-rasterize').disabled")) === false);

await evaluate("document.getElementById('clipboard-rasterize').click()");
await sleep(4000);
const rasterStatus = await evaluate("document.getElementById('clipboard-status').textContent");
check("Rasterize reports success", /Rasterized with PhotoCraft/i.test(rasterStatus), rasterStatus);
check(
  "PhotoCraft PNG is displayed",
  await evaluate("(document.querySelector('#clipboard-result img')?.src ?? '').startsWith('data:image/png;base64,')"),
);

// 6. Notification log written for the activations, and no permission errors anywhere.
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

const denied = [...consoleMessages, ...logEntries].filter((entry) =>
  /not allowed|denied|permission|blocked by|refused to/i.test(entry.text),
);
check("no permission or CSP errors in the webview console", denied.length === 0, denied.map((entry) => entry.text).join(" | "));
const errors = [...consoleMessages.filter((entry) => entry.type === "error"), ...logEntries.filter((entry) => entry.level === "error")];
check("no console errors", errors.length === 0, errors.map((entry) => entry.text).join(" | "));

// 7. Every one of the ten apps loads its real build inside its frame.
const tabIds = await evaluate("JSON.stringify([...document.querySelectorAll('#module-tabs button')].map((el) => el.id))").then(JSON.parse);
const loaded = [];
for (const tabId of tabIds) {
  await evaluate(`document.getElementById(${JSON.stringify(tabId)}).click()`);
  let ready = false;
  let title = "";
  let children = 0;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(500);
    const state = await evaluate(`(() => {
      const wrapper = [...document.querySelectorAll('#canvas-workspace > div')].find((el) => !el.classList.contains('hidden'));
      const frame = wrapper?.querySelector('iframe');
      try {
        const doc = frame?.contentDocument;
        return { ready: !!doc && doc.readyState !== 'loading' && doc.body.children.length > 0, title: doc?.title ?? '', children: doc?.body.children.length ?? 0 };
      } catch { return { ready: false, title: '', children: 0 }; }
    })()`);
    title = state.title;
    children = state.children;
    if (state.ready) {
      ready = true;
      break;
    }
  }
  loaded.push({ tabId: tabId.replace("tab-", ""), ready, title });
}
for (const app of loaded) {
  check(`${app.tabId} loads its web build`, app.ready, `title=${app.title}`);
}
check("all ten frames stay resident", (await evaluate("document.querySelectorAll('#canvas-workspace iframe').length")) === 10);

// 8. The Expert panel answers a question in the running app.
await evaluate("document.getElementById('expert-toggle').click()");
await evaluate(`(() => {
  const input = document.getElementById('expert-input');
  input.value = 'What is PDFCraft?';
  document.getElementById('expert-form').requestSubmit();
})()`);
await sleep(2500);
const expertAnswer = await evaluate("[...document.querySelectorAll('#expert-messages .expert-message-expert p')].at(-1)?.textContent ?? ''");
check("Suite Expert answers in the panel", /PDFCraft/.test(expertAnswer), expertAnswer.slice(0, 80));

socket.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exitCode = failures.length ? 1 : 0;
