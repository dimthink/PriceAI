import { existsSync, readFileSync } from "node:fs";

loadLocalEnvFiles([".env.local", ".dev.vars", ".env"]);

const REQUIRED = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "ADMIN_SESSION_VERSION",
  "CRON_SECRET",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
];

const OPTIONAL = [
  "NEXT_PUBLIC_UMAMI_SCRIPT_URL",
  "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
  "NEXT_PUBLIC_UMAMI_ALLOWED_DOMAINS",
];

const missingRequired = REQUIRED.filter((name) => !hasEnv(name));
const missingOptional = OPTIONAL.filter((name) => !hasEnv(name));

if (missingRequired.length > 0) {
  console.error("Missing required Cloudflare preview env:");
  for (const name of missingRequired) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log("Cloudflare preview required env is present.");

if (missingOptional.length > 0) {
  console.log(`Optional env not set: ${missingOptional.join(", ")}`);
}

function hasEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function loadLocalEnvFiles(files) {
  for (const file of files) {
    if (!existsSync(file)) continue;

    const content = readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [name, value] = parsed;
      if (process.env[name] === undefined) {
        process.env[name] = value;
      }
    }
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;

  const [, name, rawValue] = match;
  return [name, unwrapValue(rawValue.trim())];
}

function unwrapValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  const commentIndex = value.indexOf(" #");
  return commentIndex >= 0 ? value.slice(0, commentIndex).trimEnd() : value;
}
