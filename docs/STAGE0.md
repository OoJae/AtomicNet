# Stage 0 — Environment & atomic-settlement gate (✅ GREEN)

Stage 0 de-risks the whole project before any application contracts are written. It proves the toolchain works and that the two hard Canton properties — **sub-transaction privacy** and **atomic multi-party settlement** — are real, with the exact authority mechanics AtomicNet's settlement depends on.

## What was proven

| Property | How | Result |
|---|---|---|
| Toolchain | OpenJDK 21 + DPM `1.0.17` (SDK 3.5.1), `dpm build --all` | DAR built ✓ |
| **Atomic two-asset swap** | `SwapProposal` escrow → `AcceptSwap` moves both legs in ONE transaction | `dpm test` green ✓ |
| **Privacy (by protocol)** | A non-stakeholder (`Carol`) `queryContractId`/`query @Asset` returns None / empty | asserted ✓ |
| **Authorization** | `Carol` cannot accept others' swap nor move an asset she doesn't own (`submitMustFail`) | asserted ✓ |
| **Live ledger** | `dpm sandbox` in-memory Canton; seeded 6 parties + a contract over gRPC | `seedLedger SUCCESS` ✓ |
| **JSON Ledger API** | `/livez`,`/readyz`,`/v2/version`,`/docs/openapi`, and an ACS read of the seeded contract as `Sub_US` | HTTP 200, correct data ✓ |

The single most important lesson, encoded in `stage0-spike/`: **authorization ≠ visibility.** A party can have the *authority* to move a contract (via another party's signature on a proposal) yet be unable to *see* it. The fix — and the pattern AtomicNet reuses for settlement — is to **escrow the asset into a co-signed contract the settling party can observe** (the analogue of `DepositAllocation`). The naive "exercise a choice on a counterparty's hidden contract" fails with `contract not visible to the reading parties`.

## Reproduce

```bash
# one-time toolchain (already installed on this machine)
brew install openjdk@21
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$HOME/.dpm/bin:$JAVA_HOME/bin:$PATH"
curl https://get.digitalasset.com/install/install.sh | sh   # installs dpm to ~/.dpm

# the gate (in-memory, no Docker)
cd stage0-spike
dpm build --all
( cd test && dpm test )                                     # → atomicSwap: ok

# live-ledger smoke test
dpm sandbox --json-api-port 7575 --dar test/.daml/dist/stage0-spike-test-0.0.1.dar &
dpm script --dar test/.daml/dist/stage0-spike-test-0.0.1.dar \
  --script-name Test:seedLedger --ledger-host localhost --ledger-port 6865 --wall-clock-time
curl -s http://localhost:7575/v2/version                    # → {"version":"3.5.1",...}
```

## Notes for later stages
- JSON Ledger API v2 ACS read shape (used in Stage 4 backend reads, performed *as the party*):
  `POST /v2/state/active-contracts` with body `{ "activeAtOffset": <ledger-end offset>, "eventFormat": { "filtersByParty": { "<party>": { "cumulative": [ { "identifierFilter": { "WildcardFilter": { "value": { "includeCreatedEventBlob": false } } } } ] } }, "verbose": true } }`. Get the offset from `GET /v2/state/ledger-end`.
- `stage0-spike/` is a throwaway proof; the real model lives in `daml/` + `daml-tests/` from Stage 1.
- Real model pins `sdk-version: 3.4.11` (CN Quickstart LocalNet compatibility for the Stage-5 token-standard demo).
