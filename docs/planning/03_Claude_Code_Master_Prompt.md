# AtomicNet — Claude Code Master Prompt

This file gives you (1) a **master bootstrap prompt** to paste into Claude Code to start the project, (2) a recommended **`CLAUDE.md`** to drop in the repo root so Claude Code keeps the context every session, and (3) **focused phase prompts** to drive each stage. Use the bootstrap prompt first.

---

## How to use this

1. Create an empty folder, open Claude Code in it, and paste the **Master Bootstrap Prompt** below.
2. Let it set up the environment and clear the Stage-0 gate (atomic two-asset swap) **before** building app logic. Don't skip the gate.
3. Save the **`CLAUDE.md`** content (further down) into the repo root so every future Claude Code session has the project rules.
4. Drive subsequent work with the **Phase Prompts**, one focused task at a time. Review diffs; keep commits small.

---

## 1) Master Bootstrap Prompt — paste this into Claude Code

```text
You are my senior engineer for a hackathon project called AtomicNet, which we are building to win 1st place in the "Build on Canton Hackathon" (Encode Club × Canton Foundation, June–July 2026). Read this entire brief, then propose a plan before writing code. Ask me at most a few high-value clarifying questions, then proceed.

=== WHAT WE'RE BUILDING ===
AtomicNet is a privacy-preserving multilateral intercompany netting and cross-currency settlement engine on the Canton Network, with an AI treasury agent. The subsidiaries of a multinational raise intercompany invoices in multiple currencies; AtomicNet nets them — collapsing a web of gross cross-currency payments into ONE net payment per entity — where (a) no subsidiary can see another subsidiary's bilateral balances, and (b) the multi-currency net settlement executes atomically against tokenized bank deposits. The whole point is to showcase the two things Canton can do that Ethereum cannot do simultaneously: sub-transaction privacy AND atomic multi-party (cross-currency) settlement.

=== WHY CANTON (must stay true in the design) ===
- Privacy is enforced by the LEDGER, never by our application. A party learns of a contract only if it is a signatory, observer, or controller of an exercised choice. We must NEVER "filter in the app" — we query the ledger AS the logged-in party and let Canton's privacy do the filtering. If you ever find yourself hiding data in the backend/frontend, stop and fix the Daml model instead.
- Settlement must be genuinely atomic: one transaction, all-or-nothing. No partial settlement is ever acceptable (it would create financial exposure).

=== TECH STACK ===
- Ledger: Canton via the CN Quickstart (digital-asset/cn-quickstart) LocalNet if it runs on this machine; otherwise fall back to `daml sandbox --json-api-port 7575`. Decide quickly and tell me which.
- Smart contracts: Daml. Tests: Daml Script.
- Backend: the Quickstart backend (Spring Boot) OR a thin Node/TypeScript service talking to the JSON Ledger API — pick whichever gets us to a working full stack fastest; justify the choice.
- Frontend: the Quickstart React + TypeScript + Vite app, themed for institutional treasury (clean, dense, trustworthy — NOT crypto-neon).
- AI agent: a backend service calling the Anthropic API. The API key comes from an environment variable; never hardcode or commit it.

=== PARTIES ===
Operator (netting center), 3–5 Subsidiaries (Sub_US, Sub_UK, Sub_DE, ...), Bank (cash registry / tokenized deposit issuer), Regulator (read-only selective-disclosure observer).

=== DAML MODEL (target design — refine against the installed SDK) ===
- Types: CurrencyCode (Text), FxRate {base, quote, rate}, CycleStatus {Open, Locked, Settled, Cancelled}.
- IntercompanyInvoice {operator, issuer, payer, amount, currency, invoiceId, dueDate, included}; signatory issuer, payer; observer operator. Created via a propose/accept pattern (InvoiceProposal signed by issuer, AcceptInvoice controlled by payer) so neither party can forge the other's signature. CRITICAL: only issuer, payer, operator are ever parties to an invoice, so siblings can never see it.
- NettingCycle {operator, regulator, participants, settlementCurrency, fxRates, cycleId, status}; signatory operator; observer regulator. Participants are intentionally NOT observers of the whole cycle (so they can't enumerate each other) — they see only their own NetPosition.
- NetPosition {operator, subsidiary, regulator, cycleId, settlementCurrency, netAmount}; signatory operator; observer subsidiary, regulator. ApproveNetPosition (controlled by subsidiary) creates ApprovedNetPosition {signatory operator, subsidiary; observer regulator} — this co-signature is what delegates settlement authority to the operator.
- Cash (MVP, hand-rolled — we will optionally swap for the token standard later): Deposit {bank, owner, currency, amount}, signatory bank, observer owner. DepositAllocation {bank, owner, operator, currency, amount, cycleId}, signatory bank+owner, observer operator, with a Disburse choice (controller operator) that moves reserved funds to a recipient. The bank+owner co-signature on the allocation is what lets the operator settle atomically without re-authorizing the bank at settle time.
- Settlement: SettlementBatch {operator, regulator, cycleId, payerAllocations, payouts}; signatory operator; observer regulator; ExecuteSettlement (controller operator) consumes ALL payer allocations and pays ALL receivers in ONE transaction (atomic).
- Regulator selective disclosure = adding `regulator` as an observer on cycle/net-position/settlement contracts. No separate view template needed.

=== THE AUTHORIZATION MODEL (get this exactly right) ===
Inside a Daml choice, the available authority is the union of the choice's controllers and the signatories of the contract being exercised. We use this so the operator can move each subsidiary's reserved cash within a single atomic settlement: (1) subsidiaries ApproveNetPosition (co-sign), (2) net payers create DepositAllocations co-signed by payer+bank, (3) operator's ExecuteSettlement consumes those allocations — their signatures make the needed authority available — and pays receivers, all atomically. If any allocation is missing/insufficient, the whole transaction must fail and nothing settles.

=== THE NETTING MATH (keep simple, in backend or Script) ===
Convert each invoice to the settlement currency via the cycle's fixed FX rates. net(X) = Σ(owed to X) − Σ(X owes). net>0 receiver, net<0 payer. Assert the invariant Σ net(X) == 0. Build a settlement plan where payers reserve |net| and receivers are paid net. Track the reduction ratio (e.g., 20 gross invoices → 3 net payments) as our headline metric.

=== AI TREASURY AGENT (human-in-the-loop — non-negotiable) ===
A backend service that takes the operator-visible positions as JSON and returns a JSON netting-cycle proposal plus a plain-English rationale. It can ONLY populate the proposal form. There must be NO code path from agent output to ExecuteSettlement. Settlement always requires subsidiaries' on-ledger ApproveNetPosition AND a human clicking execute. We will say in the demo: "the agent proposes, but cannot move a dollar without on-ledger consent and human approval."

=== TESTS (write these EARLY, not last — they are our top proof of technical execution) ===
Daml Scripts proving: (1) happy-path lifecycle end to end; (2) PRIVACY — a sibling cannot fetch another pair's invoice or another subsidiary's NetPosition; (3) ATOMICITY — a settlement with one bad allocation fails entirely, no balances change; (4) CONSERVATION — Σ net == 0, tampered cycle rejected; (5) AUTHORIZATION — no forging an invoice that binds another party, no subsidiary can trigger settlement; (6) REGULATOR — full visibility for regulator, siblings still blind to each other. Set up GitHub Actions to run `daml test` on push if time allows.

=== BUILD ORDER (respect the gates) ===
Stage 0 (DO FIRST, gate): get LocalNet or sandbox running; allocate parties; build+upload a trivial DAR; submit a command via the JSON Ledger API; then write a Daml Script that performs an ATOMIC TWO-ASSET SWAP between two parties with a passing privacy assertion. Do not build app logic until this is green.
Stage 1: Types, Invoice (+propose/accept), Cycle, NetPosition; happy-path Script.
Stage 2: Cash (Deposit + DepositAllocation) and ExecuteSettlement; single-currency atomic netting across 3 parties in a Script.
Stage 3: multi-currency + FX + netting service; full test suite (all green). Gate: multi-currency atomic settlement works, or we descope to single currency and note it.
Stage 4: backend read/write paths (reads done AS the party); then frontend (party switcher, subsidiary dashboard, operator console, the Gross→Net visualization, the privacy proof view, regulator view); then the AI agent service + panel with the human-approval gate.
Stage 5: seed a compelling demo dataset (5 entities, ~20 invoices, 3 currencies, reduction like 20→3), polish, deploy a hosted demo, write README + tests-explainer.

=== CODING STANDARDS ===
- Idiomatic, well-documented Daml. Keep authorization declarative via signatory/observer/controller. Avoid anti-patterns: never use "visibility as security" (relying on the UI to hide data), never smuggle authority, never make a party an observer of more than it needs.
- Clean commits, small diffs, meaningful messages. No secrets in the repo (.gitignore the env). A clear README and architecture diagram.
- Before writing any frontend UI, read /mnt/skills/public/frontend-design/SKILL.md (if present) and apply its guidance so we don't ship a templated default. Aim for an institutional fintech look: restrained palette, strong typography, dense legible tables, clear status chips.
- When unsure of an exact Canton/Daml/token-standard API or path, READ THE INSTALLED PACKAGE SOURCE to get the real signature rather than guessing. Tell me when a remembered API differs from what's installed.

=== HOW TO WORK WITH ME ===
- Start by proposing a concrete plan and confirming the environment choice (LocalNet vs sandbox). Then execute stage by stage, pausing at each gate to show me it's green.
- Prefer working software at every step over big-bang integration. Keep the project runnable.
- Flag risks early (esp. LocalNet RAM, token-standard integration, multi-currency atomicity) and propose the documented fallbacks (sandbox; hand-rolled Deposit; single-currency) rather than getting stuck.

Begin by (a) detecting my OS and installed tooling (Docker, Daml SDK/DPM, Node, JDK), (b) recommending LocalNet vs sandbox for this machine, (c) giving me the Stage-0 plan, and (d) listing anything you need me to install. Do not write application contracts yet.
```

