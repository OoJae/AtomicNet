#!/bin/sh
# Default mode: launch the local Canton sandbox, wait for its JSON API, then start the
# backend (which serves the built frontend on the same origin and bootstraps the ledger).
# External-ledger mode: when JSON_API_URL points at a remote validator (e.g. the Canton
# DevNet shared validator), skip the local sandbox entirely — the backend goes straight
# to the real network.
set -e
export PATH="/root/.dpm/bin:$PATH"

case "${JSON_API_URL:-}" in
  ""|*localhost*|*127.0.0.1*)
    DAR=/app/daml/.daml/dist/atomicnet-model-0.1.0.dar
    SANDBOX_HEAP="${SANDBOX_HEAP:--Xmx1280m -Xms256m}"
    echo "[start] launching Canton sandbox (heap: $SANDBOX_HEAP)"
    JAVA_TOOL_OPTIONS="$SANDBOX_HEAP" dpm sandbox --json-api-port 7575 --dar "$DAR" --no-tty &
    echo "[start] waiting for the sandbox JSON API..."
    until curl -sf http://localhost:7575/v2/version >/dev/null 2>&1; do sleep 2; done
    echo "[start] sandbox ready"
    ;;
  *)
    echo "[start] external ledger configured ($JSON_API_URL) — skipping local sandbox"
    ;;
esac

cd /app/backend
exec tsx src/api/server.ts
