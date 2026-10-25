#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { apps, docUrl, docsUrl, releases, root, site, appUrl } from "./lib/site.mjs";

const SERVER_INFO = { name: "artcraft-suite", title: "ArtCraft Studio", version: "0.1.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const IDENTIFIER = "com.storytold.artcraft";
const guidesRoot = path.join(root, "crates", "craft-studio-shell", "ui", "public", "apps");

const STOP_WORDS = new Set(
  "a an and are as at be but by can could do does for from has have how i if in into is it its me my no not of on or our should so than that the their them then there these they this to us was we were what when where which who why will with would you your".split(
    " ",
  ),
);

function defaultNotificationLog() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), IDENTIFIER, "agent-notifications.jsonl");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", IDENTIFIER, "agent-notifications.jsonl");
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), IDENTIFIER, "agent-notifications.jsonl");
}

const notificationLog = process.env.ARTCRAFT_NOTIFICATION_LOG || defaultNotificationLog();

function terms(text) {
  return [...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  )];
}

function countOccurrences(haystack, needles) {
  let score = 0;
  for (const needle of needles) {
    let index = 0;
    let hits = 0;
    while (hits < 5) {
      index = haystack.indexOf(needle, index);
      if (index === -1) break;
      hits += 1;
      index += needle.length;
    }
    if (haystack.includes(needle)) score += hits;
  }
  return score;
}