---

## 2) `CLAUDE.md` — save this in the repo root

Claude Code automatically reads `CLAUDE.md`. Keep it short and rule-focused so every session inherits the guardrails:

```markdown
# AtomicNet — project rules for Claude Code

## What this is
Privacy-preserving multilateral intercompany netting + atomic cross-currency settlement on Canton, with a human-in-the-loop AI treasury agent. Hackathon project (Encode × Canton Foundation). Goal: win on technical execution, originality, UX, and real-world applicability.

## Inviolable rules
1. PRIVACY IS ENFORCED BY THE LEDGER, NOT THE APP. Always query as the logged-in party; never filter data in the backend/frontend to "hide" it. If data leaks, fix the Daml signatory/observer model.
2. SETTLEMENT IS ATOMIC. One transaction, all-or-nothing. Never allow partial settlement.
3. THE AI AGENT PROPOSES; IT NEVER SETTLES. No code path from agent output to ExecuteSettlement. Settlement requires on-ledger ApproveNetPosition by subsidiaries AND a human click.
4. NO SECRETS IN THE REPO. API keys via env vars only; .gitignore them.
5. VERIFY APIS AGAINST THE INSTALLED SDK. Read installed package source for exact signatures; don't rely on remembered APIs.

## Parties
Operator, Sub_US/Sub_UK/Sub_DE (3–5), Bank (cash registry), Regulator (read-only observer for selective disclosure).

## Daml model (core)
IntercompanyInvoice (signatory issuer+payer, observer operator; created via propose/accept) · NettingCycle (signatory operator, observer regulator; participants NOT whole-cycle observers) · NetPosition (signatory operator, observer subsidiary+regulator) → ApprovedNetPosition (signatory operator+subsidiary) · Deposit / DepositAllocation (allocation co-signed by bank+owner) · SettlementBatch.ExecuteSettlement (operator-controlled, consumes all allocations + pays all receivers in one tx). Cash leg may be swapped for the Canton token standard later.

## Authorization model
Inside a choice, authority = controllers ∪ signatories of the exercised contract. Use co-signed allocations so the operator can settle atomically on subsidiaries' behalf.

## Tests (keep green; write early)
Lifecycle, Privacy (sibling can't see), Atomicity (bad allocation → whole tx fails), Conservation (Σ net == 0), Authorization (no forging, no unilateral settle), Regulator (selective disclosure). Run `daml test` in CI if possible.

## Headline metric
Reduction ratio: gross invoices → net payments (target a satisfying number like 20→3 in the demo dataset).

## Fallbacks (use rather than getting stuck)
LocalNet too heavy → `daml sandbox --json-api-port 7575`. Token standard stalls → hand-rolled Deposit. Multi-currency atomicity fiddly → single currency + note as future work.

## UI
Institutional fintech, not crypto-neon. Read /mnt/skills/public/frontend-design/SKILL.md before building UI. Centerpieces: the Gross→Net visualization and the live party-switch privacy proof.
```

