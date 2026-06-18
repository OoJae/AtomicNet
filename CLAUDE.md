# AtomicNet — project rules for Claude Code

## What this is
Privacy-preserving multilateral intercompany netting + atomic cross-currency settlement on Canton, with a human-in-the-loop AI treasury agent. Hackathon project (Encode × Canton Foundation, Jun–Jul 2026). Goal: win on technical execution, originality, UX, and real-world applicability.

## Inviolable rules
1. **PRIVACY IS ENFORCED BY THE LEDGER, NOT THE APP.** Always query as the logged-in party; never filter data in the backend/frontend to "hide" it. If data leaks, fix the Daml signatory/observer model.
2. **SETTLEMENT IS ATOMIC.** One transaction, all-or-nothing. Never allow partial settlement.
3. **THE AI AGENT PROPOSES; IT NEVER SETTLES.** No code path from agent output to ExecuteSettlement. Settlement requires on-ledger ApproveNetPosition by subsidiaries AND a human click.
4. **NO SECRETS IN THE REPO.** API keys via env vars only; `.env` is git-ignored (`.env.example` is the template).
5. **VERIFY APIS AGAINST THE INSTALLED SDK.** Read installed package source / `--help` / the JSON API OpenAPI for exact signatures; don't rely on remembered APIs.

## Parties
Operator, Sub_US/Sub_UK/Sub_DE (3–5), Bank (cash registry), Regulator (read-only observer for selective disclosure).

## Daml model (core)
IntercompanyInvoice (signatory issuer+payer, observer operator; created via propose/accept) · NettingCycle (signatory operator, observer regulator; participants NOT whole-cycle observers) · NetPosition (signatory operator, observer subsidiary+regulator) → ApprovedNetPosition (signatory operator+subsidiary) · Deposit / DepositAllocation (allocation co-signed by bank+owner) · SettlementBatch.ExecuteSettlement (operator-controlled, consumes all allocations + pays all receivers in one tx). Cash leg may be swapped for the Canton token standard later.

## Authorization model
Inside a choice, authority = controllers ∪ signatories of the exercised contract. Use co-signed allocations so the operator can settle atomically on subsidiaries' behalf. **Authorization ≠ visibility**: a party that has authority to act on a contract must also be a stakeholder (signatory/observer) to *see* it — use the escrow/allocation pattern so the settling party can read what it settles (proven in the Stage-0 spike).

## Tests (keep green; write early)
Lifecycle · Privacy (sibling can't see) · Atomicity (bad allocation → whole tx fails) · Conservation (Σ net == 0) · Authorization (no forging, no unilateral settle) · Regulator (selective disclosure). Run `dpm test` in CI on push.

## Headline metric
Reduction ratio: gross invoices → net payments (target a satisfying number like 20→3 in the demo dataset).

## Environment decision (locked) — Hybrid
Stages 0–4 on the lightweight stack: **Daml Script (`dpm test`)** for all proofs + **`dpm sandbox` + JSON Ledger API** for the live app, with a hand-rolled `Deposit` cash leg. **Node/TS** thin backend (talks JSON Ledger API). CN Quickstart **LocalNet** is a Stage-5-only stretch (token-standard demo). Fallbacks: token standard stalls → hand-rolled Deposit; multi-currency atomicity fiddly → single currency + note as future work.

## Toolchain & commands (verified 2026 — this machine)
- **Daml 3.x uses DPM (`dpm`)**, not the classic `daml` assistant (2.x, being removed). dpm is at `~/.dpm/bin`.
- Each shell must export: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` and `export PATH="$HOME/.dpm/bin:$JAVA_HOME/bin:$PATH"` (also persisted in `~/.zshrc`, but Claude Code's Bash tool does NOT source it — export inline every call).
- Build a multi-package project: `dpm build --all` (single package: `dpm build`). Test: run `dpm test` **inside the package dir**.
- Live ledger: `dpm sandbox --json-api-port 7575 --dar <dar>` → gRPC Ledger API `localhost:6865`, JSON Ledger API `localhost:7575` (OpenAPI at `/docs/openapi`; dev mode = no auth). Run a script against it: `dpm script --dar <dar> --script-name Module:fn --ledger-host localhost --ledger-port 6865 --wall-clock-time`.
- **Version pin:** project `sdk-version: 3.4.11` for the real model (matches CN Quickstart `main`, so DARs load on its LocalNet). The dpm default bundle is 3.5.1; `dpm install 3.4.11` fetches the pinned line. (The throwaway `stage0-spike/` uses 3.5.1.)
- `daml start`, `daml ledger allocate-parties/upload-dar/list-parties` no longer exist — use Daml Script, the JSON Ledger API, or `dpm canton-console`.

## UI
Institutional fintech, not crypto-neon. Read `/mnt/skills/public/frontend-design/SKILL.md` before building UI. Centerpieces: the Gross→Net visualization and the live party-switch privacy proof.

## Build order (gates)
S0 ✅ toolchain + atomic-swap gate (see `docs/STAGE0.md`) · S1 Types/Invoice/Cycle/NetPosition + happy path · S2 Cash + ExecuteSettlement + atomicity · S3 multi-currency + FX + full test suite · S4 Node/TS backend + React frontend + AI agent (human gate) · S5 demo data + polish + hosted demo + README + CI.
