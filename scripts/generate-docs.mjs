import path from "node:path";
import {
  apps,
  appUrl,
  baseUrl,
  breadcrumbNode,
  docUrl,
  docsUrl,
  escapeHtml,
  organizationNode,
  releases,
  renderHead,
  root,
  site,
  softwareApplicationNode,
  suiteUrl,
  truncate,
  websiteNode,
  writeOrCheck,
  faqNode,
} from "./lib/site.mjs";

const check = process.argv.includes("--check");

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const repoUrl = site.repository;
const agentCard = (toRoot) => `${toRoot}.well-known/agent-card.json`;
const llms = (toRoot) => `${toRoot}llms.txt`;

function header(toRoot, current) {
  const item = (href, label, key) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${toRoot}suite/">
      <span class="brand-mark" aria-hidden="true">◆</span>
      <span>ArtCraft <strong>Studio</strong></span>
    </a>
    <nav aria-label="Primary">
      ${item(`${toRoot}suite/`, "Overview", "overview")}
      ${item(`${toRoot}docs/`, "Docs", "docs")}
      ${item(llms(toRoot), "For agents", "agents")}
      <a href="${repoUrl}" rel="noopener">GitHub</a>
    </nav>
  </div>
</header>`;
}

function sidebar(toRoot, current, toc = []) {
  const appLinks = apps
    .map(
      (app) =>
        `<a href="${toRoot}docs/${app.id}/"${app.id === current ? ' aria-current="page"' : ""}>${app.name}<span>${app.category}</span></a>`,
    )
    .join("");
  const tocLinks = toc.length
    ? `<p class="eyebrow">On this page</p>
    <nav class="toc" aria-label="On this page">
      ${toc.map(([href, label]) => `<a href="#${href}">${label}</a>`).join("")}
    </nav>`
    : "";
  return `<aside class="sidebar">
    <p class="eyebrow">Documentation</p>
    <nav aria-label="App guides">${appLinks}</nav>
    ${tocLinks}
  </aside>`;
}

function footer(toRoot) {
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-about">
      <a class="brand" href="${toRoot}suite/"><span class="brand-mark" aria-hidden="true">◆</span><span>ArtCraft <strong>Studio</strong></span></a>
      <p>${escapeHtml(site.description)}</p>
    </div>
    <div>
      <h2>Quick links</h2>
      <ul>
        <li><a href="${toRoot}suite/">Suite overview</a></li>
        <li><a href="${toRoot}docs/">Documentation</a></li>
        <li><a href="${toRoot}sitemap.xml">Sitemap</a></li>
        <li><a href="${repoUrl}/releases" rel="noopener">Downloads</a></li>
      </ul>
    </div>
    <div>
      <h2>For agents</h2>
      <ul>
        <li><a href="${agentCard(toRoot)}">A2A Agent Card</a></li>
        <li><a href="${llms(toRoot)}">llms.txt</a></li>
        <li><a href="${toRoot}docs/#agents">MCP server</a></li>
        <li><a href="${toRoot}docs/#agents">Notification log</a></li>
      </ul>
    </div>
    <div>
      <h2>Project</h2>
      <ul>
        <li><a href="${repoUrl}" rel="noopener">GitHub repository</a></li>
        <li><a href="${repoUrl}/issues" rel="noopener">Report an issue</a></li>
        <li><a href="${repoUrl}/blob/main/LICENSE" rel="noopener">Apache-2.0 licence</a></li>
        <li><a href="${toRoot}robots.txt">robots.txt</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>© 2026 ${escapeHtml(site.publisher)}. The ten apps are open-source projects by Storytold.</p>
    <p>Built with Rust, Tauri and zero-tracking documentation.</p>
  </div>
</footer>`;
}

