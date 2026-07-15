#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "supabase", "recovery-baseline.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const schemaPath = path.join(repoRoot, manifest.schemaPath);
const schema = readFileSync(schemaPath, "utf8");
const schemaSha256 = crypto.createHash("sha256").update(schema).digest("hex");

assert(schemaSha256 === manifest.schemaSha256, "supabase/schema.sql 已变化，请在验证空库恢复后更新 recovery baseline checksum。");
assert(/^\d{14}$/.test(manifest.includesMigrationsThrough), "recovery baseline migration head 格式无效。");

const migrationFiles = readdirSync(path.join(repoRoot, "supabase", "migrations"))
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();
const includedMigrations = migrationFiles.filter((name) => name.slice(0, 14) <= manifest.includesMigrationsThrough);
assert(
  includedMigrations.some((name) => name.startsWith(`${manifest.includesMigrationsThrough}_`)),
  `recovery baseline 指向的 migration ${manifest.includesMigrationsThrough} 不存在。`,
);
assert(
  includedMigrations.length === manifest.includedMigrationCount,
  "recovery baseline 之前的 migration 数量发生变化；不要向生产历史链倒序插入 migration。",
);

for (const requiredSql of [
  "create table if not exists canonical_products",
  "create table if not exists raw_offers",
  "create table if not exists public_user_profiles",
  "create or replace function public.claim_runtime_lease",
  "create or replace function public.consume_feedback_evidence_upload_quota",
]) {
  assert(schema.includes(requiredSql), `recovery baseline 缺少必要定义：${requiredSql}`);
}

if (process.argv.includes("--docker")) {
  verifyWithDocker(schema);
}

console.log(JSON.stringify({
  ok: true,
  schemaSha256,
  includesMigrationsThrough: manifest.includesMigrationsThrough,
  includedMigrationCount: includedMigrations.length,
  dockerReplay: process.argv.includes("--docker"),
}));

function verifyWithDocker(schemaSql) {
  const docker = commandPath("docker");
  assert(docker, "未找到 docker，无法执行隔离空库恢复验证。");
  const image = process.env.PRICEAI_RECOVERY_POSTGRES_IMAGE || "postgres:18-alpine";
  const container = `priceai-recovery-${process.pid}-${Date.now()}`;
  const password = crypto.randomBytes(18).toString("hex");

  try {
    execFileSync(docker, [
      "run",
      "--rm",
      "--detach",
      "--name",
      container,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      image,
    ], { stdio: "ignore" });

    waitForPostgres(docker, container);
    runPsql(docker, container, `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema if not exists auth;
      create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    `);
    runPsql(docker, container, schemaSql);
    runPsql(docker, container, `
      do $$
      declare
        v_result jsonb;
        v_index integer;
      begin
        v_result := public.claim_runtime_lease('recovery-test', 'owner-one', 60, '{}'::jsonb);
        if coalesce((v_result ->> 'acquired')::boolean, false) is not true then
          raise exception 'runtime lease claim failed';
        end if;

        v_result := public.renew_runtime_lease('recovery-test', 'owner-one', 120);
        if coalesce((v_result ->> 'renewed')::boolean, false) is not true then
          raise exception 'runtime lease renewal failed';
        end if;

        v_result := public.claim_runtime_lease('recovery-test', 'owner-two', 60, '{}'::jsonb);
        if coalesce((v_result ->> 'acquired')::boolean, false) is true then
          raise exception 'runtime lease allowed a second owner';
        end if;

        if public.release_runtime_lease('recovery-test', 'owner-one') is not true then
          raise exception 'runtime lease release failed';
        end if;

        for v_index in 1..30 loop
          v_result := public.consume_feedback_evidence_upload_quota('quota-test', 3600, 30);
          if coalesce((v_result ->> 'allowed')::boolean, false) is not true then
            raise exception 'upload quota blocked request % too early', v_index;
          end if;
        end loop;

        v_result := public.consume_feedback_evidence_upload_quota('quota-test', 3600, 30);
        if coalesce((v_result ->> 'allowed')::boolean, true) is true then
          raise exception 'upload quota did not block request 31';
        end if;
      end;
      $$;
    `);

    const validation = runPsql(docker, container, `
      select json_build_object(
        'canonicalProducts', to_regclass('public.canonical_products') is not null,
        'rawOffers', to_regclass('public.raw_offers') is not null,
        'userProfiles', to_regclass('public.public_user_profiles') is not null,
        'runtimeLease', to_regprocedure('public.claim_runtime_lease(text,text,integer,jsonb)') is not null,
        'uploadQuota', to_regprocedure('public.consume_feedback_evidence_upload_quota(text,integer,integer)') is not null
      );
    `, true).trim();
    const result = JSON.parse(validation);
    assert(Object.values(result).every(Boolean), `隔离空库恢复后关键对象不完整：${validation}`);
  } finally {
    spawnSync(docker, ["rm", "--force", container], { stdio: "ignore" });
  }
}

function waitForPostgres(docker, container) {
  let consecutiveReady = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(docker, ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { stdio: "ignore" });
    consecutiveReady = probe.status === 0 ? consecutiveReady + 1 : 0;
    if (consecutiveReady >= 2) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("隔离 PostgreSQL 在 30 秒内没有就绪。");
}

function runPsql(docker, container, sql, capture = false) {
  const result = spawnSync(
    docker,
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", ...(capture ? ["-tA"] : [])],
    {
      input: sql,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: capture ? ["pipe", "pipe", "pipe"] : ["pipe", "ignore", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "psql 执行 recovery baseline 失败。");
  }
  return result.stdout || "";
}

function commandPath(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
