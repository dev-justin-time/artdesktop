import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(uiRoot, "web-apps.json");
const appsRoot = path.join(uiRoot, "public", "apps");
const force = process.argv.includes("--force");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = Object.entries(manifest.apps).filter(([id]) => !only || only.has(id));

if (entries.length === 0) {
  throw new Error(`No matching apps in ${manifestPath}`);
}

await mkdir(appsRoot, { recursive: true });

for (const [id, app] of entries) {
  const destination = path.join(appsRoot, id);
  const versionFile = path.join(destination, ".version");
  const currentVersion = existsSync(versionFile)
    ? (await readFile(versionFile, "utf8")).trim()
    : null;

  if (!force && currentVersion === app.tag && existsSync(path.join(destination, "index.html"))) {
    console.log(`${id.padEnd(12)} ${app.tag.padEnd(10)} cached`);
    continue;
  }

  const url = `https://github.com/${app.repo}/releases/download/${app.tag}/${encodeURIComponent(app.asset)}`;
  console.log(`${id.padEnd(12)} ${app.tag.padEnd(10)} downloading ${(app.size / 1024 / 1024).toFixed(1)} MB`);

  const response = await fetch(url, {
    headers: { "User-Agent": "artcraft-studio-build" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Download failed for ${id}: HTTP ${response.status} ${response.statusText}`);
  }

  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length !== app.size) {
    throw new Error(`Size mismatch for ${id}: expected ${app.size}, got ${archive.length}`);
  }

  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== app.sha256) {
    throw new Error(`SHA-256 mismatch for ${id}: expected ${app.sha256}, got ${digest}`);
  }

  const temporary = path.join(appsRoot, `.tmp-${id}-${process.pid}`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });

  try {
    const zip = new AdmZip(archive);
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replaceAll("\\", "/");
      const target = path.resolve(temporary, name);
      if (target !== temporary && !target.startsWith(temporary + path.sep)) {
        throw new Error(`Unsafe path in ${id} archive: ${entry.entryName}`);
      }
      if (entry.isDirectory) {
        await mkdir(target, { recursive: true });
      } else {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, entry.getData());
      }
    }

    let siteRoot = temporary;
    if (!existsSync(path.join(siteRoot, "index.html"))) {
      const topLevel = await readdir(temporary, { withFileTypes: true });
      const folders = topLevel.filter((entry) => entry.isDirectory());
      if (folders.length !== 1 || !existsSync(path.join(temporary, folders[0].name, "index.html"))) {
        throw new Error(`Could not find index.html in ${id} archive`);
      }
      siteRoot = path.join(temporary, folders[0].name);
    }

    await rm(destination, { recursive: true, force: true });
    await rename(siteRoot, destination);
    await writeFile(path.join(destination, ".version"), `${app.tag}\n`);
    await writeFile(
      path.join(destination, ".build-info.json"),
      JSON.stringify(
        {
          app: id,
          repo: app.repo,
          tag: app.tag,
          asset: app.asset,
          sha256: app.sha256,
          source: `https://github.com/${app.repo}`,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  console.log(`${id.padEnd(12)} ${app.tag.padEnd(10)} verified and extracted`);
}

console.log(`\n${entries.length} app${entries.length === 1 ? "" : "s"} ready in ${appsRoot}`);
