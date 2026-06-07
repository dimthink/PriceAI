export async function pruneOperationalLogs(supabase, env = {}) {
  const { error } = await supabase.rpc("prune_priceai_operational_logs", {
    p_crawl_runs_per_source: readBoundedIntEnv(env, "PRICEAI_CRAWL_RUNS_PER_SOURCE", 5, 1, 50),
    p_crawl_run_failure_retention_days: readBoundedIntEnv(env, "PRICEAI_CRAWL_RUN_FAILURE_RETENTION_DAYS", 7, 1, 90),
    p_crawl_run_global_limit: readBoundedIntEnv(env, "PRICEAI_CRAWL_RUN_GLOBAL_LIMIT", 1000, 100, 100000),
    p_collection_jobs_limit: readBoundedIntEnv(env, "PRICEAI_COLLECTION_JOBS_LIMIT", 200, 30, 10000),
    p_official_collect_runs_limit: readBoundedIntEnv(env, "PRICEAI_OFFICIAL_COLLECT_RUNS_LIMIT", 5, 1, 5000),
    p_api_collect_runs_limit: readBoundedIntEnv(env, "PRICEAI_API_COLLECT_RUNS_LIMIT", 5, 1, 5000),
  });

  if (error) {
    console.warn(`Failed to prune operational logs: ${error.message}`);
  }
}

function readBoundedIntEnv(env, name, fallback, min, max) {
  const raw = process.env[name] || env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;

  return Math.max(min, Math.min(Math.trunc(value), max));
}
