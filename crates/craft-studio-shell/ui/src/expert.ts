import catalogJson from "./suite.json";

interface Feature {
  name: string;
  summary: string;
}

interface FaqEntry {
  question: string;
  answer: string;
}

interface SuiteApp {
  id: string;
  name: string;
  tab: string;
  icon: string;
  category: string;
  applicationCategory: string;
  tagline: string;
  description: string;
  capabilities: string[];
  features: Feature[];
  keywords: string[];
  faq: FaqEntry[];
}

interface SuiteCatalog {
  site: {
    name: string;
    url: string;
    pagesPath: string;
    description: string;
    keywords: string[];
  };
  apps: SuiteApp[];
}

interface GuideSection {
  title: string;
  body: string;
}

interface Source {
  label: string;
  href: string;
}

interface Answer {
  text: string;
  sources: Source[];
  followups: string[];
}

const catalog = catalogJson as unknown as SuiteCatalog;
const apps = catalog.apps;
const docsBase = `${catalog.site.url.replace(/\/+$/, "")}${catalog.site.pagesPath.replace(/\/+$/, "")}`;
const docsUrl = (app: SuiteApp) => `${docsBase}/docs/${app.id}/`;

const STOP_WORDS = new Set(
  "a an and are as at be but by can could do does for from has have how i if in into is it its me my no not of on or our should so than that the their them then there these they this to us was we were what when where which who why will with would you your".split(
    " ",
  ),
);

export function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  // Only sibilant plurals drop "es": "classes" -> "class", but "features" -> "feature".
  if (/(?:ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9+]+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
        .map(stem),
    ),
  ];
}

