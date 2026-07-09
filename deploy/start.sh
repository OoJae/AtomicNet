#!/bin/sh
# Default mode: launch the local Canton sandbox, wait for its JSON API, then start the
# backend (which serves the built frontend on the same origin and bootstraps the ledger).
# External-ledger mode: when JSON_API_URL points at a remote validator (e.g. the Canton
# DevNet shared validator), skip the local sandbox entirely — the backend goes straight
# to the real network.
set -e
export PATH="/root/.dpm/bin:$PATH"

# Sandbox mode when JSON_API_URL is unset or explicitly a localhost URL. The glob is anchored
# to the scheme+host prefix so a REMOTE url that merely contains "localhost" in a path can't
# silently pick sandbox mode.
case "${JSON_API_URL:-}" in
  ""|http://localhost*|http://127.0.0.1*)
    DAR=/app/daml/.daml/dist/atomicnet-model-0.2.0.dar
    SANDBOX_HEAP="${SANDBOX_HEAP:--Xmx1280m -Xms256m}"
    echo "[start] mode=sandbox — launching Canton sandbox (heap: $SANDBOX_HEAP)"
    JAVA_TOOL_OPTIONS="$SANDBOX_HEAP" dpm sandbox --json-api-port 7575 --dar "$DAR" --no-tty &
    SANDBOX_PID=$!
    echo "[start] waiting for the sandbox JSON API (pid $SANDBOX_PID)..."
    i=0
    until curl -sf http://localhost:7575/v2/version >/dev/null 2>&1; do
      # Fail loud (non-zero exit -> Railway restarts) if the JVM died or never came up.
      if ! kill -0 "$SANDBOX_PID" 2>/dev/null; then
        echo "[start] FATAL: sandbox process exited before the JSON API came up"; exit 1
      fi
      i=$((i + 1))
      if [ "$i" -ge 90 ]; then   # ~180s
        echo "[start] FATAL: sandbox JSON API not ready after ~180s"; kill "$SANDBOX_PID" 2>/dev/null; exit 1
      fi
      sleep 2
    done
    echo "[start] sandbox ready"
    ;;
  *)
    echo "[start] mode=external — ledger $JSON_API_URL — skipping local sandbox"
    ;;
esac

cd /app/backend
exec tsx src/api/server.ts