---

## 3) Phase Prompts — drive each stage with a focused task

Paste these one at a time, after Stage 0 is green. Each is intentionally narrow.

**Stage 1 — Daml core + happy path**
```text
Implement the Daml model for Stage 1: Types, IntercompanyInvoice with the InvoiceProposal/AcceptInvoice propose-accept pattern, NettingCycle, and NetPosition → ApprovedNetPosition. Then write a Daml Script "Lifecycle" that allocates Operator, Sub_US, Sub_UK, Sub_DE, Bank, Regulator; creates a few invoices via propose/accept; opens and locks a cycle; creates and approves net positions. Assert the happy path succeeds. Keep authorization declarative. Show me the code and the passing test before moving on.
```

**Stage 2 — Cash + atomic settlement (single currency)**
```text
Implement Cash (Deposit + DepositAllocation with the bank+owner co-signature and the operator-controlled Disburse) and SettlementBatch with ExecuteSettlement that consumes all payer allocations and pays all receivers in ONE transaction. Extend the Script to settle a 3-party, single-currency netting atomically, asserting final balances = opening balances ± net. Then add an "Atomicity" Script proving that a settlement with one missing/insufficient allocation fails entirely with NO balance changes. Show both tests green.
```

**Stage 3 — Multi-currency, netting service, full test suite**
```text
Add multi-currency support and FX fixing to the cycle, and a TypeScript netting service that computes net positions across currencies and asserts Σ net == 0. Make ExecuteSettlement work across 3 currencies and 4–5 parties. Then complete the Daml Script test suite: Privacy (a sibling cannot fetch another pair's invoice or another subsidiary's NetPosition), Authorization (no forging an invoice binding another party; no subsidiary can trigger settlement), and Regulator (full visibility for Regulator; siblings still blind). All tests must pass. If multi-currency atomicity is too fiddly, descope to single currency, tell me, and note it as future work.
```