function documentPage({ title, description, canonical, keywords, structuredData, body, toRoot, current, toc }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${renderHead({ title, description, keywords, canonical, type: canonical === docsUrl ? "website" : "article", structuredData })}
<link rel="stylesheet" href="${toRoot}docs/docs.css">
</head>
<body>
${header(toRoot, "docs")}
<div class="layout wrap">
${sidebar(toRoot, current, toc)}
<main id="main">
${body}
</main>
</div>
${footer(toRoot)}
</body>
</html>
`;
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items
    .map((item, index) =>
      index === items.length - 1
        ? `<li aria-current="page">${escapeHtml(item.label)}</li>`
        : `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`,
    )
    .join("")}</ol></nav>`;
}

function appBody(app, toRoot) {
  const release = releases[app.id];
  const featureItems = app.features
    .map(
      (feature, index) => `<article class="feature" id="feature-${slug(feature.name)}">
  <span class="index">${String(index + 1).padStart(2, "0")}</span>
  <h3>${escapeHtml(feature.name)}</h3>
  <p>${escapeHtml(feature.summary)}</p>
</article>`,
    )
    .join("\n");

  const faq = app.faq
    .map(
      (entry) => `<details>
  <summary>${escapeHtml(entry.question)}</summary>
  <div class="answer">${escapeHtml(entry.answer)}</div>
</details>`,
    )
    .join("\n");

  const related = apps
    .filter((other) => other.id !== app.id && other.applicationCategory === app.applicationCategory)
    .slice(0, 3);
  const relatedLinks = related.length
    ? `<ul class="chips">${related
        .map((other) => `<li><a href="${toRoot}docs/${other.id}/">${other.name}</a> — ${escapeHtml(other.category)}</li>`)
        .join("")}</ul>`
    : "";

  const index = apps.findIndex((entry) => entry.id === app.id);
  const previous = apps[(index - 1 + apps.length) % apps.length];
  const next = apps[(index + 1) % apps.length];

  return `${breadcrumbs([
    { label: site.name, href: `${toRoot}suite/` },
    { label: "Documentation", href: `${toRoot}docs/` },
    { label: app.name },
  ])}
<div class="hero">
  <div class="meta">
    <span class="pill accent">${escapeHtml(app.category)}</span>
    ${release ? `<span class="pill">${escapeHtml(release.tag)}</span>` : ""}
    <span class="pill">Open source</span>
  </div>
  <h1>${escapeHtml(app.name)}</h1>
  <p class="lede">${escapeHtml(app.tagline)}</p>
  <p class="summary">${escapeHtml(app.description)}</p>
  <div class="hero-actions">
    <a class="button primary" href="${toRoot}suite/">Open in the suite</a>
    ${release ? `<a class="button" href="https://github.com/storytold/${app.id}/releases/tag/${encodeURIComponent(release.tag)}" rel="noopener">Release notes</a>` : ""}
    <a class="button" href="#agents">Agent access</a>
  </div>
</div>

<section aria-labelledby="features-title">
  <h2 id="features-title">Features, one by one</h2>
  <p class="section-intro">What ${escapeHtml(app.name)} does in ${escapeHtml(app.category.toLowerCase())}, documented feature by feature.</p>
  <div class="features">
${featureItems}
  </div>
</section>

<section aria-labelledby="fit-title">
  <h2 id="fit-title">Where it fits</h2>
  <p class="section-intro">${escapeHtml(app.name)} runs as one of ten tabs in ${escapeHtml(site.name)}. Work stays on the same machine and the same window.</p>
  ${relatedLinks || `<p class="section-intro">Browse all ten app guides in the <a href="${toRoot}docs/">documentation index</a>.</p>`}
</section>

<section id="agents" aria-labelledby="agents-title">
  <h2 id="agents-title">Agent access</h2>
  <div class="callout">
    <h3>Give an agent this guide</h3>
    <p>The suite's Model Context Protocol server serves every app guide through <code>get_app_guide</code>. Run <code>node scripts/mcp-server.mjs</code> from the repository and call it with <code>${app.id}</code>. The upstream desktop build may also ship its own CLI and MCP server; check its release notes for those interfaces.</p>
    <p><a href="${llms(toRoot)}">llms.txt</a> · <a href="${agentCard(toRoot)}">A2A Agent Card</a> · <a href="${toRoot}docs/#agents">How agent discovery works</a></p>
  </div>
</section>

<section id="faq" aria-labelledby="faq-title">
  <h2 id="faq-title">FAQ</h2>
  ${faq}
</section>

<nav class="pager" aria-label="Documentation pages">
  <a href="${toRoot}docs/${previous.id}/"><span class="label">Previous</span>${previous.name}</a>
  <a class="next" href="${toRoot}docs/${next.id}/"><span class="label">Next</span>${next.name}</a>
</nav>`;
}

