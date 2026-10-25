import { readFile } from "node:fs/promises";

const lock = await readFile(new URL("../Cargo.lock", import.meta.url), "utf8");
const versions = lock
  .split("[[package]]")
  .slice(1)
  .map((block) => ({
    name: /^name = "([^"]+)"/m.exec(block)?.[1],
    version: /^version = "([^"]+)"/m.exec(block)?.[1],
  }))
  .filter((entry) => entry.name === "glib" && entry.version)
  .map((entry) => entry.version);

const vulnerable = versions.filter((version) => {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major < 0 || (major === 0 && minor < 20);
});

if (vulnerable.length === 0) {
  console.error(
    "The RUSTSEC-2024-0429 exception is no longer needed: Cargo.lock has no glib < 0.20. " +
      "Remove the ignore from .cargo/audit.toml, delete this script and the " +
      "\"Track glib Advisory Exception\" step in .github/workflows/ci.yml.",
  );
  process.exit(1);
}

console.log(
  `glib ${vulnerable.join(", ")} still requires the documented RUSTSEC-2024-0429 exception.`,
);