const appText = new Map(
  apps.map((app) => [
    app.id,
    [
      app.name,
      app.category,
      app.tagline,
      app.description,
      app.keywords.join(" "),
      app.capabilities.join(" "),
      app.features.map((feature) => `${feature.name} ${feature.summary}`).join(" "),
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

const tokenWeights = new Map<string, number>();

// Rare words are the ones that identify an app: "raw" appears in one catalogue
// entry, "photo" in several, so "raw" has to count for more.
function tokenWeight(token: string): number {
  const cached = tokenWeights.get(token);
  if (cached !== undefined) return cached;
  const matching = apps.filter((app) => (appText.get(app.id) ?? "").includes(token)).length;
  const weight = 1 + Math.log(apps.length / Math.max(1, matching));
  tokenWeights.set(token, weight);
  return weight;
}

function scoreApp(app: SuiteApp, queryTokens: string[]): number {
  let score = 0;
  const haystack = appText.get(app.id) ?? "";
  for (const token of queryTokens) {
    const weight = tokenWeight(token);
    if (app.name.toLowerCase().includes(token)) score += 12 * weight;
    if (app.id.includes(token)) score += 8 * weight;
    if (app.category.toLowerCase().includes(token)) score += 6 * weight;
    if (app.features.some((feature) => feature.name.toLowerCase().includes(token))) score += 6 * weight;
    if (app.keywords.some((keyword) => keyword.toLowerCase().includes(token))) score += 4 * weight;
    if (haystack.includes(token)) score += 2 * weight;
  }
  return score;
}

function rankedApps(query: string): Array<{ app: SuiteApp; score: number }> {
  const queryTokens = tokens(query);
  return apps
    .map((app) => ({ app, score: scoreApp(app, queryTokens) }))
    .sort((left, right) => right.score - left.score);
}

function mentionedApps(query: string): SuiteApp[] {
  const lower = query.toLowerCase();
  const queryTokens = tokens(query);
  return apps.filter(
    (app) =>
      lower.includes(app.name.toLowerCase()) ||
      queryTokens.includes(app.id) ||
      queryTokens.includes(app.name.toLowerCase().replace("craft", "")),
  );
}

function snippet(text: string, max = 480): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 120 ? boundary : max).trimEnd()}…`;
}

function formatFeatures(app: SuiteApp, queryTokens: string[], limit: number): string {
  const scored = app.features
    .map((feature) => {
      const haystack = `${feature.name} ${feature.summary}`.toLowerCase();
      const score = queryTokens.filter((token) => haystack.includes(token)).length;
      return { feature, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  return scored.map(({ feature }) => `• ${feature.name} — ${feature.summary}`).join("\n");
}

const guideCache = new Map<string, Promise<GuideSection[] | null>>();

function loadGuide(app: SuiteApp): Promise<GuideSection[] | null> {
  const cached = guideCache.get(app.id);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}apps/${app.id}/README.md`, { cache: "force-cache" });
      if (!response.ok) return null;
      const markdown = await response.text();
      return markdown
        .split(/^#{2,3} /m)
        .map((part, index) => {
          if (index === 0) return { title: "Overview", body: part };
          const newline = part.indexOf("\n");
          return {
            title: (newline === -1 ? part : part.slice(0, newline)).trim(),
            body: newline === -1 ? "" : part.slice(newline + 1),
          };
        })
        .map((section) => ({
          title: section.title,
          body: section.body
            .replace(/<[^>]*>/g, " ")
            .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/[`*_>|#]/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        }))
        .filter((section) => section.body.length > 40);
    } catch {
      return null;
    }
  })();

  guideCache.set(app.id, pending);
  return pending;
}

async function bestGuideSection(app: SuiteApp, queryTokens: string[]): Promise<GuideSection | null> {
  if (!queryTokens.length) return null;
  const sections = await loadGuide(app);
  if (!sections?.length) return null;
  const scored = sections
    .map((section) => {
      const haystack = `${section.title} ${section.body}`.toLowerCase();
      return { section, score: queryTokens.filter((token) => haystack.includes(token)).length };
    })
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].section : null;
}

function overview(app: SuiteApp, queryTokens: string[]): Answer {
  const features = formatFeatures(app, queryTokens, 4);
  return {
    text: `${app.name} — ${app.category}\n${app.tagline}\n\n${app.description}\n\nFeatures:\n${features}\n\nDocumentation: ${docsUrl(app)}`,
    sources: [{ label: `${app.name} documentation`, href: docsUrl(app) }],
    followups: [`Compare ${app.name} with another app`, `What else can ${app.name} do?`, "Which app should I use for a slide deck?"],
  };
}

async function answerOverview(app: SuiteApp, queryTokens: string[]): Promise<Answer> {
  const base = overview(app, queryTokens);
  const section = await bestGuideSection(app, queryTokens);
  if (!section) return base;
  return {
    ...base,
    text: `${base.text}\n\nFrom the ${app.name} guide — ${section.title}:\n${snippet(section.body)}`,
    sources: [...base.sources, { label: `Upstream ${app.name} README`, href: `https://github.com/storytold/${app.id}` }],
  };
}

function compare(left: SuiteApp, right: SuiteApp): Answer {
  const describe = (app: SuiteApp) =>
    `${app.name} — ${app.category}\n${app.tagline}\n${formatFeatures(app, [], 3)}`;
  return {
    text: `${left.name} vs ${right.name}\n\n${describe(left)}\n\n${describe(right)}\n\nThey serve different jobs: ${left.name} is for ${left.category.toLowerCase()}, while ${right.name} is for ${right.category.toLowerCase()}.\n\nDocumentation: ${docsUrl(left)} · ${docsUrl(right)}`,
    sources: [
      { label: `${left.name} documentation`, href: docsUrl(left) },
      { label: `${right.name} documentation`, href: docsUrl(right) },
    ],
    followups: [`What does ${left.name} do?`, `What does ${right.name} do?`, "Which app should I use for a slide deck?"],
  };
}

function recommend(ranked: Array<{ app: SuiteApp; score: number }>, queryTokens: string[]): Answer {
  const [first, second] = ranked;
  const also = second && second.score > 0 ? `\n\nAlso consider: ${second.app.name} (${second.app.category}).` : "";
  return {
    text: `Best fit: ${first.app.name} — ${first.app.category}\n${first.app.tagline}\n\n${first.app.description}\n\nRelevant features:\n${formatFeatures(first.app, queryTokens, 4)}${also}\n\nDocumentation: ${docsUrl(first.app)}`,
    sources: [
      { label: `${first.app.name} documentation`, href: docsUrl(first.app) },
      ...(second && second.score > 0 ? [{ label: `${second.app.name} documentation`, href: docsUrl(second.app) }] : []),
    ],
    followups: [`What can ${first.app.name} do?`, `Compare ${first.app.name} with ${second?.app.name ?? "FilmCraft"}`, "List all ten apps"],
  };
}

function fallback(): Answer {
  return {
    text: `I could not match that to one app. The suite covers:\n${apps
      .map((app) => `• ${app.name} — ${app.category}`)
      .join("\n")}\n\nTry a task like "edit RAW photos", "make a slide deck" or name an app directly.`,
    sources: [{ label: "Documentation index", href: `${docsBase}/docs/` }],
    followups: ["Which app edits RAW photos?", "Which app is best for a slide deck?", "Compare PhotoCraft and LightCraft"],
  };
}

function listAnswer(): Answer {
  return {
    text: `${catalog.site.name} bundles ten apps, one per creative job:\n${apps
      .map((app) => `• ${app.name} — ${app.category}: ${app.tagline}`)
      .join("\n")}\n\nAsk me about any one of them, or describe a task and I will suggest a fit.`,
    sources: [{ label: "Documentation index", href: `${docsBase}/docs/` }],
    followups: ["Which app edits RAW photos?", "Which app is best for a slide deck?", "Compare FilmCraft and EffectCraft"],
  };
}

export async function answer(question: string): Promise<Answer> {
  const query = question.trim();
  const queryTokens = tokens(query);
  if (!queryTokens.length) return fallback();
  if (/\b(all (the )?apps|list( the)? apps|ten apps|which apps|what apps)\b/i.test(query)) return listAnswer();

  if (/\b(compare|versus|vs\.?|difference between)\b/i.test(query)) {
    const mentioned = mentionedApps(query);
    if (mentioned.length >= 2) return compare(mentioned[0], mentioned[1]);
  }

  const ranked = rankedApps(query);
  const mentioned = mentionedApps(query);
  if (mentioned.length === 1 && ranked[0].app.id === mentioned[0].id) {
    return answerOverview(mentioned[0], queryTokens);
  }

  const [first, second] = ranked;
  if (!first || first.score === 0) return fallback();

  const clearlyBest = !second || second.score < first.score * 0.7;
  if (clearlyBest && first.score >= 6) {
    if (/\b(what|tell|features|about|do|does|use|how)\b/i.test(query) && mentioned.length === 1) {
      return answerOverview(first.app, queryTokens);
    }
    return recommend(ranked.filter((entry) => entry.score > 0), queryTokens);
  }

  if (first.score >= 8) {
    return recommend(ranked.filter((entry) => entry.score > 0), queryTokens);
  }

  return answerOverview(first.app, queryTokens);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendMessage(container: HTMLElement, role: "user" | "expert", text: string, sources: Source[] = []): void {
  const message = element("div", `expert-message expert-message-${role}`);
  message.append(element("div", "expert-role", role === "user" ? "You" : "Suite Expert"));
  message.append(element("p", "expert-text", text));
  if (sources.length) {
    const list = element("div", "expert-sources");
    for (const source of sources) {
      const link = element("a", "expert-source", source.label);
      link.href = source.href;
      link.target = "_blank";
      link.rel = "noopener";
      list.append(link);
    }
    message.append(list);
  }
  container.append(message);
  container.scrollTop = container.scrollHeight;
}

function setSuggestions(container: HTMLElement, suggestions: string[], onPick: (suggestion: string) => void): void {
  container.replaceChildren();
  for (const suggestion of suggestions) {
    const button = element("button", "expert-suggestion", suggestion);
    button.type = "button";
    button.addEventListener("click", () => onPick(suggestion));
    container.append(button);
  }
}

export function initExpert(): void {
  const panel = document.getElementById("expert-panel");
  const toggle = document.getElementById("expert-toggle");
  const close = document.getElementById("expert-close");
  const messages = document.getElementById("expert-messages");
  const suggestions = document.getElementById("expert-suggestions");
  const form = document.getElementById("expert-form") as HTMLFormElement | null;
  const input = document.getElementById("expert-input") as HTMLInputElement | null;
  const send = document.getElementById("expert-send") as HTMLButtonElement | null;
  if (!panel || !toggle || !close || !messages || !suggestions || !form || !input || !send) return;

  const open = () => {
    panel.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    input.focus();
  };
  const hide = () => {
    panel.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  };

  toggle.setAttribute("aria-controls", "expert-panel");
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => (panel.classList.contains("hidden") ? open() : hide()));
  close.addEventListener("click", hide);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });

  appendMessage(
    messages,
    "expert",
    `Ask about any of the ten apps. I answer from the bundled catalogue and the upstream READMEs that ship with ${catalog.site.name} — no network and no model API.`,
  );

  const quick = ["Which app edits RAW photos?", "Which app is best for a slide deck?", "Compare PhotoCraft and LightCraft"];
  setSuggestions(suggestions, quick, (suggestion) => {
    input.value = suggestion;
    form.requestSubmit();
  });

  let busy = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || busy) return;
    busy = true;
    send.disabled = true;
    input.value = "";
    appendMessage(messages, "user", question);

    const thinking = element("div", "expert-message expert-message-expert expert-thinking");
    thinking.append(element("div", "expert-role", "Suite Expert"));
    thinking.append(element("p", "expert-text", "Searching the bundled guides…"));
    messages.append(thinking);
    messages.scrollTop = messages.scrollHeight;

    try {
      const result = await answer(question);
      thinking.remove();
      appendMessage(messages, "expert", result.text, result.sources);
      setSuggestions(suggestions, result.followups, (suggestion) => {
        input.value = suggestion;
        form.requestSubmit();
      });
    } catch (error) {
      thinking.remove();
      appendMessage(messages, "expert", `I could not answer that: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  });
}