function appStructuredData(app) {
  const url = docUrl(app.id);
  return [
    organizationNode(),
    websiteNode(),
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      headline: `${app.name} documentation`,
      description: app.description,
      url,
      mainEntityOfPage: url,
      about: { "@id": `${appUrl(app.id)}#application` },
      author: { "@id": `${baseUrl}/#organization` },
      publisher: { "@id": `${baseUrl}/#organization` },
      inLanguage: "en",
      articleSection: "Documentation",
      keywords: app.keywords.join(", "),
    },
    softwareApplicationNode(app, appUrl(app.id)),
    breadcrumbNode([
      { name: site.name, url: suiteUrl },
      { name: "Documentation", url: docsUrl },
      { name: app.name, url },
    ]),
  ];
}

function hubBody(toRoot) {
  const cards = apps
    .map((app) => {
      const release = releases[app.id];
      return `<a class="app-card" href="${toRoot}docs/${app.id}/">
  <div class="app-card-top"><h3>${escapeHtml(app.name)}</h3><span class="icon" aria-hidden="true">${app.icon}</span></div>
  <p>${escapeHtml(app.tagline)}</p>
  <div class="card-meta"><span>${escapeHtml(app.category)}</span><span>${app.features.length} features</span>${release ? `<span>${escapeHtml(release.tag)}</span>` : ""}</div>
</a>`;
    })
    .join("\n");

  return `${breadcrumbs([
    { label: site.name, href: `${toRoot}suite/` },
    { label: "Documentation" },
  ])}
<div class="hero">
  <div class="meta"><span class="pill accent">${apps.length} app guides</span><span class="pill">Updated with each release</span></div>
  <h1>Documentation</h1>
  <p class="lede">Every ArtCraft app, explained feature by feature.</p>
  <p class="summary">${escapeHtml(site.description)} Each guide covers what the app does, how it fits into the suite, its FAQ and the ways an agent can read the same material.</p>
</div>

<section id="apps" aria-labelledby="apps-title">
  <h2 id="apps-title">Browse the guides</h2>
  <p class="section-intro">Pick an app to see its full feature list, agent access notes and FAQ.</p>
  <div class="app-grid">
${cards}
  </div>
</section>

<section aria-labelledby="suite-title">
  <h2 id="suite-title">How the suite fits together</h2>
  <div class="features">
    <article class="feature"><span class="index">01</span><h3>One window, ten apps</h3><p>The shell mounts the official browser build of each app as a tab, with a shared window and no separate installs.</p></article>
    <article class="feature"><span class="index">02</span><h3>Pinned and verified</h3><p>Every build is pinned to a release tag, downloaded at build time, checked against a SHA-256 hash and bundled for offline use.</p></article>
    <article class="feature"><span class="index">03</span><h3>Free and open source</h3><p>The shell is Apache-2.0. The ten apps are open-source Storytold projects, each with its own upstream repository.</p></article>
  </div>
</section>

<section id="agents" aria-labelledby="agents-title">
  <h2 id="agents-title">Agent discovery</h2>
  <p class="section-intro">Machines can read the same catalogue the docs are built from.</p>
  <div class="features">
    <article class="feature"><span class="index">A2A</span><h3>A2A Agent Card</h3><p>A discovery document lists every app as a skill with tags and example prompts. It is published for discovery only; the suite does not accept remote A2A tasks.</p><p><a href="${agentCard(toRoot)}">Open the Agent Card</a></p></article>
    <article class="feature"><span class="index">MCP</span><h3>Model Context Protocol</h3><p>One aggregated stdio server exposes <code>list_apps</code>, <code>search_apps</code>, <code>get_app_guide</code>, <code>recommend_app</code> and <code>get_agent_notifications</code>.</p><p><a href="${repoUrl}/blob/main/scripts/mcp-server.mjs" rel="noopener">Read the server source</a></p></article>
    <article class="feature"><span class="index">LOG</span><h3>Local notifications</h3><p>The shell appends module and clipboard events to a local JSONL log, so an agent can follow what the user is doing without a remote service.</p><p><a href="${llms(toRoot)}">See llms.txt</a></p></article>
  </div>
</section>

<section id="faq" aria-labelledby="faq-title">
  <h2 id="faq-title">Suite FAQ</h2>
  ${site.faq
    .map(
      (entry) => `<details><summary>${escapeHtml(entry.question)}</summary><div class="answer">${escapeHtml(entry.answer)}</div></details>`,
    )
    .join("\n")}
</section>`;
}

