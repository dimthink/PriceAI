import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const project = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const directDependencies = {
  ...(project.dependencies || {}),
  ...(project.devDependencies || {}),
};

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
  "MPL-2.0",
]);

const rows = [];
const failures = [];

for (const name of Object.keys(directDependencies).sort()) {
  const packagePath = path.join(root, "node_modules", ...name.split("/"), "package.json");
  let metadata;
  try {
    metadata = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (error) {
    failures.push(`${name}: 无法读取已安装包元数据 (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }

  const license = normalizeLicense(metadata.license);
  rows.push({ name, version: metadata.version || "unknown", license });
  if (!license || !allowedLicenses.has(license)) {
    failures.push(`${name}@${metadata.version || "unknown"}: 未审阅许可证 ${license || "missing"}`);
  }
}

const summary = new Map();
for (const row of rows) summary.set(row.license || "missing", (summary.get(row.license || "missing") || 0) + 1);

console.log(`Checked ${rows.length} direct dependencies.`);
for (const [license, count] of [...summary.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${license}: ${count}`);
}

if (failures.length) {
  console.error("Direct dependency license review required:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}

function normalizeLicense(value) {
  if (typeof value === "string") return value.trim().replace(/^\((.*)\)$/, "$1");
  if (value && typeof value === "object" && typeof value.type === "string") return value.type.trim();
  return "";
}
