#!/usr/bin/env bash
set -euo pipefail

runtime_root="${PRICEAI_COLLECTOR_RUNTIME_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
release_dir="${PRICEAI_COLLECTOR_RELEASE_DIR:-$runtime_root/current}"

cd "$release_dir"
set -a
source "$runtime_root/env"
set +a

export PRICEAI_COLLECTOR_NODE_ID="huoshan2-nonshop"
export PRICEAI_COLLECTOR_NODE_NAME="Huoshan2 Non-shop"
export PRICEAI_COLLECTOR_NODE_TYPE="vps"
export PRICEAI_COLLECTOR_NODE_RUNTIME="systemd"
export PRICEAI_COLLECTOR_NODE_REGION="overseas"

exec /usr/bin/node scripts/collect-prices.mjs \
  --all \
  --post \
  --endpoint https://priceai.cc \
  --exclude-kind shopApi,dujiao \
  --exclude-source nodebits-f29bd25cc843c467,nodebits-05b3a4700ccf9e8a \
  --concurrency "1" \
  --post-batch-size 25 \
  --post-request-offer-limit 25 \
  --crawl-log-spool-dir "$runtime_root/spool/crawl-log"
