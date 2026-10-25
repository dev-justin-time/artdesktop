import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const pagesDir = path.join(root, "assets", "pages");
export const catalogPath = path.join(root, "crates", "craft-studio-shell", "ui", "src", "suite.json");
export const releasesPath = path.join(root, "crates", "craft-studio-shell", "ui", "web-apps.json");

export const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
export const site = catalog.site;
export const apps = catalog.apps;
export const releases = JSON.parse(await readFile(releasesPath, "utf8")).apps;

const trimSlash = (value) => value.replace(/\/+$/, "");
export const baseUrl = trimSlash(site.url);
export const pagesBase = `${baseUrl}${trimSlash(site.pagesPath || "")}`;
export const suiteUrl = `${pagesBase}/suite/`;
export const docsUrl = `${pagesBase}/docs/`;
export const appUrl = (id) => `${pagesBase}/${id}/`;
export const docUrl = (id) => `${pagesBase}/docs/${id}/`;
export const ogImageUrl = `${baseUrl}${site.ogImage.startsWith("/") ? "" : "/"}${site.ogImage}`;

export const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function truncate(value, max = 158) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 60 ? boundary : max - 1).trimEnd()}…`;
}

export function jsonLd(graph) {
  const payload = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
  return payload.replaceAll("</", "<\\/");
}

export function renderHead({ title, description, keywords, canonical, type = "website", structuredData }) {
  const meta = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    keywords?.length ? `<meta name="keywords" content="${escapeHtml(keywords.join(", "))}">` : null,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta name="author" content="${escapeHtml(site.publisher)}">`,
    `<meta name="theme-color" content="#0b0d12">`,
    `<meta property="og:type" content="${escapeHtml(type)}">`,
    `<meta property="og:site_name" content="${escapeHtml(site.name)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(ogImageUrl)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(`${site.name} social card`)}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">`,
    `<script type="application/ld+json">\n${jsonLd(structuredData)}\n</script>`,
  ].filter(Boolean);

  return ["<!-- artcraft-seo:start -->", ...meta, "<!-- artcraft-seo:end -->"].join("\n");
}

export const START = "<!-- artcraft-seo:start -->";
export const END = "<!-- artcraft-seo:end -->";

export function injectHead(html, block) {
  // Drop any previous block so its position is always recomputed.
  let body = html;
  const index = html.indexOf(START);
  if (index !== -1) {
    const end = html.indexOf(END, index);
    if (end === -1) throw new Error("found SEO start marker without an end marker");
    body = html.replace(/\r?\n?<!-- artcraft-seo:start -->[\s\S]*?<!-- artcraft-seo:end -->\r?\n?/, "");
  }

  // Keep <meta charset> inside the first 1024 bytes: the block goes after it.
  // Restore the newline that the removed block used to separate <head> from its first child.
  body = body.replace(/(<head[^>]*>)(?=[^\r\n])/i, "$1\n");
  const insert = (before, after) =>
    `${before}\n${block}${after.startsWith("\n") || after.startsWith("\r") ? "" : "\n"}${after}`;

  const charset = body.match(/<meta[^>]+charset[^>]*>/i);
  if (charset) {
    const at = charset.index + charset[0].length;
    return insert(body.slice(0, at), body.slice(at));
  }

  const headEnd = body.search(/<\/head>/i);
  if (headEnd === -1) throw new Error("page has no </head> element");
  return insert(body.slice(0, headEnd), body.slice(headEnd));
}

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": `${baseUrl}/#organization`,
    name: site.publisher,
    url: baseUrl,
    logo: { "@type": "ImageObject", url: ogImageUrl },
    sameAs: [site.repository],
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    url: baseUrl,
    name: site.name,
    description: site.description,
    publisher: { "@id": `${baseUrl}/#organization` },
    inLanguage: "en",
  };
}

export function breadcrumbNode(items) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${items.at(-1).url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqNode(faq, id) {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: faq.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/// `featureList` is opt-in: structured data has to match what the page shows, so the
/// app marketing pages and the suite page carry the node without it, while the
/// documentation page — which renders every feature — includes it.
export function softwareApplicationNode(app, url, { featureList = false } = {}) {
  const release = releases[app.id];
  return {
    "@type": "SoftwareApplication",
    "@id": `${url}#application`,
    name: app.name,
    url,
    description: app.description,
    applicationCategory: app.applicationCategory,
    applicationSubCategory: app.category,
    operatingSystem: "Windows",
    softwareVersion: release?.tag?.replace(/^v/, ""),
    ...(featureList ? { featureList: app.features.map((feature) => feature.name) } : {}),
    keywords: app.keywords.join(", "),
    image: ogImageUrl,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Organization", name: "Storytold", url: "https://github.com/storytold" },
    publisher: { "@id": `${baseUrl}/#organization` },
    subjectOf: { "@type": "TechArticle", url: docUrl(app.id), name: `${app.name} documentation` },
  };
}

export function pageTitle(app) {
  return `${app.name} — ${app.category} | ${site.name}`;
}

export function appGraph(app) {
  const url = appUrl(app.id);
  return [
    organizationNode(),
    websiteNode(),
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: pageTitle(app),
      description: app.description,
      isPartOf: { "@id": `${baseUrl}/#website` },
      about: { "@id": `${url}#application` },
      primaryImageOfPage: { "@type": "ImageObject", url: ogImageUrl },
      inLanguage: "en",
    },
    softwareApplicationNode(app, url),
    breadcrumbNode([
      { name: site.name, url: suiteUrl },
      { name: app.name, url },
    ]),
  ];
}

export function suiteGraph() {
  return [
    organizationNode(),
    websiteNode(),
    {
      "@type": "CollectionPage",
      "@id": `${suiteUrl}#webpage`,
      url: suiteUrl,
      name: `${site.name} — ten Rust creative apps in one workspace`,
      description: site.description,
      isPartOf: { "@id": `${baseUrl}/#website` },
      inLanguage: "en",
    },
    ...apps.map((app) => softwareApplicationNode(app, appUrl(app.id))),
    {
      "@type": "ItemList",
      "@id": `${suiteUrl}#apps`,
      name: "ArtCraft Studio apps",
      numberOfItems: apps.length,
      itemListElement: apps.map((app, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: app.name,
        url: appUrl(app.id),
      })),
    },
    breadcrumbNode([{ name: site.name, url: suiteUrl }]),
  ];
}

export async function writeOrCheck(file, content, check) {
  const { readFile: read, writeFile, mkdir } = await import("node:fs/promises");
  if (check) {
    let current = null;
    try {
      current = await read(file, "utf8");
    } catch {
      current = null;
    }
    if (current !== content) {
      throw new Error(`${path.relative(root, file)} is out of date; run node scripts/generate-docs.mjs && node scripts/generate-seo.mjs`);
    }
    return;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