**Stage 4 — Backend + frontend + agent**
```text
Wire the backend read/write paths to the real templates (reads performed AS the logged-in party so the ledger does the privacy filtering). Then build the frontend on the Quickstart React app: a party switcher; a subsidiary dashboard (only that entity's invoices, its net position, its deposit balances, an Approve action); an operator console (open/lock cycle, view net positions, FX, the reduction metric, Execute settlement enabled only when all approved); the Gross→Net visualization (animate the gross graph collapsing to net payments); a privacy-proof view (live data as each party); and a regulator view. Read the frontend-design skill first and use an institutional look. Finally, add the AI treasury agent service (Anthropic API, positions-in → JSON proposal + rationale-out) and an agent panel with a prominent human "Approve & propose cycle" button — with NO path from agent output to settlement.
```

**Stage 5 — Demo data, polish, deploy, docs**
```text
Seed a compelling demo dataset: 5 entities, ~20 intercompany invoices across 3 currencies, designed so netting reduces to about 3 net payments. Polish UI states (loading/empty/error), status chips, and copy for an institutional feel. Deploy a hosted demo (frontend hosted; persistent backend + LocalNet/ScratchNet, clearly labeled "demo environment") and verify it works from a fresh incognito browser. Write the README (problem, "only on Canton" argument, architecture diagram, run instructions, and a "What our tests prove" section linking each Daml Script to its guarantee). Set up GitHub Actions to run `daml test` on push. Confirm no secrets are committed.
```

---

*Order of operations is the whole strategy: clear the Stage-0 atomic-swap gate, build the Daml core, prove privacy and atomicity with tests early, then make it beautiful and deploy. Feed Claude Code one phase at a time and review every diff.*
