#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = spawn(process.execPath, [path.join(root, "scripts", "mcp-server.mjs")], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
});

const stdout = readline.createInterface({ input: server.stdout });
const stderr = [];
server.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

let nextId = 1;
const pending = new Map();

const timer = setTimeout(() => {
  console.error("MCP smoke test timed out");
  server.kill();
  process.exit(1);
}, 15000);

stdout.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.error(`non-JSON output: ${line}`);
    return;
  }
  const resolver = pending.get(message.id);
  if (!resolver) return;
  pending.delete(message.id);
  if (message.error) resolver.reject(new Error(message.error.message));
  else resolver.resolve(message.result);
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "artcraft-smoke", version: "0.0.0" },
  });
  assert(init.protocolVersion === "2025-06-18", "initialize must negotiate the requested protocol");
  assert(init.serverInfo?.name === "artcraft-suite", "initialize must identify the server");

  const tools = await request("tools/list", {});
  const names = tools.tools.map((tool) => tool.name);
  for (const expected of ["list_apps", "search_apps", "recommend_app", "get_app_guide", "get_agent_notifications", "get_suite_manifest"]) {
    assert(names.includes(expected), `missing tool ${expected}`);
  }

  const list = await request("tools/call", { name: "list_apps", arguments: {} });
  const listText = list.content[0].text;
  for (const app of ["PhotoCraft", "VectorCraft", "FilmCraft", "WordCraft", "DeckCraft", "DesignCraft", "EffectCraft", "LightCraft", "GridCraft", "PdfCraft"]) {
    assert(listText.includes(app), `list_apps missing ${app}`);
  }

  const guide = await request("tools/call", { name: "get_app_guide", arguments: { app: "photocraft", query: "PSD" } });
  const guideText = guide.content[0].text;
  assert(guideText.includes("PhotoCraft"), "guide must name the app");
  assert(/psd/i.test(guideText), "guide must answer the PSD query");

  const recommendation = await request("tools/call", { name: "recommend_app", arguments: { task: "edit RAW photos" } });
  assert(/LightCraft/.test(recommendation.content[0].text), "RAW task must recommend LightCraft");

  const catalogResource = await request("resources/read", { uri: "suite://catalog" });
  const parsed = JSON.parse(catalogResource.contents[0].text);
  assert(parsed.apps.length === 10, "catalog resource must contain ten apps");

  const templates = await request("resources/templates/list", {});
  assert(templates.resourceTemplates.length === 1, "guide resource template must be advertised");

  console.log("MCP server: initialize, tools, guide, recommendation, resources and templates all pass");
} catch (error) {
  console.error(`MCP smoke test failed: ${error.message}`);
  if (stderr.length) console.error(stderr.join("").trim());
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  server.stdin.end();
  server.kill();
}
