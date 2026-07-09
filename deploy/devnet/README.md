# Running AtomicNet on Canton Network DevNet

This runbook connects AtomicNet to the **real Canton Network (DevNet)** by operating a
[Splice validator node](https://docs.canton.network/global-synchronizer/deployment/validator-docker-compose.md)
whose participant joins the Global Synchronizer, then pointing the AtomicNet backend at it.

**Status:** DevNet-**ready** — everything below is prepared and the whole app is proven against
Canton 3.5.x (DevNet's line) locally; see the pre-flight note at the bottom. The one external
prerequisite is the SV **egress-IP allowlist** (§1), which takes 2–7 days.

> Facts verified 2026-07-09 against docs.canton.network / docs.dev.sync.global and the
> `canton-network/splice` repo; DevNet then ran **Splice 0.6.11, migration id 1** — re-check
> both from the live info endpoint (§2) the day you deploy, since DevNet upgrades frequently
> and is fully reset roughly every 3 months.

## 0. Prerequisites
- Docker Desktop with **≥ 10 GB** allocated to the VM (validator+participant ≈ 6 GB + 1 GB Postgres
  + headroom). Apple Silicon (arm64) is officially supported. `docker compose` ≥ 2.26.
- A **static egress IP** (your public IP; `curl -s ifconfig.me`).

## 1. Get network access (the long pole — start FIRST)
DevNet is open (no KYC, no fee, self-service onboarding) **but** your egress IP must be added to
the SV operators' allowlist — typically **2–7 days** — or you use a sponsor-provided VPN.
- Hackathon route (recommended): ask the organizers / Canton Foundation contacts to sponsor the
  allowlist for your IP on **DevNet** and to confirm a **sponsor SV URL**
  (GSF's: `https://sv.sv-1.dev.global.canton.network.sync.global`).
- Public route: https://sync.global / the GSF validator form (expects a corporate email).
- You'll know you're allowlisted when §2's endpoints stop returning 403.

## 2. Fetch an onboarding secret (self-service on DevNet, valid 1 hour)
```bash
export SPONSOR_SV_URL=https://sv.sv-1.dev.global.canton.network.sync.global
./01-get-secret.sh          # → prints ONBOARDING_SECRET
# also note the current migration id:
curl -s https://docs.dev.global.canton.network.sync.global/info   # → { migration_id, active version }
```

## 3. Start the validator (Splice docker-compose)
Download the release **bundle matching DevNet's active version** from
https://github.com/digital-asset/decentralized-canton-sync/releases, unpack, then from
`splice-node/docker-compose/validator` (path may vary slightly by release):
```bash
./start.sh -s "$SPONSOR_SV_URL" -o "$ONBOARDING_SECRET" -p atomicnet -m <MIGRATION_ID> -w
```
- `-p atomicnet` = your validator party hint; `-m` = the migration id from §2; `-w` waits for init.
- **No `-a` flag** → Ledger API auth disabled (dev mode) and nginx bound to `127.0.0.1:80` only.
  Keep it that way: the default deployment is explicitly not hardened for public exposure.
- Wallet UI: http://wallet.localhost (user `administrator`). **Tap** some Canton Coin there —
  DevNet coin is free — so the validator's top-up automation can buy synchronizer traffic
  (free tier is 400 KB per 20-min window; the demo cycle bursts ~70 commands).

## 4. Upload the AtomicNet DAR + allocate parties
```bash
./02-upload-dar.sh          # POST /v2/dars?vetAllPackages=true (binary DAR)
./03-allocate-parties.sh    # Operator, Sub_US, Sub_UK, Sub_DE, Sub_FR, Sub_SG, Bank, Regulator
```
Parties land in **your validator's namespace** on the real network (e.g. `Sub_UK::1220…yourfingerprint`).

## 5. Point the AtomicNet backend at the validator
```bash
cd ../../backend
JSON_API_URL=http://127.0.0.1:80 \
JSON_API_HOST_HEADER=json-ledger-api.localhost \
SEED_DEMO=1 node --env-file=../.env src/api/server.ts
# frontend as usual: cd ../frontend && npm run dev
```
The nginx vhost routes on the `Host` header (`json-ledger-api.localhost` → participant:7575);
if `http://json-ledger-api.localhost` resolves on your OS you can use it directly as
`JSON_API_URL` and skip the header. If the validator was started with `-a` (OAuth), also set
`LEDGER_API_TOKEN=<jwt>`.

## 6. Verify + capture evidence
- `curl -s -H "Host: json-ledger-api.localhost" http://127.0.0.1/v2/version` → Canton 3.5.x.
- `POST /api/demo/run` → 20 invoices net to 3 payments **on DevNet**; balances = opening ± net.
- Evidence for the submission: party IDs (your namespace), wallet UI screenshot, the cycle output.

## Teardown / resets
- Stop: `./stop.sh` (from the compose dir). DevNet is **wiped ~every 3 months** and upgrades
  frequently — after a reset, redeploy with the new bundle and `-m 0`, re-tap coin, re-run §4.
- This is why the always-on public demo (Railway) stays on the self-contained sandbox; the
  DevNet validator is the real-network deployment, run on demand.

## Pre-flight already proven (no DevNet needed)
The exact compatibility risks were eliminated locally on 2026-07-09:
- The **SDK 3.4.11 DAR loads and runs on Canton 3.5.1** (DevNet runs Canton 3.5.x) — official
  docs also state older 3.x DARs are compatible.
- The backend was fixed to use **package-name template references everywhere** (Canton 3.5
  dropped package-id references on the Ledger API) and the **full 20→3 demo cycle settled
  green against a 3.5.1 sandbox** — reduction 20→3, exact balances, privacy intact.