function hubStructuredData() {
  return [
    organizationNode(),
    websiteNode(),
    {
      "@type": "CollectionPage",
      "@id": `${docsUrl}#webpage`,
      url: docsUrl,
      name: `${site.name} documentation`,
      description: `Feature-by-feature guides for the ten ${site.name} apps.`,
      isPartOf: { "@id": `${baseUrl}/#website` },
      inLanguage: "en",
      hasPart: apps.map((app) => ({ "@type": "TechArticle", name: `${app.name} documentation`, url: docUrl(app.id) })),
    },
    faqNode(site.faq, `${docsUrl}#faq`),
    breadcrumbNode([
      { name: site.name, url: suiteUrl },
      { name: "Documentation", url: docsUrl },
    ]),
  ];
}

async function main() {
  const hubFile = path.join(root, "assets", "pages", "docs", "index.html");
  const hubDescription =
    "Feature-by-feature guides for the ten ArtCraft Studio apps: photo, vector, video, writing, decks, layout, effects, RAW, spreadsheets and PDF.";
  await writeOrCheck(
    hubFile,
    documentPage({
      title: `Documentation — ${site.name}`,
      description: hubDescription,
      canonical: docsUrl,
      keywords: [...site.keywords, "ArtCraft documentation", "app guides"],
      structuredData: hubStructuredData(),
      body: hubBody("../"),
      toRoot: "../",
      current: "",
      toc: [],
    }),
    check,
  );

  for (const app of apps) {
    const toRoot = "../../";
    const file = path.join(root, "assets", "pages", "docs", app.id, "index.html");
    const description = truncate(
      `${app.name} documentation: ${app.tagline} Features, FAQ and agent access for ${app.category.toLowerCase()} in ${site.name}.`,
    );
    const toc = [
      ["features-title", "Features"],
      ["fit-title", "Where it fits"],
      ["agents", "Agent access"],
      ["faq", "FAQ"],
    ];
    await writeOrCheck(
      file,
      documentPage({
        title: `${app.name} documentation | ${site.name}`,
        description,
        canonical: docUrl(app.id),
        keywords: [`${app.name} documentation`, `${app.name} guide`, ...app.keywords],
        structuredData: appStructuredData(app),
        body: appBody(app, toRoot),
        toRoot,
        current: app.id,
        toc,
      }),
      check,
    );
  }

  if (check) {
    console.log(`docs are up to date (${apps.length + 1} pages)`);
  } else {
    console.log(`wrote ${apps.length + 1} documentation pages`);
  }
}

await main();
