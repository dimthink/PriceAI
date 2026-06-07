#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const migrationPath = resolve(args.migrationPath || "supabase/migrations/20260507120500_offer_freshness.sql");
const envPath = args.envPath || ".env.local";
const env = readEnvFile(envPath);
const dbPassword = env.SUPABASE_DB_PASSWORD;

if (!dbPassword) {
  console.error("缺少 SUPABASE_DB_PASSWORD，请检查 .env.local。");
  process.exit(1);
}

if (!existsSync(migrationPath)) {
  console.error(`找不到迁移文件：${migrationPath}`);
  process.exit(1);
}

const dbUrl = buildDbUrl(env, dbPassword);
const supabaseBin = existsSync("/Users/dimension/.local/bin/supabase")
  ? "/Users/dimension/.local/bin/supabase"
  : "supabase";

console.log(`Applying migration: ${migrationPath}`);
console.log(`Using env file: ${envPath}`);
const statements = splitSqlStatements(readFileSync(migrationPath, "utf8"));

for (let index = 0; index < statements.length; index += 1) {
  const statement = statements[index];
  console.log(`Statement ${index + 1}/${statements.length}`);
  const result = spawnSync(
    supabaseBin,
    ["db", "query", "--db-url", dbUrl, statement],
    { stdio: "inherit" },
  );

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Migration applied.");

function parseArgs(argv) {
  const output = {
    migrationPath: "",
    envPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") {
      output.envPath = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--env=")) {
      output.envPath = arg.slice("--env=".length);
      continue;
    }
    if (!output.migrationPath) output.migrationPath = arg;
  }

  return output;
}

function readEnvFile(path) {
  const output = {};
  const text = readFileSync(path, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    output[match[1]] = unquote(match[2].trim());
  }

  return output;
}

function unquote(value) {
  const quote = value[0];
  if ((quote === `"` || quote === `'`) && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }

  return value;
}

function buildDbUrl(env, password) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL，请检查环境文件。");
    process.exit(1);
  }

  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const poolerPath = "supabase/.temp/pooler-url";
  if (existsSync(poolerPath)) {
    const url = new URL(readFileSync(poolerPath, "utf8").trim());
    if (url.username === `postgres.${ref}`) {
      url.password = password;
      url.searchParams.set("sslmode", "require");
      return url.toString();
    }
  }

  const url = new URL(`postgresql://postgres@db.${ref}.supabase.co:5432/postgres`);
  url.password = password;
  url.searchParams.set("sslmode", "require");
  return url.toString();
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let singleQuoted = false;
  let dollarQuote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (!singleQuoted && !dollarQuote && char === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      current += "\n";
      continue;
    }

    if (!singleQuoted && char === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        if (!dollarQuote) {
          dollarQuote = tag;
        } else if (dollarQuote === tag) {
          dollarQuote = null;
        }
        current += tag;
        index += tag.length - 1;
        continue;
      }
    }

    if (!dollarQuote && char === "'") {
      current += char;
      if (singleQuoted && next === "'") {
        current += next;
        index += 1;
      } else if (singleQuoted) {
        singleQuoted = false;
      } else if (next === "'") {
        current += next;
        index += 1;
      } else {
        singleQuoted = true;
      }
      continue;
    }

    if (!singleQuoted && !dollarQuote && char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += char;
  }

  const finalStatement = current.trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}
