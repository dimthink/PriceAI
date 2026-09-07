#!/usr/bin/env bash
set -euo pipefail

runtime_root="${PRICEAI_COLLECTOR_RUNTIME_ROOT:-/opt/priceai-worker}"
node_bin="${PRICEAI_NODE_BIN:-$runtime_root/node_modules/node/bin/node}"

lock_dir="${RUNTIME_DIRECTORY:-/run/priceai-yunmao}"
mkdir -p "$lock_dir"
lock_file="$lock_dir/scheduler.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another Yunmao collection run is still active; skipping."
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

export PRICEAI_SHOPAPI_PROXY_HOSTS="catfk.com"
export PRICEAI_COLLECTOR_NODE_ID="aliyun7-new-47-121-priceai-yunmao"
export PRICEAI_COLLECTOR_NODE_NAME="Aliyun Heyuan Yunmao Collector"
export PRICEAI_COLLECTOR_NODE_TYPE="vps"
export PRICEAI_COLLECTOR_NODE_RUNTIME="systemd"
export PRICEAI_COLLECTOR_NODE_REGION="cn-heyuan"

cd "$runtime_root"
mkdir -p "$runtime_root/spool/yunmao-crawl-log"
exec "$node_bin" scripts/collect-prices.mjs \
  --all \
  --collector-kind shopApi \
  --include-family yunmao \
  --shop-scheduler \
  --post \
  --endpoint https://priceai.cc \
  --concurrency 1 \
  --post-batch-size 25 \
  --post-run-batch-size 10 \
  --post-request-offer-limit 500 \
  --full-snapshot-offer-limit 500 \
  --crawl-log-spool-dir "$runtime_root/spool/yunmao-crawl-log" \
  --shop-scheduler-bucket-minutes 30 \
  --shop-scheduler-shard-count 1 \
  --shop-scheduler-shard-index 0 \
  --liandong-shop-limit 0 \
  --liandong-shop-delay-ms 5000 \
  --shop-api-proxy-mode on-exit \
  --shop-api-proxy-parallelism 1 \
  --shop-api-proxy-reuse-limit 3 \
  --shop-api-proxy-reuse-ttl-ms 55000 \
  "$@"
