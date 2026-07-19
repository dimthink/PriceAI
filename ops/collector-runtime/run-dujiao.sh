#!/usr/bin/env bash
set -euo pipefail

runtime_root="${PRICEAI_COLLECTOR_RUNTIME_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
release_dir="${PRICEAI_COLLECTOR_RELEASE_DIR:-$runtime_root/current}"

cd "$release_dir"
set -a
source "$runtime_root/env"
set +a

export PRICEAI_COLLECTOR_NODE_ID="huoshan2-nonshop-dujiao"
export PRICEAI_COLLECTOR_NODE_NAME="Huoshan2 Non-shop Dujiao"
export PRICEAI_COLLECTOR_NODE_TYPE="vps"
export PRICEAI_COLLECTOR_NODE_RUNTIME="systemd"
export PRICEAI_COLLECTOR_NODE_REGION="overseas"

exec /usr/bin/node scripts/collect-prices.mjs \
  --all \
  --kind dujiao \
  --exclude-source jzai168-com \
  --concurrency "${PRICEAI_DUJIAO_CONCURRENCY:-2}" \
  --post \
  --endpoint https://priceai.cc
