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
const wrangler = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
);

try {
  await waitForPreviewUrls();

  // OpenNext's remote cache helper requires OAuth state that API-token CI does not have.
  // Upload the validated bundle directly; preview and production smoke cover cold-cache behavior.
  const result = spawnSync(
    wrangler,
    [
      "versions",
      "upload",
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
      env: { ...process.env, OPEN_NEXT_DEPLOY: "true", WRANGLER_OUTPUT_FILE_PATH: outputPath },
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

async function waitForPreviewUrls() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const workerName = "priceai-cloudflare-poc";
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();

    if (!response.ok || payload.success !== true) {
      const message = payload.errors?.map((error) => error.message).filter(Boolean).join("; ");
      throw new Error(`Unable to verify Cloudflare Preview URLs: ${message || `HTTP ${response.status}`}`);
    }
    if (payload.result?.previews_enabled === true) return;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Cloudflare Preview URLs did not become active within 20 seconds.");
}
