#!/bin/sh
# Fetch a self-service DevNet validator onboarding secret from a sponsor SV (valid 1 hour).
# Requires your egress IP to be allowlisted first (403 = not allowlisted yet).
set -e
SPONSOR_SV_URL="${SPONSOR_SV_URL:-https://sv.sv-1.dev.global.canton.network.sync.global}"
echo "sponsor SV: $SPONSOR_SV_URL"
resp=$(curl -sS -X POST "$SPONSOR_SV_URL/api/sv/v0/devnet/onboard/validator/prepare")
echo "ONBOARDING_SECRET=$resp"
echo
echo "Next: ./start.sh -s \"$SPONSOR_SV_URL\" -o \"$resp\" -p atomicnet -m <MIGRATION_ID> -w"
