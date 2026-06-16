import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  CLOUDFLARE_REQUIRED_ENV,
  loadCloudflareLocalEnv,
  missingEnv,
} from "./cloudflare-env.mjs";

const DEFAULT_BASE_URL = "https://priceai.cc";
const DEFAULT_REF = "main";
const WORKFLOW_FILE = "deploy-cloudflare-worker.yml";

const options = parseArgs(process.argv.slice(2));

loadCloudflareLocalEnv();

const localMissingEnv = missingEnv(CLOUDFLARE_REQUIRED_ENV);
const trackedChanges = gitStatus(["--short", "--untracked-files=no"]);
const untrackedChanges = gitStatus(["--short", "--untracked-files=normal"]).filter((line) =>
  line.startsWith("?? "),
);
const currentBranch = gitOutput(["branch", "--show-current"]) || "(detached)";

console.log(`PriceAI production target: Cloudflare Workers / OpenNext`);
console.log(`Smoke base URL: ${options.smokeBaseUrl}`);
console.log(`Current branch: ${currentBranch}`);
console.log(`Deployment ref: ${options.ref}`);

if (existsSync(".vercel/project.json")) {
  console.log("Warning: local .vercel/project.json exists. Do not use `vercel deploy` for production.");
}

if (existsSync("vercel.json")) {
  console.log("Warning: vercel.json still exists for legacy rollback/cron history; it is not the production deploy path.");
}

if (untrackedChanges.length > 0) {
  console.log(`Info: ${untrackedChanges.length} untracked file(s) are present and ignored by this deploy helper.`);
}

if (options.mode === "check") {
  await checkProductionTarget(options.smokeBaseUrl);
  printLocalEnvSummary(localMissingEnv);
  process.exit(0);
}

if (options.mode === "local") {
  await runLocalCloudflareDeploy(localMissingEnv, options);
  process.exit(0);
}

await runGithubCloudflareDeploy(trackedChanges, options);

