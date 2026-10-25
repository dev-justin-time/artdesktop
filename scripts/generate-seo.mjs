import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  appGraph,
  apps,
  appUrl,
  baseUrl,
  catalog,
  docUrl,
  docsUrl,
  escapeHtml,
  injectHead,
  jsonLd,
  organizationNode,
  pagesDir,
  pageTitle,
  releases,
  renderHead,
  root,
  site,
  suiteGraph,
  suiteUrl,
  truncate,
  websiteNode,
  writeOrCheck,
  ogImageUrl,
} from "./lib/site.mjs";

const check = process.argv.includes("--check");

function assertRelease(app) {
  if (!releases[app.id]) throw new Error(`no release entry for ${app.id}`);
}

async function writePageHead(file, head) {
  const current = await readFile(file, "utf8");
  const next = injectHead(current, head);
  await writeOrCheck(file, next, check);
}

async function marketingPages() {
  for (const app of apps) {
    assertRelease(app);
    const file = path.join(pagesDir, app.id, "index.html");
    const head = renderHead({
      title: pageTitle(app),
      description: app.description,
      keywords: app.keywords,
      canonical: appUrl(app.id),
      structuredData: appGraph(app),
    });
    await writePageHead(file, head);
  }

  const suiteHead = renderHead({
    title: `${site.name} — ten Rust creative apps in one workspace`,
    description: truncate(site.description),
    keywords: site.keywords,
    canonical: suiteUrl,
    structuredData: suiteGraph(),
  });
  await writePageHead(path.join(pagesDir, "suite", "index.html"), suiteHead);

  const indexFile = path.join(pagesDir, "index.html");
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(site.name)}</title>
<meta name="description" content="${escapeHtml(site.description)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${escapeHtml(suiteUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(site.name)}">
<meta property="og:title" content="${escapeHtml(site.name)}">
<meta property="og:description" content="${escapeHtml(site.description)}">
<meta property="og:url" content="${escapeHtml(suiteUrl)}">
<meta property="og:image" content="${escapeHtml(ogImageUrl)}">
<meta property="og:image:alt" content="${escapeHtml(`${site.name} social card`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(site.name)}">
<meta name="twitter:description" content="${escapeHtml(site.description)}">
<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
<meta http-equiv="refresh" content="0; url=suite/">
<script type="application/ld+json">
${jsonLd([organizationNode(), websiteNode()])}
</script>
<style>body{background:#07090d;color:#e6eaf2;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center;padding:24px}a{color:#22d3ee}</style>
</head>
<body>
<main>
  <h1>${escapeHtml(site.name)}</h1>
  <p>Continue to <a href="suite/">the suite overview</a> or read the <a href="docs/">documentation</a>.</p>
</main>
</body>
</html>
`;
  await writeOrCheck(indexFile, indexHtml, check);
}

function sitemap() {
  const urls = [suiteUrl, docsUrl, ...apps.flatMap((app) => [appUrl(app.id), docUrl(app.id)])];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeHtml(url)}</loc>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

function robots() {
  return `# ${site.name}
User-agent: *
Allow: /

Sitemap: ${baseUrl}${site.pagesPath.replace(/\/+$/, "")}/sitemap.xml
`;
}

function llms() {
  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `${site.name} is a Rust and Tauri desktop shell that runs the official browser builds of ten Storytold creative apps in one window. Each app build is pinned to a release tag, checksum-verified and bundled for offline use. The shell is Apache-2.0; the apps are open-source projects by Storytold.`,
    "",
    "## Apps",
    ...apps.map(
      (app) => `- [${app.name}](${appUrl(app.id)}): ${app.description} (${releases[app.id]?.tag ?? "latest"})`,
    ),
    "",
    "## Documentation",
    `- [Documentation index](${docsUrl}): feature-by-feature guides for all ten apps.`,
    ...apps.map((app) => `- [${app.name} guide](${docUrl(app.id)}): ${app.features.length} documented features, FAQ and agent access.`),
    "",
    "## Agent integration",
    `- [A2A Agent Card](${baseUrl}${site.pagesPath.replace(/\/+$/, "")}/.well-known/agent-card.json): discovery document listing every app as a skill. Discovery only; the suite does not accept remote A2A tasks yet.`,
    `- MCP server: run \`node scripts/mcp-server.mjs\` from ${site.repository}. Tools: list_apps, search_apps, get_app_guide, recommend_app, get_agent_notifications, get_suite_manifest.`,
    `- [Notification log](${site.repository}/blob/main/README.md#documentation-search-and-agent-discovery): the shell appends module and clipboard events to a local JSONL file that agents can tail.`,
    `- [Sitemap](${baseUrl}${site.pagesPath.replace(/\/+$/, "")}/sitemap.xml)`,
    "",
    "## Optional",
    `- [GitHub repository](${site.repository})`,
    `- [License](${site.repository}/blob/main/LICENSE): Apache-2.0.`,
    `- [Issues](${site.repository}/issues)`,
  ];
  return `${lines.join("\n")}\n`;
}

function agentCard() {
  return {
    protocolVersion: "0.3.0",
    name: site.name,
    description:
      `${site.description} This Agent Card is published for discovery only: the suite does not accept remote A2A tasks yet. ` +
      "Local agent integration is available through the bundled MCP server and the on-disk notification log.",
    url: suiteUrl,
    preferredTransport: "JSONRPC",
    version: catalog.site.version ?? "0.1.0",
    provider: { organization: site.publisher, url: baseUrl },
    iconUrl: ogImageUrl,
    documentationUrl: docsUrl,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      extensions: [
        {
          uri: `${baseUrl}/#a2a-discovery-only`,
          description:
            "Discovery-only Agent Card: the suite does not accept remote A2A tasks yet. Local agent integration is available through the bundled MCP server and notification log.",
          required: false,
        },
      ],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: apps.map((app) => ({
      id: app.id,
      name: `${app.name} ${app.category.toLowerCase()}`,
      description: app.description,
      tags: [app.category, app.applicationCategory, ...app.keywords.slice(0, 6)],
      examples: [
        `What can ${app.name} do?`,
        `Which ${app.name} feature should I use for ${app.category.toLowerCase()}?`,
      ],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
      documentationUrl: docUrl(app.id),
    })),
  };
}

function agentCardText() {
  return `${JSON.stringify(agentCard(), null, 2)}\n`;
}

async function main() {
  await marketingPages();
  const pagesRoot = path.join(pagesDir);
  await writeOrCheck(path.join(pagesRoot, "sitemap.xml"), sitemap(), check);
  await writeOrCheck(path.join(pagesRoot, "robots.txt"), robots(), check);
  await writeOrCheck(path.join(pagesRoot, "llms.txt"), llms(), check);
  await writeOrCheck(path.join(pagesRoot, ".well-known", "agent-card.json"), agentCardText(), check);
  await writeOrCheck(path.join(pagesRoot, ".well-known", "agent.json"), agentCardText(), check);

  if (check) {
    console.log("SEO and discovery artifacts are up to date");
  } else {
    console.log("updated marketing metadata, sitemap.xml, robots.txt, llms.txt and the A2A Agent Card");
  }
}

await main();
