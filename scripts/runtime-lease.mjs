import { createClient } from "@supabase/supabase-js";

export async function claimScriptRuntimeLease({
  key,
  owner,
  leaseSeconds = 1800,
  metadata = {},
  env = process.env,
}) {
  const supabase = runtimeLeaseClient(env);
  const { data, error } = await supabase.rpc("claim_runtime_lease", {
    p_lease_key: key,
    p_owner: owner,
    p_lease_seconds: leaseSeconds,
    p_metadata: metadata,
  });
  if (error) throw error;
  const row = data && typeof data === "object" ? data : {};
  return {
    acquired: row.acquired === true,
    key: String(row.leaseKey || key),
    owner: String(row.owner || ""),
    expiresAt: row.expiresAt ? String(row.expiresAt) : null,
  };
}

export async function releaseScriptRuntimeLease({ key, owner, env = process.env }) {
  const supabase = runtimeLeaseClient(env);
  const { data, error } = await supabase.rpc("release_runtime_lease", {
    p_lease_key: key,
    p_owner: owner,
  });
  if (error) throw error;
  return data === true;
}

export async function renewScriptRuntimeLease({ key, owner, leaseSeconds = 1800, env = process.env }) {
  const supabase = runtimeLeaseClient(env);
  const { data, error } = await supabase.rpc("renew_runtime_lease", {
    p_lease_key: key,
    p_owner: owner,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw error;
  const row = data && typeof data === "object" ? data : {};
  return {
    renewed: row.renewed === true,
    key: String(row.leaseKey || key),
    owner: String(row.owner || ""),
    expiresAt: row.expiresAt ? String(row.expiresAt) : null,
  };
}

export function startScriptRuntimeLeaseHeartbeat({
  key,
  owner,
  leaseSeconds = 7200,
  intervalSeconds = Math.max(60, Math.min(1200, Math.floor(leaseSeconds / 3))),
  env = process.env,
  onError = () => undefined,
}) {
  let stopped = false;
  let inFlight = null;
  let lostError = null;

  const heartbeat = async () => {
    if (stopped || inFlight) return;
    inFlight = renewScriptRuntimeLease({ key, owner, leaseSeconds, env })
      .then((result) => {
        if (!result.renewed) {
          lostError = new Error(`Runtime lease ${key} is no longer owned by ${owner}.`);
          onError(lostError);
        }
      })
      .catch((error) => {
        onError(error);
      })
      .finally(() => {
        inFlight = null;
      });
    await inFlight;
  };

  const timer = setInterval(() => {
    void heartbeat();
  }, Math.max(1, intervalSeconds) * 1000);
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
    assertOwned() {
      if (lostError) throw lostError;
    },
  };
}

function runtimeLeaseClient(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for runtime lease.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
