#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  COLLECTOR_RUNTIME_DEPENDENCY_FILES,
  COLLECTOR_RUNTIME_SERVICES,
  COLLECTOR_RUNTIME_SOURCE_FILES,
  COLLECTOR_RUNTIME_TIMERS,
  DEFAULT_COLLECTOR_RUNTIME_ROOT,
  buildRuntimeManifest,
  changedFilesBetween,
  checksumFileContent,
  currentGitSha,
  filterDependencyFiles,
  shellQuote,
} from "./collector-runtime-policy.mjs";

const options = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const targetSha = currentGitSha(cwd, options.targetRef);
const dependencyChanges = options.baseRef
  ? filterDependencyFiles(changedFilesBetween(cwd, options.baseRef, targetSha))
  : [];

if (dependencyChanges.length > 0) {
  fail(
    [
      "Source/config collector runtime sync is blocked because dependency files changed.",
      "Use the artifact release path instead; Huoshan2 must not run npm install or rebuild dependencies.",
      "",
      ...dependencyChanges.map((file) => `- ${file}`),
    ].join("\n"),
  );
}

const manifest = buildRuntimeManifest({
  cwd,
  mode: "source-sync",
  gitSha: targetSha,
  baseRef: options.baseRef,
  targetRef: options.targetRef,
  workflowRunUrl: options.workflowRunUrl,
  files: COLLECTOR_RUNTIME_SOURCE_FILES,
  dependencyFiles: COLLECTOR_RUNTIME_DEPENDENCY_FILES,
  extra: {
    sourceSync: {
      dependencyGuard: "blocked-if-dependency-files-change",
      dependencyGuardFiles: COLLECTOR_RUNTIME_DEPENDENCY_FILES,
      systemdManaged: options.manageSystemd,
      timers: options.timers,
      services: options.services,
    },
  },
});

console.log(`Collector runtime source sync target: ${targetSha}`);
console.log(`Runtime root: ${options.remoteRoot}`);
console.log(`Whitelisted files: ${manifest.files.length}`);
console.log(`Dependency guard files: ${manifest.dependencies.length}`);

