import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const candidateVersionId = process.argv[2];
const workerName = "priceai-cloudflare-poc";

if (!/^[a-f0-9-]{36}$/i.test(candidateVersionId || "")) {
  console.error("Usage: npm run stage:cloudflare -- <worker-version-id>");
  process.exit(1);
}

const wrangler = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);
const deployments = runWrangler(["deployments", "list", "--name", workerName, "--json"], true);
const currentDeployment = JSON.parse(deployments.stdout || "[]").at(-1);
const activeVersions = (currentDeployment?.versions || []).filter((version) => Number(version.percentage) > 0);

if (activeVersions.length !== 1 || Math.abs(Number(activeVersions[0].percentage) - 100) > 0.001) {
  throw new Error("Cloudflare staging requires exactly one current version at 100% traffic.");
}

const previousVersionId = activeVersions[0].version_id;
if (!/^[a-f0-9-]{36}$/i.test(previousVersionId || "")) {
  throw new Error("Cloudflare current deployment did not report a valid version ID.");
}
if (previousVersionId === candidateVersionId) {
  throw new Error("Candidate version is already serving 100% of production traffic.");
}

runWrangler([
  "versions",
  "deploy",
  `${previousVersionId}@100`,
  `${candidateVersionId}@0`,
  "--name",
  workerName,
  "--message",
  `Stage ${candidateVersionId} for version-override smoke`,
  "--yes",
]);

writeGithubOutput("previous_version_id", previousVersionId);
writeGithubOutput("staged_version_id", candidateVersionId);
writeDeployFile("previous-version-id", previousVersionId);
writeDeployFile("staged-version-id", candidateVersionId);
console.log(`Cloudflare staged version: ${candidateVersionId}@0`);
console.log(`Cloudflare stable version: ${previousVersionId}@100`);

function runWrangler(args, capture = false) {
  const result = spawnSync(wrangler, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

function writeGithubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function writeDeployFile(name, value) {
  const deployDir = join(process.cwd(), ".priceai-deploy");
  mkdirSync(deployDir, { recursive: true });
  writeFileSync(join(deployDir, name), `${value}\n`);
}
