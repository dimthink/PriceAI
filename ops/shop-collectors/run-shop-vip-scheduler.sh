#!/usr/bin/env bash
set -euo pipefail

runtime_root="${PRICEAI_COLLECTOR_RUNTIME_ROOT:-/opt/priceai-worker}"
node_bin="${PRICEAI_NODE_BIN:-$runtime_root/node_modules/node/bin/node}"
node_id="${PRICEAI_COLLECTOR_NODE_ID:?PRICEAI_COLLECTOR_NODE_ID is required}"
node_name="${PRICEAI_COLLECTOR_NODE_NAME:?PRICEAI_COLLECTOR_NODE_NAME is required}"
node_region="${PRICEAI_COLLECTOR_NODE_REGION:-cn}"

lock_dir="${RUNTIME_DIRECTORY:-/run/priceai-shop-vip-scheduler}"
mkdir -p "$lock_dir"
exec 9>"$lock_dir/scheduler.lock"
if ! flock -n 9; then
  echo "PriceAI VIP scheduler is already running; skipping this tick."
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

cd "$runtime_root"
mkdir -p "$runtime_root/spool/crawl-log"
exec "$node_bin" scripts/collect-prices.mjs \
  --all \
  --collector-kind shopApi \
  --exclude-family shopApi:pay.qxvx.cn,shopApi:catfk.com \
  --shop-scheduler \
  --shop-scheduler-group vip_15m \
  --post \
  --endpoint https://priceai.cc \
  --collector-node-id "$node_id" \
  --collector-node-name "$node_name" \
  --collector-node-type vps \
  --collector-node-runtime systemd \
  --collector-node-region "$node_region" \
  --concurrency 1 \
  --post-batch-size 25 \
  --post-run-batch-size 10 \
  --post-request-offer-limit 500 \
  --full-snapshot-offer-limit 500 \
  --crawl-log-spool-dir "$runtime_root/spool/crawl-log" \
  --shop-scheduler-bucket-minutes 15 \
  --shop-scheduler-shard-count 1 \
  --shop-scheduler-shard-index 0 \
  --liandong-shop-limit 0 \
  --liandong-shop-delay-ms 15000 \
  --liandong-shop-403-threshold 3 \
  --liandong-shop-403-cooldown-minutes 5 \
  --liandong-shop-breaker-minutes 30 \
  --shop-api-proxy-parallelism 1 \
  --shop-api-proxy-reuse-limit 0 \
  --shop-api-proxy-reuse-ttl-ms 540000 \
  "$@"
