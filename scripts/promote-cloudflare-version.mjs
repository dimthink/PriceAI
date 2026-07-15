import { spawnSync } from "node:child_process";
import { join } from "node:path";

const versionRef = process.argv[2];

if (!versionRef || (!/^[a-f0-9-]{36}$/i.test(versionRef) && !/^[A-Za-z0-9._-]{7,64}$/.test(versionRef))) {
  console.error("Usage: npm run promote:cloudflare -- <worker-version-id-or-tag>");
  process.exit(1);
}

const isVersionId = /^[a-f0-9-]{36}$/i.test(versionRef);
const message = process.env.CLOUDFLARE_PROMOTE_MESSAGE || `Promote ${versionRef}`;
const wrangler = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);

const result = spawnSync(
  wrangler,
  [
    "versions",
    "deploy",
    ...(isVersionId ? [`${versionRef}@100`] : ["--version-tag", `${versionRef}@100`]),
    "--name",
    "priceai-cloudflare-poc",
    "--message",
    message,
    "--yes",
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error(`Cloudflare version promotion failed: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
