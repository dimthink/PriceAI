#!/usr/bin/env bash
set -euo pipefail

cd /opt/priceai-nonshop

lock_file="/tmp/priceai-api-transit-public.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another API transit public collection run is still active; skipping."
  exit 0
fi

set -a
. ./env
set +a

base_url="${CRON_PUBLIC_BASE_URL:-https://priceai.cc}"
timeout_ms="${PRICEAI_API_TRANSIT_TIMEOUT_MS:-20000}"

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
  exit 1
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "Missing CRON_SECRET for API transit cache refresh."
  exit 1
fi

/usr/bin/node scripts/collect-api-transit.mjs --post --timeoutMs "$timeout_ms"

BASE_URL="$base_url" CRON_SECRET="$CRON_SECRET" /usr/bin/node <<'NODE'
const raw = process.env.BASE_URL || "https://priceai.cc";
const base = new URL(raw);
base.hash = "";
base.search = "";
base.pathname = base.pathname
  .replace(/\/api\/cron\/(?:collect-prices|api-transit-probe|api-transit-revalidate)\/?$/, "") || "/";

const url = new URL("/api/cron/api-transit-revalidate", base.toString());
const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.CRON_SECRET}`,
  },
  signal: AbortSignal.timeout(120000),
});

const text = await response.text();
let payload = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = null;
}

if (!response.ok || payload?.ok === false) {
  throw new Error(payload?.message || text || `HTTP ${response.status}`);
}

console.log(JSON.stringify({
  stationCount: payload.snapshot?.stationCount ?? null,
  snapshotWritten: payload.snapshot?.snapshotWritten ?? null,
  generatedAt: payload.snapshot?.generatedAt || null,
  revalidatedPaths: payload.revalidatedPaths?.length || 0,
}));
NODE