function parseArgs(args) {
  const parsed = {
    mode: "github",
    ref: DEFAULT_REF,
    smokeBaseUrl: DEFAULT_BASE_URL,
    wait: false,
    dryRun: false,
    allowTrackedChanges: false,
    allowRemoteRefMismatch: false,
  };

  for (const arg of args) {
    if (arg === "--check") parsed.mode = "check";
    else if (arg === "--local") parsed.mode = "local";
    else if (arg === "--github") parsed.mode = "github";
    else if (arg === "--wait") parsed.wait = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--allow-tracked-changes") parsed.allowTrackedChanges = true;
    else if (arg === "--allow-remote-ref-mismatch") parsed.allowRemoteRefMismatch = true;
    else if (arg.startsWith("--ref=")) parsed.ref = arg.slice("--ref=".length) || DEFAULT_REF;
    else if (arg.startsWith("--smoke-base-url=")) {
      parsed.smokeBaseUrl = arg.slice("--smoke-base-url=".length) || DEFAULT_BASE_URL;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  npm run deploy:production
  npm run deploy:production -- --wait
  npm run deploy:production -- --check
  npm run deploy:production -- --local

Default behavior:
  Triggers the GitHub Actions workflow ${WORKFLOW_FILE} on ref ${DEFAULT_REF}.
  GitHub secrets provide Cloudflare deployment env, so local missing env does not block deployment.

Options:
  --check                         Print deployment target checks without deploying
  --github                        Trigger the Cloudflare GitHub Actions workflow (default)
  --local                         Build and deploy from this machine with local Cloudflare env
  --wait                          Wait for the GitHub Actions run and then run local smoke
  --dry-run                       Print the command that would run
  --ref=<git-ref>                 Workflow ref to deploy, default: ${DEFAULT_REF}
  --smoke-base-url=<url>          Smoke target, default: ${DEFAULT_BASE_URL}
  --allow-tracked-changes         Allow GitHub deploy while tracked files are modified locally
  --allow-remote-ref-mismatch     Allow GitHub deploy when the local ref differs from origin
`);
}

async function runGithubCloudflareDeploy(trackedChanges, runOptions) {
  if (trackedChanges.length > 0 && runOptions.dryRun) {
    console.log("Warning: tracked local changes are present. A real GitHub Actions deploy would use the remote ref, not these local edits.");
    for (const line of trackedChanges) {
      console.log(line);
    }
  } else if (trackedChanges.length > 0 && !runOptions.allowTrackedChanges) {
    fail(
      [
        "Tracked local changes are present. GitHub Actions deploys a remote git ref, not your unstaged local edits.",
        "Commit and push first, or pass --allow-tracked-changes if you intentionally want to deploy the remote ref unchanged.",
        "",
        ...trackedChanges,
      ].join("\n"),
    );
  }

  requireCommand("gh", "GitHub CLI is required to trigger the Cloudflare deployment workflow.");
  runChecked("gh", ["auth", "status", "-h", "github.com"], { quiet: true });

  printLocalEnvSummary(localMissingEnv);
  console.log("Using GitHub Actions for Cloudflare deploy. Local Cloudflare env is not required.");

  const args = [
    "workflow",
    "run",
    WORKFLOW_FILE,
    "--ref",
    runOptions.ref,
    "-f",
    `smoke_base_url=${runOptions.smokeBaseUrl}`,
  ];

  if (runOptions.dryRun) {
    console.log(`Dry run: gh ${args.join(" ")}`);
    return;
  }

  const deploySha = resolveRemoteGitRef(runOptions.ref) || resolveGitRef(runOptions.ref);
  const localSha = resolveGitRef(runOptions.ref);

  if (localSha && deploySha && localSha !== deploySha && !runOptions.allowRemoteRefMismatch) {
    fail(
      [
        `Local ref "${runOptions.ref}" differs from origin/${runOptions.ref}.`,
        "GitHub Actions deploys the remote ref, so local committed-but-unpushed changes would be missing from production.",
        "Push or sync the branch first, or pass --allow-remote-ref-mismatch if you intentionally want to deploy the current remote ref.",
      ].join("\n"),
    );
  }

  const triggerStartedAt = new Date(Date.now() - 5000).toISOString();

  runChecked("gh", args);
  console.log("Cloudflare deployment workflow triggered.");

  const run = await latestWorkflowRun(runOptions.ref, {
    createdAfter: triggerStartedAt,
    headSha: deploySha,
  });
  if (run?.url) {
    console.log(`Run URL: ${run.url}`);
  } else {
    console.log(`Run URL: open GitHub Actions workflow "${WORKFLOW_FILE}" for the latest run.`);
  }

  if (!runOptions.wait) {
    console.log("Use `npm run deploy:production -- --wait` when you want this command to wait for completion.");
    return;
  }

  if (!run?.databaseId) {
    fail("Could not find the triggered workflow run to watch.");
  }

  runChecked("gh", ["run", "watch", String(run.databaseId), "--exit-status"]);
  runChecked("npm", ["run", "smoke:cloudflare", "--", runOptions.smokeBaseUrl]);
}

async function runLocalCloudflareDeploy(missing, runOptions) {
  if (missing.length > 0) {
    fail(
      [
        "Local Cloudflare deploy env is incomplete.",
        "Use `npm run deploy:production` to deploy through GitHub Actions secrets, or provide these local env vars:",
        ...missing.map((name) => `- ${name}`),
      ].join("\n"),
    );
  }

  if (runOptions.dryRun) {
    console.log("Dry run: npm run lint && npm run build && npm run build:cloudflare && npm run deploy:cloudflare && npm run smoke:cloudflare");
    return;
  }

  runChecked("npm", ["run", "lint"]);
  runChecked("npm", ["run", "build"]);
  runChecked("npm", ["run", "build:cloudflare"]);
  runChecked("npm", ["run", "deploy:cloudflare"]);
  runChecked("npm", ["run", "smoke:cloudflare", "--", runOptions.smokeBaseUrl]);
}

async function checkProductionTarget(baseUrl) {
  let response;
  try {
    response = await fetch(baseUrl, { method: "HEAD" });
  } catch (error) {
    fail(`Could not reach ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const server = response.headers.get("server") || "";
  const openNext = response.headers.get("x-opennext") || "";
  const ray = response.headers.get("cf-ray") || "";

  console.log(`Production HEAD ${baseUrl}: ${response.status}`);
  console.log(`server: ${server || "(missing)"}`);
  console.log(`x-opennext: ${openNext || "(missing)"}`);
  console.log(`cf-ray: ${ray || "(missing)"}`);

  if (!server.toLowerCase().includes("cloudflare") || openNext !== "1") {
    fail("Production URL does not look like Cloudflare OpenNext. Do not deploy until the domain target is clarified.");
  }

  console.log("Production URL is currently served by Cloudflare OpenNext.");
}

function printLocalEnvSummary(missing) {
  if (missing.length === 0) {
    console.log("Local Cloudflare deploy env is complete.");
    return;
  }

  console.log(`Local Cloudflare deploy env missing ${missing.length} value(s): ${missing.join(", ")}`);
}

async function latestWorkflowRun(ref, filter = {}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = spawnSync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        WORKFLOW_FILE,
        "--branch",
        ref,
        "--limit",
        "10",
        "--json",
        "databaseId,url,status,conclusion,headBranch,headSha,createdAt",
      ],
      { encoding: "utf8" },
    );

    if (result.status === 0) {
      try {
        const runs = JSON.parse(result.stdout);
        const candidates = Array.isArray(runs) ? runs : [];
        const run = candidates.find((candidate) => {
          if (filter.headSha && candidate.headSha !== filter.headSha) return false;
          if (filter.createdAfter && isBefore(candidate.createdAt, filter.createdAfter)) return false;
          return true;
        });
        if (run) return run;
      } catch {
        return null;
      }
    }

    await delay(1500);
  }

  return null;
}

function resolveGitRef(ref) {
  const local = gitOutput(["rev-parse", ref]);
  if (local) return local;

  const remoteBranch = gitOutput(["rev-parse", `origin/${ref}`]);
  return remoteBranch || "";
}

function resolveRemoteGitRef(ref) {
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref;

  const branch = parseLsRemote(gitOutput(["ls-remote", "--heads", "origin", ref]));
  if (branch) return branch;

  return parseLsRemote(gitOutput(["ls-remote", "--tags", "origin", ref]));
}

function parseLsRemote(output) {
  const line = output.split("\n").find(Boolean);
  return line?.split(/\s+/)[0] || "";
}

function isBefore(value, threshold) {
  const valueTime = Date.parse(value);
  const thresholdTime = Date.parse(threshold);
  if (Number.isNaN(valueTime) || Number.isNaN(thresholdTime)) return value < threshold;
  return valueTime < thresholdTime;
}

function gitStatus(args) {
  const output = gitOutput(["status", ...args]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function gitOutput(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function requireCommand(command, message) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (result.status !== 0) fail(message);
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });

  if (result.status === 0) return;

  if (options.quiet) {
    const stderr = result.stderr?.trim();
    if (stderr) console.error(stderr);
  }

  fail(`Command failed: ${command} ${args.join(" ")}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
