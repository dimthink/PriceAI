#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const entry = process.argv[2];

if (!entry) {
  console.error("Usage: node scripts/run-ts-test.mjs <entry.ts>");
  process.exit(1);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-ts-test-"));
const outDir = path.join(tempDir, "out");
const tempTsconfig = path.join(tempDir, "tsconfig.json");

try {
  await writeFile(
    tempTsconfig,
    `${JSON.stringify(
      {
        extends: path.join(repoRoot, "tsconfig.json"),
        compilerOptions: {
          noEmit: false,
          outDir,
          module: "NodeNext",
          moduleResolution: "NodeNext",
          types: ["node"],
          typeRoots: [path.join(repoRoot, "node_modules", "@types")],
          incremental: false,
          tsBuildInfoFile: path.join(tempDir, "tsconfig.tsbuildinfo"),
        },
        include: [
          path.join(repoRoot, entry),
          path.join(repoRoot, "src/lib/api-transit.ts"),
          path.join(repoRoot, "src/data/api-transit/**/*.ts"),
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const compile = spawnSync(
    path.join(repoRoot, "node_modules", ".bin", "tsc"),
    ["--project", tempTsconfig],
    { cwd: repoRoot, stdio: "inherit" },
  );

  if (compile.status !== 0) process.exit(compile.status || 1);

  const compiledEntry = path.join(outDir, entry.replace(/\.ts$/, ".js"));
  await rewriteAliases(compiledEntry);
  await rewriteAliases(path.join(outDir, "src", "lib", "api-transit.js"));

  const run = spawnSync(process.execPath, [compiledEntry], { cwd: repoRoot, stdio: "inherit" });
  process.exitCode = run.status || 0;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function rewriteAliases(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  const next = text.replaceAll("\"@/data/api-transit/types\"", "\"../data/api-transit/types.js\"")
    .replaceAll("\"@/data/api-transit/stations\"", "\"../data/api-transit/stations.js\"");
  if (next !== text) await writeFile(filePath, next, "utf8");
}
