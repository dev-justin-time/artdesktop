#!/usr/bin/env node
// Ranking regression test for the offline Suite Expert.
//
// expert.ts is bundled with the esbuild that already ships with Vite, then loaded
// in Node. The guide fetch is unavailable outside the webview, so loadGuide falls
// back to the catalogue — which is exactly the path this test pins down.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = await mkdtemp(path.join(os.tmpdir(), "artcraft-expert-"));
const outfile = path.join(outDir, "expert.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await build({
    entryPoints: [path.join(ui, "src", "expert.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "warning",
  });

  const { answer, stem } = await import(pathToFileURL(outfile).href);
  const catalog = JSON.parse(
    await (await import("node:fs/promises")).readFile(path.join(ui, "src", "suite.json"), "utf8"),
  );
  const apps = catalog.apps;

  // The stemmer must fold "features" and "feature" together; it used to strip "es"
  // from every plural, so those two never matched.
  assert(stem("features") === stem("feature"), '"features" must stem to the same token as "feature"');
  assert(stem("classes") === "class", '"classes" must stem to "class"');
  assert(stem("editing") === "edit", '"editing" must stem to "edit"');

  // One question per app: each answer must name that app and cite its guide.
  for (const app of apps) {
    const result = await answer(`What is ${app.name}?`);
    assert(result.text.includes(app.name), `"What is ${app.name}?" must name ${app.name}: ${result.text.slice(0, 120)}`);
    assert(
      result.text.includes(`/docs/${app.id}/`),
      `"What is ${app.name}?" must link the ${app.id} documentation`,
    );
    assert(result.sources.length >= 1, `${app.name} answer must cite at least one source`);
    assert(result.followups.length >= 1, `${app.name} answer must offer a follow-up`);
  }

  // One comparison: both apps named, and neither answer may be the fallback.
  const comparison = await answer("Compare PhotoCraft and LightCraft");
  assert(comparison.text.includes("PhotoCraft") && comparison.text.includes("LightCraft"), "comparison must name both apps");
  assert(comparison.text.includes(" vs "), "comparison must be framed as a comparison");
  assert(comparison.sources.length === 2, "comparison must cite both guides");

  // A task query should recommend rather than fall back.
  const task = await answer("Which app should I use to edit RAW photos?");
  assert(/LightCraft/.test(task.text), `RAW task must point at LightCraft: ${task.text.slice(0, 120)}`);

  // A list query should mention all ten apps.
  const listed = await answer("List all apps");
  for (const app of apps) {
    assert(listed.text.includes(app.name), `list answer must mention ${app.name}`);
  }

  // Unmatched input must fall back honestly instead of guessing.
  const fallback = await answer("what is the airspeed velocity of an unladen swallow");
  assert(/could not match/i.test(fallback.text), "unmatched questions must use the fallback");
  assert(fallback.sources.length >= 1, "fallback must cite the documentation index");

  // Empty input must not throw.
  const empty = await answer("   ");
  assert(/could not match/i.test(empty.text), "blank questions must use the fallback");

  console.log(`Suite Expert: ${apps.length} app questions, comparison, task, list, fallback and stemming all pass`);
} catch (error) {
  console.error(`Suite Expert test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await rm(outDir, { recursive: true, force: true });
}
