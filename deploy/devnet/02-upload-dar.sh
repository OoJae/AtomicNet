#!/bin/sh
# Upload the AtomicNet model DAR to the validator's participant via the JSON Ledger API.
# Run after the validator is healthy. LEDGER_API_TOKEN only needed if started with -a.
set -e
BASE="${JSON_API_URL:-http://127.0.0.1:80}"
HOST_HEADER="${JSON_API_HOST_HEADER:-json-ledger-api.localhost}"
DAR="${DAR:-$(dirname "$0")/../../daml/.daml/dist/atomicnet-model-0.1.0.dar}"
[ -f "$DAR" ] || { echo "DAR not found: $DAR (run: dpm build --all)"; exit 1; }
echo "uploading $DAR -> $BASE/v2/dars?vetAllPackages=true (Host: $HOST_HEADER)"
curl -sS -X POST "$BASE/v2/dars?vetAllPackages=true" \
  -H "Host: $HOST_HEADER" \
  -H "Content-Type: application/octet-stream" \
  ${LEDGER_API_TOKEN:+-H "Authorization: Bearer $LEDGER_API_TOKEN"} \
  --data-binary "@$DAR"
echo
echo "done — verify with: curl -s -H 'Host: $HOST_HEADER' $BASE/v2/packages | head"
