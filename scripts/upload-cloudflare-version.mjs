import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CLOUDFLARE_REQUIRED_ENV,
  assertRequiredEnv,
  loadCloudflareLocalEnv,
} from "./cloudflare-env.mjs";

loadCloudflareLocalEnv();
assertRequiredEnv(CLOUDFLARE_REQUIRED_ENV, "Cloudflare version upload env");

const deploymentId = normalizeTag(process.env.NEXT_DEPLOYMENT_ID || gitSha());
const previewAlias = normalizeAlias(process.env.CLOUDFLARE_PREVIEW_ALIAS || "candidate");
const outputPath = process.env.WRANGLER_OUTPUT_FILE_PATH || join(tmpdir(), `priceai-wrangler-upload-${process.pid}.jsonl`);
const shouldRemoveOutput = !process.env.WRANGLER_OUTPUT_FILE_PATH;
const cli = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "opennextjs-cloudflare.cmd" : "opennextjs-cloudflare",
);

try {
  const result = spawnSync(
    cli,
    [
      "upload",
      "--",
      "--keep-vars",
      "--preview-alias",
      previewAlias,
      "--tag",
      deploymentId,
      "--message",
      `PriceAI ${deploymentId}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputPath },
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const upload = readUploadOutput(outputPath);
  const previewUrl = upload.preview_alias_url || upload.preview_url;
  if (!upload.version_id || !previewUrl) {
    throw new Error("Cloudflare upload succeeded but Wrangler did not report a version ID and preview URL.");
  }

  console.log(`Cloudflare candidate version: ${upload.version_id}`);
  console.log(`Cloudflare candidate tag: ${deploymentId}`);
  console.log(`Cloudflare preview URL: ${previewUrl}`);

  writeGithubOutput("version_id", upload.version_id);
  writeGithubOutput("version_tag", deploymentId);
  writeGithubOutput("preview_url", upload.preview_url || "");
  writeGithubOutput("preview_alias_url", upload.preview_alias_url || "");
  writeGithubOutput("smoke_base_url", previewUrl);
} finally {
  if (shouldRemoveOutput) rmSync(outputPath, { force: true });
}

function readUploadOutput(filePath) {
  const entries = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const upload = entries.findLast((entry) => entry?.type === "version-upload");
  if (!upload) throw new Error("Wrangler version-upload metadata was not found.");
  return upload;
}

function writeGithubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replaceAll("\n", "")}\n`);
}

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) throw new Error("Unable to resolve git SHA for Cloudflare version tag.");
  return result.stdout.trim();
}

function normalizeTag(value) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{7,64}$/.test(normalized)) {
    throw new Error("NEXT_DEPLOYMENT_ID must be a stable 7-64 character version tag.");
  }
  return normalized;
}

function normalizeAlias(value) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new Error("CLOUDFLARE_PREVIEW_ALIAS must be a valid DNS label.");
  }
  return normalized;
}
