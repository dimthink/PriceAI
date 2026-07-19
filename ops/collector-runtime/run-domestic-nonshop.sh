#!/usr/bin/env bash
set -euo pipefail

runtime_root="${PRICEAI_COLLECTOR_RUNTIME_ROOT:-/opt/priceai-worker}"

cd "$runtime_root"
set -a
source /etc/priceai/collector-proxy.env
set +a

mkdir -p "$runtime_root/spool/crawl-log-domestic"
exec 9>/tmp/priceai-domestic-nonshop.lock
if ! flock -n 9; then
  echo "priceai domestic non-shop collector is already running; skip this tick"
  exit 0
fi

for source_id in nodebits-f29bd25cc843c467 nodebits-05b3a4700ccf9e8a jzai168-com; do
  ./node_modules/node/bin/node scripts/collect-prices.mjs \
    --source "$source_id" \
    --post \
    --endpoint https://priceai.cc \
    --collector-node-id aliyun6-hangzhou-nonshop-domestic \
    --collector-node-name "Aliyun Hangzhou Non-shop Domestic" \
    --collector-node-type vps \
    --collector-node-runtime systemd \
    --collector-node-region cn \
    --concurrency 1 \
    --post-batch-size 25 \
    --post-run-batch-size 10 \
    --post-request-offer-limit 500 \
    --full-snapshot-offer-limit 500 \
    --crawl-log-spool-dir "$runtime_root/spool/crawl-log-domestic"
done
