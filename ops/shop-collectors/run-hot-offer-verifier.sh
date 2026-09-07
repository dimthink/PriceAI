#!/usr/bin/env bash
set -euo pipefail

runtime_root="${PRICEAI_COLLECTOR_RUNTIME_ROOT:-/opt/priceai-worker}"
node_bin="${PRICEAI_NODE_BIN:-$runtime_root/node_modules/node/bin/node}"

lock_dir="${RUNTIME_DIRECTORY:-/run/priceai-hot-offer-verifier}"
mkdir -p "$lock_dir"
state_dir="${STATE_DIRECTORY:-$runtime_root/spool/hot-offer-verifier}"
mkdir -p "$state_dir"
exec 9>"$lock_dir/verifier.lock"
if ! flock -n 9; then
  echo "PriceAI hot offer verifier is already running; skipping this tick."
  exit 0
fi

set -a
if [ -f "$runtime_root/.env.local" ]; then
  . "$runtime_root/.env.local"
fi
if [ -f /etc/priceai/collector-proxy.env ]; then
  . /etc/priceai/collector-proxy.env
fi
set +a

: "${PRICEAI_COLLECTOR_NODE_ID:?PRICEAI_COLLECTOR_NODE_ID is required}"
: "${PRICEAI_COLLECTOR_NODE_NAME:?PRICEAI_COLLECTOR_NODE_NAME is required}"
: "${PRICEAI_HOT_VERIFY_NODE_COUNT:?PRICEAI_HOT_VERIFY_NODE_COUNT is required}"
: "${PRICEAI_HOT_VERIFY_NODE_INDEX:?PRICEAI_HOT_VERIFY_NODE_INDEX is required}"

cd "$runtime_root"
exec "$node_bin" scripts/verify-hot-offers.mjs \
  --mode "${PRICEAI_HOT_VERIFY_MODE:-shadow}" \
  --endpoint "${CRON_PUBLIC_BASE_URL:-https://priceai.cc}" \
  --node-count "$PRICEAI_HOT_VERIFY_NODE_COUNT" \
  --node-index "$PRICEAI_HOT_VERIFY_NODE_INDEX" \
  --node-id "$PRICEAI_COLLECTOR_NODE_ID" \
  --node-name "$PRICEAI_COLLECTOR_NODE_NAME" \
  --node-region "${PRICEAI_COLLECTOR_NODE_REGION:-cn}" \
  --max-duration-ms "${PRICEAI_HOT_VERIFY_MAX_DURATION_MS:-270000}" \
  --recent-reuse-ms "${PRICEAI_HOT_VERIFY_RECENT_REUSE_MS:-90000}" \
  --request-delay-ms "${PRICEAI_HOT_VERIFY_REQUEST_DELAY_MS:-1500}" \
  --sticky-candidate-ms "${PRICEAI_HOT_VERIFY_STICKY_CANDIDATE_MS:-1800000}" \
  --stale-alert-ms "${PRICEAI_HOT_VERIFY_STALE_ALERT_MS:-1200000}" \
  --candidate-state-path "${PRICEAI_HOT_VERIFY_CANDIDATE_STATE_PATH:-$state_dir/candidates.json}" \
  --takeover-after-ms "${PRICEAI_HOT_VERIFY_TAKEOVER_AFTER_MS:-0}" \
  --proxy-reuse-limit 0 \
  --proxy-reuse-ttl-ms "${PRICEAI_HOT_VERIFY_PROXY_REUSE_TTL_MS:-600000}" \
  --proxy-state-path "${PRICEAI_HOT_VERIFY_PROXY_STATE_PATH:-$state_dir/proxy-leases.json}" \
  --proxy-max-runs "${PRICEAI_HOT_VERIFY_PROXY_MAX_RUNS:-2}" \
  "$@"
