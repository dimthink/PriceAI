import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  CLOUDFLARE_BUILD_REQUIRED_ENV,
  assertRequiredEnv,
  loadCloudflareLocalEnv,
} from "./cloudflare-env.mjs";

loadCloudflareLocalEnv();
assertRequiredEnv(CLOUDFLARE_BUILD_REQUIRED_ENV, "Cloudflare build env");

cleanGeneratedPath(".next/cache/fetch-cache");
cleanGeneratedPath(".open-next");
run("Performance guard", process.execPath, ["scripts/check-performance-guards.mjs"]);
run("Generate MDX guide content", process.execPath, ["scripts/generate-mdx-guide-content.mjs"]);
run("OpenNext Cloudflare build", localBin("opennextjs-cloudflare"), ["build"]);
run("OpenNext Worker export validation", process.execPath, ["scripts/verify-cloudflare-worker-exports.mjs"]);
run("Patch OpenNext Worker runtime", process.execPath, ["scripts/patch-opennext-worker-runtime.mjs"]);
run("OpenNext cache validation", process.execPath, ["scripts/verify-cloudflare-build-cache.mjs"]);
run("OpenNext env sanitization", process.execPath, ["scripts/sanitize-opennext-env.mjs"]);

function cleanGeneratedPath(path) {
  rmSync(path, { recursive: true, force: true });
  console.log(`Cleaned generated cache: ${path}`);
}

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`${label} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function localBin(name) {
  const suffix = process.platform === "win32" ? ".cmd" : "";
  return join(process.cwd(), "node_modules", ".bin", `${name}${suffix}`);
}