function appSearchText(app) {
  return [
    app.name,
    app.category,
    app.description,
    app.tagline,
    app.keywords.join(" "),
    app.features.map((feature) => `${feature.name} ${feature.summary}`).join(" "),
    app.capabilities.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

const appIndex = apps.map((app) => ({ app, haystack: appSearchText(app) }));

function rankApps(query, limit = 5) {
  const needles = terms(query);
  if (!needles.length) return [];
  return appIndex
    .map(({ app, haystack }) => {
      let score = countOccurrences(haystack, needles);
      for (const needle of needles) {
        if (app.name.toLowerCase() === needle) score += 20;
        else if (app.name.toLowerCase().includes(needle)) score += 8;
        if (app.id === needle) score += 20;
        if (app.category.toLowerCase().includes(needle)) score += 4;
        if (app.keywords.some((keyword) => keyword.toLowerCase() === needle)) score += 5;
      }
      return { app, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

function cleanMarkdown(markdown) {
  return markdown
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[a-z]*/gi, " ")
    .replace(/[`*_>|]/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const guideCache = new Map();

async function loadGuide(app) {
  if (guideCache.has(app.id)) return guideCache.get(app.id);
  let guide = null;
  try {
    const markdown = await readFile(path.join(guidesRoot, app.id, "README.md"), "utf8");
    const parts = markdown.split(/^#{2,3} /m);
    const sections = parts.map((part, index) => {
      if (index === 0) return { title: "Overview", body: cleanMarkdown(part) };
      const newline = part.indexOf("\n");
      const title = (newline === -1 ? part : part.slice(0, newline)).trim();
      const body = cleanMarkdown(newline === -1 ? "" : part.slice(newline + 1));
      return { title, body };
    }).filter((section) => section.body.length > 40);
    guide = { sections };
  } catch {
    guide = null;
  }
  guideCache.set(app.id, guide);
  return guide;
}

function excerpt(text, needles, maxChars) {
  if (text.length <= maxChars) return text;
  let at = -1;
  for (const needle of needles) {
    const index = text.toLowerCase().indexOf(needle);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  const start = Math.max(0, at === -1 ? 0 : at - Math.floor(maxChars / 4));
  const slice = text.slice(start, start + maxChars);
  return `${start > 0 ? "…" : ""}${slice.trim()}${start + maxChars < text.length ? "…" : ""}`;
}

async function guideAnswer(app, query, maxChars) {
  const guide = await loadGuide(app);
  const needles = terms(query);
  const header = `${app.name} — ${app.category}\n${app.description}\nDocumentation: ${docUrl(app.id)}`;

  if (!guide) {
    const features = app.features.map((feature) => `- ${feature.name}: ${feature.summary}`).join("\n");
    return `${header}\n\nBundled upstream guide is not present in this checkout, so this answer uses the suite catalogue:\n\n${features}`;
  }

  let sections = guide.sections;
  if (needles.length) {
    sections = sections
      .map((section) => ({
        ...section,
        score: countOccurrences(`${section.title} ${section.body}`.toLowerCase(), needles),
      }))
      .filter((section) => section.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
  } else {
    sections = sections.slice(0, 4);
  }

  if (!sections.length) {
    const titles = guide.sections.map((section) => `- ${section.title}`).join("\n");
    return `${header}\n\nNo bundled guide section matched "${query}". Sections available:\n${titles}\n\nAsk again with a feature name such as "${app.features[0].name}".`;
  }

  const body = sections
    .map((section) => `## ${section.title}\n${excerpt(section.body, needles, maxChars)}`)
    .join("\n\n");
  return `${header}\n\n${body}\n\nSource: upstream ${app.name} README, bundled with the suite.`;
}

async function notifications(limit) {
  try {
    const raw = await readFile(notificationLog, "utf8");
    const lines = raw.trim().split(/\r?\n/).filter(Boolean).slice(-limit);
    if (!lines.length) return `No agent notifications yet.\nLog: ${notificationLog}`;
    return `Recent agent notifications (newest last)\nLog: ${notificationLog}\n\n${lines.join("\n")}`;
  } catch (error) {
    if (error.code === "ENOENT") {
      return `No notification log yet. The shell writes it once a module is activated or the clipboard changes.\nExpected path: ${notificationLog}`;
    }
    throw error;
  }
}

const TOOLS = [
  {
    name: "list_apps",
    description: "List the ten ArtCraft Studio apps with category, feature count, pinned release and documentation link.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_apps",
    description: "Search app names, categories, keywords and documented features. Use when the user describes a task instead of naming an app.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Task or capability, for example 'edit RAW photos' or 'build a slide deck'." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Maximum results (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "recommend_app",
    description: "Recommend the best app for a creative task, with the matching features that justify each choice.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "What the user wants to make or do." },
        limit: { type: "integer", minimum: 1, maximum: 5, description: "Maximum recommendations (default 3)." },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
  {
    name: "get_app_guide",
    description: "Read the feature-by-feature guide for one app. Optionally focus on a feature or question. Uses the bundled upstream README, with the suite catalogue as fallback.",
    inputSchema: {
      type: "object",
      properties: {
        app: { type: "string", enum: apps.map((app) => app.id), description: "App id." },
        query: { type: "string", description: "Optional feature or question to focus the answer." },
        maxChars: { type: "integer", minimum: 300, maximum: 6000, description: "Excerpt budget per section (default 1600)." },
      },
      required: ["app"],
      additionalProperties: false,
    },
  },
  {
    name: "get_agent_notifications",
    description: "Read the shell's local JSONL notification log: module activations and clipboard updates that agents can follow.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Number of trailing entries (default 20)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_suite_manifest",
    description: "Return the machine-readable suite manifest: site, apps, documentation URLs and pinned releases.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function toolResult(text) {
  return { content: [{ type: "text", text }], isError: false };
}

function formatAppLine(app) {
  return `- ${app.name} (${app.id}) — ${app.category}; ${app.features.length} documented features; ${releases[app.id]?.tag ?? "version unknown"}; ${docUrl(app.id)}`;
}

async function callTool(name, args) {
  switch (name) {
    case "list_apps": {
      const lines = apps.map(formatAppLine);
      return toolResult(`# ArtCraft Studio apps\n\n${lines.join("\n")}\n\nRun scripts/mcp-server.mjs and call get_app_guide with an app id for details.`);
    }
    case "search_apps": {
      const results = rankApps(args.query ?? "", args.limit ?? 5);
      if (!results.length) {
        return toolResult(`No app matched "${args.query}". Try a broader verb, for example "edit photos", "make a deck" or "organise PDFs".`);
      }
      return toolResult(
        results
          .map(({ app, score }) => `${formatAppLine(app)}\n  Matched ${score} term(s); try ${app.features.slice(0, 2).map((feature) => `"${feature.name}"`).join(", ")}.`)
          .join("\n"),
      );
    }
    case "recommend_app": {
      const results = rankApps(args.task ?? "", args.limit ?? 3);
      if (!results.length) {
        return toolResult(`No single app is a clear fit for "${args.task}". The suite covers photo editing, vector art, video, writing, decks, page layout, motion graphics, RAW, spreadsheets and PDFs.`);
      }
      return toolResult(
        results
          .map(({ app }) => `## ${app.name} — ${app.category}\n${app.description}\nDocumentation: ${docUrl(app.id)}\nRelevant features:\n${app.features.slice(0, 3).map((feature) => `- ${feature.name}: ${feature.summary}`).join("\n")}`)
          .join("\n\n"),
      );
    }
    case "get_app_guide": {
      const app = apps.find((entry) => entry.id === args.app);
      if (!app) throw new Error(`unknown app "${args.app}"; expected one of: ${apps.map((entry) => entry.id).join(", ")}`);
      return toolResult(await guideAnswer(app, args.query ?? "", args.maxChars ?? 1600));
    }
    case "get_agent_notifications":
      return toolResult(await notifications(args.limit ?? 20));
    case "get_suite_manifest":
      return toolResult(
        JSON.stringify(
          {
            site,
            documentation: docsUrl,
            apps: apps.map((app) => ({
              id: app.id,
              name: app.name,
              category: app.category,
              description: app.description,
              keywords: app.keywords,
              features: app.features.map((feature) => feature.name),
              release: releases[app.id] ?? null,
              appUrl: appUrl(app.id),
              documentationUrl: docUrl(app.id),
            })),
            agentCard: `${site.url}${site.pagesPath}/.well-known/agent-card.json`,
            notificationLog,
          },
          null,
          2,
        ),
      );
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function succeed(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    const requested = params?.protocolVersion;
    succeed(id, {
      protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
      capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "Offline catalogue, feature guides and local activity log for the ten ArtCraft Studio apps. Use search_apps or recommend_app to pick an app, then get_app_guide for feature-level detail.",
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") {
    succeed(id, {});
    return;
  }
  if (method === "tools/list") {
    succeed(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    try {
      succeed(id, await callTool(params?.name, params?.arguments ?? {}));
    } catch (error) {
      if (error.code === -32602) fail(id, -32602, error.message);
      else fail(id, -32603, error.message);
    }
    return;
  }
  if (method === "resources/list") {
    succeed(id, {
      resources: [
        { uri: "suite://catalog", name: "ArtCraft suite catalogue", mimeType: "application/json" },
        { uri: "suite://guides", name: "App guide index", mimeType: "text/markdown" },
        { uri: "suite://notifications", name: "Local agent notifications", mimeType: "application/jsonl" },
      ],
    });
    return;
  }
  if (method === "resources/templates/list") {
    succeed(id, {
      resourceTemplates: [
        { uriTemplate: "suite://apps/{app}/guide", name: "Bundled app guide", mimeType: "text/markdown" },
      ],
    });
    return;
  }
  if (method === "resources/read") {
    const uri = params?.uri ?? "";
    try {
      if (uri === "suite://catalog") {
        succeed(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ site, apps, releases }, null, 2) }] });
        return;
      }
      if (uri === "suite://guides") {
        succeed(id, {
          contents: [{ uri, mimeType: "text/markdown", text: apps.map(formatAppLine).join("\n") }],
        });
        return;
      }
      if (uri === "suite://notifications") {
        succeed(id, { contents: [{ uri, mimeType: "application/jsonl", text: await notifications(50) }] });
        return;
      }
      const match = uri.match(/^suite:\/\/apps\/([a-z0-9-]+)\/guide$/);
      if (match) {
        const app = apps.find((entry) => entry.id === match[1]);
        if (!app) throw new Error(`unknown app in URI: ${uri}`);
        succeed(id, { contents: [{ uri, mimeType: "text/markdown", text: await guideAnswer(app, "", 2000) }] });
        return;
      }
      fail(id, -32002, `Resource not found: ${uri}`);
    } catch (error) {
      fail(id, -32603, error.message);
    }
    return;
  }
  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail(null, -32700, "Parse error");
    return;
  }
  handle(message).catch((error) => {
    if (message?.id !== undefined) fail(message.id, -32603, error.message);
  });
});
