#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="${PRICEAI_ENDPOINT:-https://priceai.cc}"
SCRIPT_URL="${PRICEAI_EDGE_COLLECTOR_SCRIPT_URL:-${ENDPOINT%/}/priceai-edge-collector.mjs}"
TMP_DIR="${TMPDIR:-/tmp}"
SCRIPT_PATH="$(mktemp "$TMP_DIR/priceai-edge-collector.XXXXXX.mjs")"
cleanup() {
  rm -f "$SCRIPT_PATH"
}
trap cleanup EXIT

if ! command -v node >/dev/null 2>&1; then
  echo "PriceAI edge collector requires Node.js 18+." >&2
  echo "Install Node.js first, then rerun this command." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "PriceAI edge collector requires Node.js 18+. Current: $(node -v)" >&2
  exit 1
fi

curl -fsSL "$SCRIPT_URL" -o "$SCRIPT_PATH"
node "$SCRIPT_PATH" "$@"
