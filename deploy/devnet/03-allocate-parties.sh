#!/bin/sh
# Allocate the AtomicNet parties on the validator's participant (idempotent: the backend's
# bootstrap also does allocate-or-reuse; this script just pre-creates them explicitly).
set -e
BASE="${JSON_API_URL:-http://127.0.0.1:80}"
HOST_HEADER="${JSON_API_HOST_HEADER:-json-ledger-api.localhost}"
for p in Operator Sub_US Sub_UK Sub_DE Sub_FR Sub_SG Bank Regulator; do
  echo "allocating $p..."
  curl -sS -X POST "$BASE/v2/parties" \
    -H "Host: $HOST_HEADER" \
    -H "Content-Type: application/json" \
    ${LEDGER_API_TOKEN:+-H "Authorization: Bearer $LEDGER_API_TOKEN"} \
    -d "{\"partyIdHint\": \"$p\"}" | head -c 200
  echo
done
echo "done — these party IDs live in YOUR validator's namespace on the Canton Network."