if (options.dryRun || !options.apply) {
  console.log("Dry run: no archive uploaded and no remote files changed.");
  if (!options.apply) console.log("Pass --apply to upload and change the remote runtime.");
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

if (!options.host) {
  fail("Missing SSH target. Set PRICEAI_COLLECTOR_RUNTIME_SSH_TARGET or pass --host=<user@host>.");
}

const tempDir = await mkdtemp(path.join(tmpdir(), "priceai-collector-source-sync-"));
try {
  const stagingDir = path.join(tempDir, "staging");
  const metadataDir = path.join(stagingDir, ".collector-runtime");
  await mkdir(metadataDir, { recursive: true });

  for (const file of COLLECTOR_RUNTIME_SOURCE_FILES) {
    const source = path.join(cwd, file);
    const destination = path.join(stagingDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { preserveTimestamps: true });
  }

  await writeFile(path.join(metadataDir, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(metadataDir, "files.txt"), `${COLLECTOR_RUNTIME_SOURCE_FILES.join("\n")}\n`, "utf8");
  await writeFile(path.join(metadataDir, "source-sync.sha256"), checksumFileContent(manifest.files), "utf8");

  const archivePath = path.join(tempDir, `priceai-collector-source-${targetSha.slice(0, 12)}.tgz`);
  runChecked("tar", ["-czf", archivePath, "-C", stagingDir, "."]);

  const remoteIncomingDir = `${options.remoteRoot}/.incoming`;
  const remoteArchivePath = `${remoteIncomingDir}/${path.basename(archivePath)}`;
  const sshArgs = buildSshArgs(options);

  runChecked("ssh", [...sshArgs, options.host, `mkdir -p ${shellQuote(remoteIncomingDir)}`]);
  runChecked("scp", [...buildScpArgs(options), archivePath, `${options.host}:${remoteArchivePath}`]);

  const remoteScript = buildRemoteSourceSyncScript({
    remoteRoot: options.remoteRoot,
    remoteArchivePath,
    manageSystemd: options.manageSystemd,
    timers: options.timers,
    services: options.services,
    remoteSudo: options.remoteSudo,
  });

  runChecked("ssh", [...sshArgs, options.host, "bash -s"], { input: remoteScript });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function parseArgs(args) {
  const parsed = {
    host: process.env.PRICEAI_COLLECTOR_RUNTIME_SSH_TARGET || "",
    remoteRoot: process.env.PRICEAI_COLLECTOR_RUNTIME_ROOT || DEFAULT_COLLECTOR_RUNTIME_ROOT,
    sshKey: process.env.PRICEAI_COLLECTOR_RUNTIME_SSH_KEY || "",
    sshOptions: [],
    remoteSudo: process.env.PRICEAI_COLLECTOR_RUNTIME_REMOTE_SUDO || "",
    baseRef: process.env.PRICEAI_COLLECTOR_RUNTIME_BASE_REF || "",
    targetRef: process.env.PRICEAI_COLLECTOR_RUNTIME_TARGET_REF || "HEAD",
    workflowRunUrl: workflowRunUrlFromEnv(),
    apply: false,
    dryRun: false,
    manageSystemd: true,
    timers: [...COLLECTOR_RUNTIME_TIMERS],
    services: [...COLLECTOR_RUNTIME_SERVICES],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") parsed.apply = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--no-systemd") parsed.manageSystemd = false;
    else if (arg === "--host") parsed.host = readValue(args, ++index, arg);
    else if (arg.startsWith("--host=")) parsed.host = arg.slice("--host=".length);
    else if (arg === "--remote-root") parsed.remoteRoot = readValue(args, ++index, arg);
    else if (arg.startsWith("--remote-root=")) parsed.remoteRoot = arg.slice("--remote-root=".length);
    else if (arg === "--ssh-key") parsed.sshKey = readValue(args, ++index, arg);
    else if (arg.startsWith("--ssh-key=")) parsed.sshKey = arg.slice("--ssh-key=".length);
    else if (arg === "--ssh-option") parsed.sshOptions.push(readValue(args, ++index, arg));
    else if (arg.startsWith("--ssh-option=")) parsed.sshOptions.push(arg.slice("--ssh-option=".length));
    else if (arg === "--remote-sudo") parsed.remoteSudo = readValue(args, ++index, arg);
    else if (arg.startsWith("--remote-sudo=")) parsed.remoteSudo = arg.slice("--remote-sudo=".length);
    else if (arg === "--base-ref") parsed.baseRef = readValue(args, ++index, arg);
    else if (arg.startsWith("--base-ref=")) parsed.baseRef = arg.slice("--base-ref=".length);
    else if (arg === "--target-ref") parsed.targetRef = readValue(args, ++index, arg) || "HEAD";
    else if (arg.startsWith("--target-ref=")) parsed.targetRef = arg.slice("--target-ref=".length) || "HEAD";
    else if (arg === "--workflow-run-url") parsed.workflowRunUrl = readValue(args, ++index, arg);
    else if (arg.startsWith("--workflow-run-url=")) parsed.workflowRunUrl = arg.slice("--workflow-run-url=".length);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function buildRemoteSourceSyncScript({ remoteRoot, remoteArchivePath, manageSystemd, timers, services, remoteSudo }) {
  const timerValues = timers.map(shellQuote).join(" ");
  const serviceValues = services.map(shellQuote).join(" ");
  const sudo = remoteSudo ? `${remoteSudo} ` : "";

  return `set -euo pipefail
remote_root=${shellQuote(remoteRoot)}
archive_path=${shellQuote(remoteArchivePath)}
manage_systemd=${manageSystemd ? "1" : "0"}
timers=(${timerValues})
services=(${serviceValues})
lock_dir="$remote_root/.collector-runtime.lock"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
staging="$remote_root/.incoming/source-sync-$timestamp"
backup="$remote_root/backups/source-sync/$timestamp"
manifest_dir="$remote_root/manifests"
active_root="$remote_root"
current_real="$(readlink -f "$remote_root/current" 2>/dev/null || true)"
if [ -n "$current_real" ] && [ -d "$current_real" ]; then
  active_root="$current_real"
fi
target_roots=("$remote_root")
if [ "$active_root" != "$remote_root" ]; then
  target_roots+=("$active_root")
fi

if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "Collector runtime sync lock already exists: $lock_dir" >&2
  exit 1
fi
trap 'rm -rf "$lock_dir" "$staging"' EXIT

mkdir -p "$staging" "$backup" "$manifest_dir"
tar -xzf "$archive_path" -C "$staging"
(cd "$staging" && sha256sum -c .collector-runtime/source-sync.sha256)

if [ "$manage_systemd" = "1" ]; then
  for unit in "\${timers[@]}"; do ${sudo}systemctl stop "$unit" 2>/dev/null || true; done
  for unit in "\${services[@]}"; do ${sudo}systemctl stop "$unit" 2>/dev/null || true; done
fi

while IFS= read -r file; do
  case "$file" in
    ""|/*|../*|*/../*) echo "Unsafe runtime file path: $file" >&2; exit 1 ;;
  esac

  target_index=0
  for target_root in "\${target_roots[@]}"; do
    target_index=$((target_index + 1))
    if [ -e "$target_root/$file" ]; then
      mkdir -p "$backup/target-$target_index/$(dirname "$file")"
      cp -a "$target_root/$file" "$backup/target-$target_index/$file"
    fi

    mkdir -p "$target_root/$(dirname "$file")"
    cp -a "$staging/$file" "$target_root/$file"
  done
done < "$staging/.collector-runtime/files.txt"

cp -a "$staging/.collector-runtime/runtime-manifest.json" "$remote_root/runtime-manifest.json"
cp -a "$staging/.collector-runtime/runtime-manifest.json" "$manifest_dir/source-sync-$timestamp.json"
if [ "$active_root" != "$remote_root" ]; then
  mkdir -p "$active_root/.collector-runtime"
  cp -a "$staging/.collector-runtime/runtime-manifest.json" "$active_root/.collector-runtime/runtime-manifest.json"
fi
for target_root in "\${target_roots[@]}"; do
  (cd "$target_root" && sha256sum -c "$staging/.collector-runtime/source-sync.sha256")
done

if [ "$manage_systemd" = "1" ]; then
  for unit in "\${timers[@]}"; do ${sudo}systemctl start "$unit" 2>/dev/null || true; done
fi

rm -f "$archive_path"
echo "Collector runtime active root: $active_root"
echo "Collector runtime source sync complete: $remote_root"
`;
}

function buildSshArgs(parsed) {
  const args = ["-o", "BatchMode=yes"];
  for (const option of parsed.sshOptions) args.push("-o", option);
  if (parsed.sshKey) args.push("-i", parsed.sshKey);
  return args;
}

function buildScpArgs(parsed) {
  const args = [];
  for (const option of parsed.sshOptions) args.push("-o", option);
  if (parsed.sshKey) args.push("-i", parsed.sshKey);
  return args;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    input: options.input,
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    encoding: "utf8",
  });

  if (result.status === 0) return;
  fail(`Command failed: ${command} ${args.join(" ")}`);
}

function workflowRunUrlFromEnv() {
  if (!process.env.GITHUB_SERVER_URL || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_RUN_ID) return "";
  return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/sync-collector-runtime-source.mjs --dry-run --base-ref=HEAD --target-ref=HEAD
  node scripts/sync-collector-runtime-source.mjs --base-ref=<old-sha> --target-ref=<new-sha> --host=<user@host>

Behavior:
  Syncs only whitelisted collector runtime source/config files to /opt/priceai-nonshop.
  If .nvmrc, package.json, or package-lock.json changed between base and target, the script exits and requires artifact release mode.

Options:
  --host=<user@host>          SSH target, or PRICEAI_COLLECTOR_RUNTIME_SSH_TARGET
  --remote-root=<path>        Runtime root, default ${DEFAULT_COLLECTOR_RUNTIME_ROOT}
  --base-ref=<git-ref>        Dependency guard base ref
  --target-ref=<git-ref>      Ref to sync, default HEAD
  --apply                     Upload and apply changes to the remote runtime
  --ssh-key=<path>            SSH private key path
  --ssh-option=<option>       Extra SSH/SCP option, repeatable
  --remote-sudo=<command>     Prefix systemctl calls, for example sudo
  --no-systemd                Do not stop/start collector timers
  --dry-run                   Validate and print manifest without SSH or file writes
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
