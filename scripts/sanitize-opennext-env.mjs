import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nextEnvModule = join(root, ".open-next/cloudflare/next-env.mjs");
const generatedEnvFiles = [
  join(root, ".open-next/server-functions/default/.env.local"),
];

if (existsSync(nextEnvModule)) {
  writeFileSync(
    nextEnvModule,
    [
      "export const production = {};",
      "export const development = {};",
      "export const test = {};",
      "",
    ].join("\n"),
  );
}

for (const file of generatedEnvFiles) {
  if (existsSync(file)) {
    writeFileSync(file, "# Sanitized before Cloudflare deploy.\n");
  }
}
