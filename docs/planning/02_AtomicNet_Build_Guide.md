# AtomicNet — Comprehensive Build Guide

**Confidential Multilateral Netting & Cross-Currency Settlement on Canton Network, with an AI Treasury Agent.**

This is your end-to-end build manual: what to build, how to build it, in what order, and how to package it to win. Work top-to-bottom; each phase has an explicit "done" gate. Pair this with `03_Claude_Code_Master_Prompt.md` (paste that into Claude Code to bootstrap).

---

## Table of contents

1. [How to use this document](#1-how-to-use-this-document)
2. [What you're building (the spec)](#2-what-youre-building-the-spec)
3. [The winning thesis in one page](#3-the-winning-thesis-in-one-page)
4. [System architecture overview](#4-system-architecture-overview)
5. [The Canton / Daml mental model you actually need](#5-the-canton--daml-mental-model-you-actually-need)
6. [Stage 0 — Environment setup & de-risking](#6-stage-0--environment-setup--de-risking)
7. [The party & data model](#7-the-party--data-model)
8. [The Daml contract layer, template by template](#8-the-daml-contract-layer-template-by-template)
9. [The netting algorithm](#9-the-netting-algorithm)
10. [The atomic settlement design (the hard, important part)](#10-the-atomic-settlement-design-the-hard-important-part)
11. [Backend layer](#11-backend-layer)
12. [Frontend layer](#12-frontend-layer)
13. [The AI treasury agent (human-in-the-loop)](#13-the-ai-treasury-agent-human-in-the-loop)
14. [Testing strategy — proving privacy and atomicity](#14-testing-strategy--proving-privacy-and-atomicity)
15. [The 4-week build plan, day by day](#15-the-4-week-build-plan-day-by-day)
16. [The 3-minute demo script](#16-the-3-minute-demo-script)
17. [Submission checklist](#17-submission-checklist)
18. [Risk register & fallback plans](#18-risk-register--fallback-plans)
19. [Resources to verify against current docs](#19-resources-to-verify-against-current-docs)
20. [Appendix A — repo layout](#appendix-a--repo-layout)
21. [Appendix B — glossary](#appendix-b--glossary)

---

## 1. How to use this document

- **Read sections 2–5 once, fully.** They give you the spec and the mental model. Everything else depends on them.
- **Section 6 is a hard gate.** Do not write a single application contract until LocalNet runs and you've executed one atomic two-asset transfer. This de-risks the whole project.
- **Sections 7–13 are the build**, in dependency order: data model → Daml → netting → settlement → backend → frontend → agent.
- **Section 14 (tests) is not optional** — passing Daml Script tests that *prove* privacy and atomicity are your single most persuasive artifact with the judges.
- **Sections 15–17 are delivery**: schedule, demo, submission.
- Anywhere you see **`⚠ VERIFY`**, the exact API/path may have changed since this guide was written — check the live docs (section 19) or ask Claude Code to confirm against the installed SDK version. The *concepts* are stable; specific function names in the token standard and Quickstart evolve.

A note on accuracy: the Daml in this guide is written to be semantically correct and to teach the right patterns. The **cash leg** (tokenized deposits / DvP) should ultimately use Canton's official token standard allocation API rather than the hand-rolled `Deposit` template shown here — the hand-rolled version is included so you understand the authorization mechanics and have a working fallback if token-standard integration eats too much time.

---

## 2. What you're building (the spec)

**One-liner:** AtomicNet lets the subsidiaries of a multinational settle their intercompany invoices by *netting* — collapsing a tangled web of gross cross-currency payments into one net payment per entity — where (a) no subsidiary can see another's bilateral balances, and (b) the multi-currency net settlement executes atomically against tokenized bank deposits.

**The problem, concretely.** A corporate group with entities in the US, UK, Germany, and Singapore generates hundreds of intercompany invoices a month: the UK entity owes the US entity for shared services; the US entity owes Germany for components; Germany owes Singapore; Singapore owes the UK; and so on, in multiple currencies. Settled gross, each payment crosses a border (wire fees), crosses a currency (FX spread), and ties up working capital while in flight. Treasury teams know netting fixes this — you compute each entity's *net* position and move only the difference — but today it lives in closed treasury-management systems where (i) participants must trust a central operator with full visibility, (ii) the FX rate is fixed manually with a lag that creates settlement risk, and (iii) cross-border/cross-entity netting bumps into confidentiality and regulatory constraints.

**Why this is a Canton-shaped problem.** Netting requires two properties that are *mutually exclusive on every other chain*:

1. **Confidentiality between participants.** Subsidiary B must not see the A↔C invoice graph. On a transparent chain the entire netting graph is public. Canton gives you this for free via sub-transaction privacy.
2. **Atomic multi-currency settlement.** The net positions must all settle together — if one leg fails, none should settle (otherwise you've created exposure). And the legs are in different currencies (USD, EUR, GBP, SGD tokenized deposits). On Ethereum you can get atomic composition but not privacy; on privacy-focused L2s you lose cross-application atomic settlement. Canton's Global Synchronizer gives you atomic, privacy-preserving, cross-domain settlement.

**Scope for the hackathon MVP (what "done" means):**

- 3–5 subsidiary parties, 1 netting operator, 1 bank/cash registry, 1 regulator/observer.
- 2–3 currencies (e.g., USD, EUR, GBP) with tokenized deposits as the cash leg.
- Full lifecycle: raise invoices → open a netting cycle → lock invoices in → compute net positions → fix FX → settle atomically vs tokenized deposits → archive cycle.
- A privacy guarantee provable in code (Daml Script test) and in the UI (log in as a sibling, the data isn't there).
- A regulator "selective disclosure" read-only view that can reconstruct the full audit trail.
- An AI treasury agent that analyzes positions and *proposes* a netting cycle + optimal timing, with a human approving before settlement.
- A React frontend with a treasury dashboard, the "gross → net" visualization, the privacy proof, and the regulator view.
- A live, hosted demo (clearly labeled as a demo environment).

**Out of scope (say so explicitly in the deck — scoping is a maturity signal):** mainnet deployment, real bank integration, production KYC, real FX liquidity, more than ~5 entities, tax/transfer-pricing logic.

---

## 3. The winning thesis in one page

Judges score on **technical execution, originality, UX, and real-world applicability**. AtomicNet is engineered to top all four:

- **Technical execution.** A working Daml app that demonstrates the two hardest things on Canton — privacy and atomic multi-party settlement — with passing tests that *prove* both. This is materially harder (and more impressive) than yet another AMM.
- **Originality.** No Canton flagship app does multilateral netting; it was not one of the prior Ideathon's five themes; it is not in the saturated DEX/lending/wallet set. The AI treasury agent + regulator view are fresh, on-trend touches.
- **UX.** The "tangled web collapses to one arrow" moment is genuinely satisfying to watch and instantly communicates the value. The privacy proof ("log in as a sibling — it's just not there") is a memorable demo beat.
- **Real-world applicability.** Intercompany netting is a real, large, under-digitized treasury function. It maps directly onto Canton/Digital Asset's flagship narrative: tokenized deposits as the cash leg for atomic DvP/PvP, collateral and cash mobility, settlement.

**The single sentence to repeat in your pitch:** *"AtomicNet settles a multinational's intercompany payments net, across currencies, atomically — while keeping every entity's balances private from its siblings. That combination is impossible on Ethereum and only natural on Canton."*

---

## 4. System architecture overview

```
                    ┌─────────────────────────────────────────────────┐
                    │                   FRONTEND                       │
                    │   React + TypeScript + Vite (Quickstart scaffold)│
                    │   • Treasury dashboard (per-subsidiary login)    │
                    │   • Gross→Net visualization                      │
                    │   • Privacy proof view                           │
                    │   • Regulator selective-disclosure view          │
                    │   • Agent proposal review + human approve        │
                    └───────────────┬─────────────────────────────────┘
                                    │ HTTPS (JSON)
                    ┌───────────────▼─────────────────────────────────┐
                    │                   BACKEND                        │
                    │   Node/TS (or Spring Boot per Quickstart)        │
                    │   • Auth/session per party                       │
                    │   • Read side: query ledger (PQS / JSON API)     │
                    │   • Write side: command submission (Ledger API)  │
                    │   • Netting computation service                  │
                    │   • AI Treasury Agent service (calls Anthropic)  │
                    └───────────────┬─────────────────────────────────┘
                                    │ JSON Ledger API / gRPC
                    ┌───────────────▼─────────────────────────────────┐
                    │              CANTON LEDGER (LocalNet)            │
                    │                                                  │
                    │   Daml packages (DARs):                          │
                    │   • atomicnet-model   (invoices, cycles, net)    │
                    │   • atomicnet-cash    (tokenized deposits OR     │
                    │                        token-standard allocation)│
                    │                                                  │
                    │   Parties: Operator, Sub_US, Sub_UK, Sub_DE,     │
                    │            Bank, Regulator                       │
                    │   Global Synchronizer → atomic settlement        │
                    └──────────────────────────────────────────────────┘
```

**Three deployable artifacts:**

1. **Daml model** (`.dar` files) — the on-ledger logic. The core IP.
2. **Backend service** — bridges the UI to the ledger, runs the netting math and the AI agent. Use the Quickstart backend or a thin Node/TypeScript server talking to the JSON Ledger API.
3. **Frontend** — the React app from the Quickstart scaffold, themed and extended.

---

## 5. The Canton / Daml mental model you actually need

You do not need to master Daml to build this — Claude Code can write it — but you must understand these concepts to direct the build and to answer judges' questions.

**Parties.** A party is a known identity (a legal entity) on the ledger, identified by a PartyID. In AtomicNet: `Operator`, `Sub_US`, `Sub_UK`, `Sub_DE`, `Bank`, `Regulator`. Unlike an Ethereum address, a party is a named, permissioned participant.

**Templates and contracts.** A *template* is a class; a *contract* is an instance — an active record on the ledger. Templates declare fields (`with`) and rules (`where`).

**The three authorization/privacy keywords — this is the whole game:**

- `signatory` — the parties whose authority is required to create the contract, and who are bound by it. They see it.
- `observer` — parties who can *see* the contract but whose authority isn't required. They see it but can't (by default) act.
- `controller` (on a choice) — the party who can exercise that specific choice (action).

**The privacy rule, stated exactly:** a party learns about a contract **if and only if** it is a signatory, an observer, or a controller of an exercised choice on it (or learns it as a consequence of a transaction it's part of). **There is no global broadcast.** This is why a sibling subsidiary cannot see invoices it isn't party to — not because we hid them in the UI, but because the ledger never tells that party they exist. *Lean on this in the pitch: privacy is a protocol property, not an application feature.*

**Choices.** A *choice* is an action that can be taken on a contract (like a method). A consuming choice archives the contract and (usually) creates successor contracts. Choices carry the `controller` and a `do` block of ledger actions.

**Authority propagation (the key to atomic settlement).** When a controller exercises a choice on a contract, the actions *inside* that choice run with the combined authority of the **controllers of the choice** and the **signatories of the contract being exercised**. This is how one party can be delegated authority to act on another's behalf *within a single transaction* — the foundation of atomic multi-party settlement. (Worked through in section 10.)

**Atomic transactions.** Everything inside one command/transaction either all commits or all rolls back. A settlement that moves cash between five entities in three currencies is *one* transaction — if any transfer can't complete, the entire settlement reverts. No partial settlement, no exposure.

**Daml Script.** Daml's testing/automation tool. You write scripts that allocate parties, submit commands as those parties, and assert outcomes — including asserting that a party *cannot* see or do something. These scripts are both your tests and your demo-data seeders.

**Where Canton Coin / the token standard fits.** Real value transfer uses the token standard (holdings + allocations + transfer instructions) and Canton Coin / tokenized assets. For the cash leg you can either (a) integrate the token standard's allocation API (the "right" way, aligns with the sponsor narrative), or (b) model your own `Deposit` token for the MVP and swap later. Plan for (a), keep (b) as fallback.

---

## 6. Stage 0 — Environment setup & de-risking

**Goal:** a running local Canton ledger and proof you can do an atomic transfer. **Gate to proceed:** you can mint two different tokenized assets and execute an atomic two-asset swap between two parties via a Daml Script, by end of Day 3. If this fights you, descope to `daml sandbox` before touching application logic.

### 6.1 Prerequisites

- **Docker Desktop**, allocate **≥ 8 GB RAM** (LocalNet is heavy). `⚠ VERIFY` current minimums in the Quickstart README.
- **Daml SDK** — install via the official installer. `⚠ VERIFY` whether the current path is the classic `daml` SDK installer or the newer **DPM** (Digital Asset Package Manager). Ask Claude Code to detect and install the version the Quickstart expects.
- **Node.js** (LTS) + a package manager (pnpm/npm) for the frontend.
- **JDK** if you use the Spring Boot Quickstart backend (it ships a compatible JDK via the toolchain; `⚠ VERIFY`).
- An **Anthropic API key** for the AI agent (set as an environment variable; never hardcode).
- VS Code with the **Daml** extension for editor support.

### 6.2 Get the scaffold

Two viable starting points:

- **Preferred: CN Quickstart** (`digital-asset/cn-quickstart`). Gives you LocalNet (validators, super validator, wallet), a backend wired to the Ledger API, and a React/Vite frontend. Clone it, read its README, and run its bootstrap. This is the fastest path to a *full-stack* Canton app.
- **Fallback: bare Daml project** (`daml new atomicnet` + `daml sandbox --json-api-port 7575`). Lighter, simpler, no Canton Coin wallet, but enough to demo privacy + atomic settlement with your own cash token. Use this if LocalNet's resource demands or setup churn cost you more than ~1 day.

### 6.3 Stage-0 checklist

- [ ] Docker running with ≥8 GB; LocalNet (or sandbox) starts cleanly.
- [ ] You can list parties and allocate new ones (`Operator`, `Sub_US`, …).
- [ ] You can `daml build` a trivial package and upload the DAR.
- [ ] You can submit a command as a party via the JSON Ledger API (hit the OpenAPI docs at the JSON API port).
- [ ] **The big one:** a Daml Script that (1) issues asset X to Alice and asset Y to Bob, (2) executes a single atomic transaction swapping them, (3) asserts both holdings changed. This proves you understand authority propagation and atomic settlement — the core of AtomicNet.
- [ ] The Quickstart frontend loads in the browser and can read at least one contract from the ledger.

Only when every box is checked do you move on.

---

## 7. The party & data model

### 7.1 Parties

| Party | Role | Sees |
|---|---|---|
| `Operator` | Netting center / treasury operations. Opens cycles, computes net positions, triggers settlement. | All invoices (as observer), all cycles, all net positions. |
| `Sub_US`, `Sub_UK`, `Sub_DE` (3–5 of these) | Subsidiaries. Raise/accept invoices, approve their own net position, hold tokenized deposits. | Only their own invoices (as counterparty), only their own net position. **Not** siblings' data. |
| `Bank` | Cash registry. Issues tokenized deposits in each currency; co-authorizes allocations so settlement is atomic. | Deposits it issued; allocations; settlement instructions it's party to. |
| `Regulator` | Auditor / selective-disclosure observer. | A read-only, complete view of cycles and settlements via explicit observer rights (selective disclosure). |

### 7.2 Core entities (logical)

- **Invoice** — a bilateral obligation: `issuer` is owed `amount` in `currency` by `payer`, due `dueDate`. Private to {issuer, payer, operator}.
- **Netting Cycle** — a time-boxed round: which invoices are included, the FX rates used, the status (Open → Locked → Settled).
- **Net Position** — per subsidiary, the net amount they pay or receive (in the settlement currency, after FX), derived from the included invoices. Private to {that subsidiary, operator}.
- **Tokenized Deposit / Holding** — cash on ledger, per owner per currency (or token-standard holdings).
- **Allocation** — an earmark of a deposit, co-signed by owner and bank, reserving funds for a specific settlement so it can execute atomically.
- **Settlement Instruction / Result** — the atomic execution record; observable by the regulator.

---

## 8. The Daml contract layer, template by template

> The code below is illustrative and semantically correct Daml, written to teach the right patterns. Treat it as the starting design that Claude Code will refine against the installed SDK. For the cash leg, prefer the token standard allocation API in production (section 10.4).

### 8.1 Shared types

```daml
module AtomicNet.Types where

-- Settlement currency for the cycle; invoices may be in any currency.
type CurrencyCode = Text   -- "USD", "EUR", "GBP", "SGD"

data FxRate = FxRate with
    base : CurrencyCode      -- e.g. "EUR"
    quote : CurrencyCode     -- e.g. "USD"
    rate : Decimal           -- 1 base = rate quote
  deriving (Eq, Show)

data CycleStatus = Open | Locked | Settled | Cancelled
  deriving (Eq, Show)
```

### 8.2 IntercompanyInvoice

The privacy boundary lives here. Only the two counterparties and the operator are parties to it.

```daml
module AtomicNet.Invoice where

import AtomicNet.Types

template IntercompanyInvoice
  with
    operator : Party
    issuer   : Party          -- the entity OWED money (receivable)
    payer    : Party          -- the entity that OWES money (payable)
    amount   : Decimal
    currency : CurrencyCode
    invoiceId : Text
    dueDate  : Date
    included : Bool           -- has this been locked into a cycle?
  where
    -- Both counterparties acknowledge the obligation; operator observes for netting.
    signatory issuer, payer
    observer  operator
    ensure amount > 0.0

    -- Operator locks the invoice into a netting cycle (consuming).
    choice IncludeInCycle : ContractId IntercompanyInvoice
      with cycleId : Text
      controller operator
      do create this with included = True
```

**Creating an invoice** uses a propose/accept pattern so both counterparties sign without one forging the other's signature:

```daml
template InvoiceProposal
  with
    operator : Party
    issuer   : Party
    payer    : Party
    amount   : Decimal
    currency : CurrencyCode
    invoiceId : Text
    dueDate  : Date
  where
    signatory issuer          -- issuer proposes
    observer  payer, operator

    choice AcceptInvoice : ContractId IntercompanyInvoice
      controller payer        -- payer accepts → both now signatories
      do create IntercompanyInvoice with included = False, ..

    choice RejectInvoice : ()
      controller payer
      do return ()
```

> Privacy note: `InvoiceProposal` and `IntercompanyInvoice` name only `issuer`, `payer`, `operator`. A sibling subsidiary is on neither the signatory nor observer set, so the ledger never reveals these contracts to it. That is the privacy guarantee — enforced by the protocol, not the UI.

### 8.3 NettingCycle

```daml
module AtomicNet.Cycle where

import AtomicNet.Types

template NettingCycle
  with
    operator   : Party
    regulator  : Party
    participants : [Party]              -- the subsidiaries in this cycle
    settlementCurrency : CurrencyCode   -- e.g. "USD"
    fxRates    : [FxRate]
    cycleId    : Text
    status     : CycleStatus
  where
    signatory operator
    observer  regulator                 -- selective disclosure to the regulator
    -- NOTE: participants are intentionally NOT observers of the whole cycle,
    -- so they cannot enumerate each other. They see only their own NetPosition.

    choice LockCycle : ContractId NettingCycle
      controller operator
      do create this with status = Locked

    choice MarkSettled : ContractId NettingCycle
      controller operator
      do create this with status = Settled
```

### 8.4 NetPosition

Per-subsidiary, private to that subsidiary and the operator (and the regulator, for audit).

```daml
module AtomicNet.NetPosition where

import AtomicNet.Types

template NetPosition
  with
    operator    : Party
    subsidiary  : Party
    regulator   : Party
    cycleId     : Text
    settlementCurrency : CurrencyCode
    netAmount   : Decimal        -- positive = receives, negative = pays
  where
    signatory operator
    observer  subsidiary, regulator
    -- Only THIS subsidiary + operator + regulator see it. Siblings do not.

    -- The subsidiary approves its computed net position before settlement.
    choice ApproveNetPosition : ContractId ApprovedNetPosition
      controller subsidiary
      do create ApprovedNetPosition with ..

template ApprovedNetPosition
  with
    operator    : Party
    subsidiary  : Party
    regulator   : Party
    cycleId     : Text
    settlementCurrency : CurrencyCode
    netAmount   : Decimal
  where
    signatory operator, subsidiary    -- now BOTH have signed → operator gets delegated settlement authority
    observer  regulator
```

> The jump from `NetPosition` (signatory operator) to `ApprovedNetPosition` (signatory operator **and** subsidiary) is the delegation step. Because the subsidiary is now a signatory, the operator can — within a single settlement transaction — exercise actions that require the subsidiary's authority (moving its cash). See section 10.

### 8.5 Tokenized cash (MVP fallback) — Deposit

```daml
module AtomicNet.Cash where

import AtomicNet.Types

template Deposit
  with
    bank     : Party
    owner    : Party
    currency : CurrencyCode
    amount   : Decimal
  where
    signatory bank          -- bank issues/guarantees authenticity
    observer  owner
    ensure amount >= 0.0

-- An allocation reserves funds for a settlement, co-signed by owner AND bank.
-- This is what makes settlement atomic without re-authorizing the bank at settle time.
template DepositAllocation
  with
    bank     : Party
    owner    : Party
    operator : Party
    currency : CurrencyCode
    amount   : Decimal
    cycleId  : Text
  where
    signatory bank, owner   -- both co-sign the earmark
    observer  operator

    -- Operator disburses the reserved funds to a recipient during settlement.
    choice Disburse : ContractId Deposit
      with recipient : Party
      controller operator
      do
        -- authority here = {operator} ∪ {bank, owner} (signatories of this contract)
        -- enough to create a new Deposit signed by `bank` for the recipient.
        create Deposit with bank, owner = recipient, currency, amount
```

> This `DepositAllocation` mirrors how the real token standard "allocation" works: the registry (bank) and the owner pre-authorize a specific amount for a specific settlement, so the operator can move it atomically at settle time. **In production, replace `Deposit`/`DepositAllocation` with the token-standard holdings + allocation APIs** (`⚠ VERIFY` exact templates/choices) — same shape, real assets, and it earns you the "uses Canton's token standard" credibility with judges.

### 8.6 Settlement instruction

```daml
module AtomicNet.Settlement where

import AtomicNet.Cash
import AtomicNet.NetPosition

template SettlementBatch
  with
    operator  : Party
    regulator : Party
    cycleId   : Text
    payerAllocations : [ContractId DepositAllocation]   -- funds reserved by net payers
    payouts   : [(Party, Decimal)]                      -- net receivers and amounts
  where
    signatory operator
    observer  regulator

    -- One atomic transaction: consume all allocations, pay all receivers.
    choice ExecuteSettlement : ()
      controller operator
      do
        -- Disburse each payer's reserved funds to the appropriate receiver.
        -- All within THIS transaction → atomic. If any step fails, all revert.
        forA_ payerAllocations \allocCid -> do
          -- In the real design you'd match allocation → recipient precisely;
          -- shown simplified. Each Disburse moves reserved cash to a receiver.
          pure ()
        return ()
```

> Section 10 explains the precise atomic mechanics and the production token-standard path; the snippet above is the skeleton Claude Code will flesh out into the exact disbursement logic (matching each payer's reserved amount to each receiver per the netting result).

### 8.7 Regulator view (selective disclosure)

You don't need a separate "view" template — selective disclosure is achieved by adding `regulator` as an `observer` on the cycle, net positions, and settlement records (as above). The regulator therefore sees a complete, read-only audit trail **without** being able to act, and **without** subsidiaries having to expose data to each other. In the UI, the regulator logs in and queries these contracts. That *is* selective disclosure — show it explicitly in the demo.

---

## 9. The netting algorithm

The math is deliberately simple — keep it in the backend (TypeScript) or compute it in Daml Script; both are fine. The interesting engineering is the privacy + atomicity, not the arithmetic.

**Inputs:** the set of invoices locked into a cycle, each `(issuer, payer, amount, currency)`, plus the FX rates to the settlement currency.

**Steps:**

1. **Convert** every invoice to the settlement currency using the cycle's fixed FX rates.
2. **Compute each entity's net position:** `net(X) = Σ(amounts where X is issuer/owed) − Σ(amounts where X is payer/owes)`, in settlement currency.
   - `net(X) > 0` → X is a **net receiver**.
   - `net(X) < 0` → X is a **net payer**.
3. **Conservation check:** `Σ net(X) over all X == 0` (sum of receivables equals sum of payables). If not, reject the cycle — this is a great invariant to assert in tests.
4. **Build the settlement plan:** net payers reserve `|net(X)|` via allocations; net receivers are paid `net(X)`. (You can do a simple "payers fund a pot, receivers drain it" or a minimal set of payer→receiver transfers; the simple version is fine and clearer to demo.)

**Worth showing in the pitch:** the *reduction ratio* — e.g., "20 gross invoices across 4 currencies → 3 net payments." That number is your headline metric.

---

## 10. The atomic settlement design (the hard, important part)

This is where you win or lose the technical-execution score. Get the authorization model right and you have an institutional-grade demo; get it wrong and settlement either isn't atomic or isn't authorized.

### 10.1 The authorization problem

Moving Subsidiary US's cash requires US's authority. Moving cash issued by the Bank requires the Bank's authority (so tokens stay authentic). But the *operator* is the one triggering settlement. How does one operator-controlled transaction wield the authority of US, UK, DE, **and** the Bank simultaneously?

### 10.2 The solution — pre-authorization via co-signed allocations

Authority is captured **before** settlement, at allocation time:

1. Each subsidiary **approves its net position** → `ApprovedNetPosition` is now signed by both operator and that subsidiary.
2. Each **net payer** creates a `DepositAllocation` reserving `|net|` — co-signed by **payer and Bank**.
3. At settlement, the operator exercises `ExecuteSettlement`, which **consumes the allocations**. Because each allocation is signed by {Bank, payer}, exercising a choice on it makes *their* authority available inside the transaction — enough to mint the receiver's new Deposit (signed by Bank) and retire the payer's reserved funds.
4. All disbursements happen inside the **one** `ExecuteSettlement` transaction → **atomic**. If any single payer's allocation is missing or insufficient, the whole transaction fails and nothing settles.

This is exactly the institutional pattern: reserve/earmark first (with all parties' consent), then settle atomically. It also maps cleanly onto the real token standard.

### 10.3 Why it's atomic and private at once

- **Atomic:** one transaction, all-or-nothing — Daml/Canton guarantees this.
- **Private:** each `DepositAllocation` names only {Bank, payer, operator}; siblings aren't parties, so they never see who reserved what. The regulator sees the settlement record because it's an explicit observer — selective disclosure, not broadcast.

### 10.4 Production path — the token standard

For maximum credibility, replace the hand-rolled `Deposit`/`DepositAllocation` with Canton's token standard:

- **Holdings** represent the tokenized deposits.
- **Allocation / allocation instruction / allocation request** APIs reserve holdings for a settlement (the standard's built-in equivalent of `DepositAllocation`).
- **Transfer instruction** executes the moves; the standard supports **free-of-payment** transfers and **atomic DvP**.

`⚠ VERIFY` the exact template and choice names against the current token-standard docs/SDK — ask Claude Code to read the installed package and wire your `SettlementBatch.ExecuteSettlement` to consume standard allocations. Keep the hand-rolled version on a branch as a guaranteed-working fallback for the demo.

### 10.5 The one invariant to test

`Σ net(X) == 0` **and** "every payer's reserved amount is fully consumed and every receiver is paid exactly its net" — assert both in a Daml Script. If settlement ever leaves dangling cash or unpaid receivers, the transaction must fail. Demonstrating this invariant under test is gold for the technical-execution score.

---

## 11. Backend layer

Use the Quickstart backend (Spring Boot) or a thin Node/TypeScript service. Responsibilities:

- **Auth/session:** map a logged-in user to a party (`Sub_US`, `Operator`, `Regulator`, …). For the demo, a simple party switcher is fine; note in the README that production would use proper auth + the wallet/dApp SDK.
- **Read side:** query the ledger for the contracts the current party is allowed to see. Use **PQS** (Participant Query Store) if on the Quickstart, or the **JSON Ledger API** query endpoints otherwise. *Crucially, do the reads as the logged-in party so the ledger's privacy does the filtering for you — never "filter in the app."* This is both correct and a great thing to point out to judges.
- **Write side:** submit commands (create invoice proposal, accept, open/lock cycle, approve net position, create allocation, execute settlement) via the Ledger API.
- **Netting service:** compute net positions from the included invoices (section 9), produce the settlement plan.
- **Agent service:** see section 13.

**Design rule:** the backend holds *no* privacy logic. Privacy is enforced by the ledger; the backend just submits and queries as parties. If a judge asks "how do you know Sub_UK can't see Sub_DE's data?", the answer is "the ledger never sends it to UK — watch," not "our API checks a permission."

---

## 12. Frontend layer

Start from the Quickstart's React/TypeScript/Vite app; theme it for an institutional treasury feel (clean, dense, trustworthy — see the frontend-design notes below). Screens:

1. **Login / party switcher** — pick which entity you're acting as (US treasury, UK treasury, Operator, Bank, Regulator). The switcher is what makes the privacy proof visceral.
2. **Treasury dashboard (subsidiary view)** — your outstanding intercompany invoices (only yours), your current net position in the open cycle, your tokenized-deposit balances per currency, and an "Approve my net position" action.
3. **Operator console** — open a cycle, see all included invoices, the computed net positions, FX rates, the reduction metric (20→3), and the "Execute settlement" action (enabled only once all participants have approved).
4. **The Gross→Net visualization** — the centerpiece. Render the gross invoice graph (nodes = entities, edges = gross flows, possibly color-coded by currency), then animate the collapse into the net settlement (a handful of net arrows). This single view sells the project. Use a graph/force layout (e.g., D3 or a React graph lib).
5. **Privacy proof view** — side-by-side or a toggle: "As Operator I see N invoices; as Sub_UK I see only my K invoices; the A↔C edge is absent." Pull the data live from the ledger as each party so it's real, not mocked.
6. **Regulator view** — read-only, full audit trail of the cycle and the atomic settlement; emphasize "selective disclosure: the regulator sees everything relevant, the siblings still don't see each other."
7. **Agent panel** — the AI treasury agent's recommendation (which invoices to net now, suggested timing/FX considerations, expected reduction), with a prominent **human "Approve & propose cycle"** button. Make the human-in-the-loop explicit and visible.

**Design guidance:** institutional fintech, not crypto-neon. Restrained palette, strong typography, dense but legible tables, clear status chips (Open/Locked/Settled). Before building UI, have Claude Code read `/mnt/skills/public/frontend-design/SKILL.md` for tokenized design choices so it doesn't ship a templated default.

---

## 13. The AI treasury agent (human-in-the-loop)

This is the "agentic commerce / agentic treasury" hook that puts you in Track 3 as well as Track 2. **The entire safety story is: the agent proposes; a human disposes; the contract constrains.**

**What the agent does:**

- Reads the open invoices and balances *for the operator/treasury* (only data the operator is entitled to).
- Analyzes: which invoices to include in the next cycle, the optimal timing (e.g., net before a cluster of due dates), the FX exposure, and the expected reduction (gross count/notional → net).
- **Drafts** a netting-cycle proposal (a structured object: participants, included invoice IDs, settlement currency, suggested FX rates) and explains its reasoning in plain English.

**What the agent must NOT do:**

- It must **never** unilaterally execute settlement. Settlement is gated behind a human approval in the UI **and** behind on-ledger authorization (subsidiaries must `ApproveNetPosition`; the operator's human must click execute). Even if the agent "decides," the ledger won't settle without the co-signatures.

**Implementation:** a backend service that calls the Anthropic API with a structured prompt: feed it the (operator-visible) positions as JSON, ask for a JSON proposal + a short rationale. Parse and render. Add hard guardrails in code: the agent's output is a *suggestion object* that can only ever populate the proposal form — there is no code path from agent output directly to `ExecuteSettlement`.

**Why judges love this framing:** it's exactly the responsible-agentic-finance story the sponsor wants — autonomy for analysis and drafting, cryptographic + human control for value movement. Say this out loud in the video: *"The agent can propose, but it cannot move a dollar without the subsidiaries' on-ledger consent and a human's approval."*

---

## 14. Testing strategy — proving privacy and atomicity

Your tests are a *headline submission artifact*, not an afterthought. Write Daml Scripts that demonstrate the guarantees a judge cares about. Put a section in the README pointing to each test and what it proves.

**Test suite (Daml Script):**

1. **Happy path lifecycle.** Allocate parties; create invoices via propose/accept; open a cycle; include invoices; compute and create net positions; subsidiaries approve; payers allocate; execute settlement; assert final deposit balances equal opening balances ± net amounts. ✅ "It works end to end."
2. **Privacy — sibling cannot see.** As `Sub_UK`, query for an invoice between `Sub_US` and `Sub_DE`; assert it is **not** visible / not fetchable. As `Sub_UK`, attempt to fetch `Sub_DE`'s `NetPosition`; assert failure. ✅ "Privacy is real, by the protocol."
3. **Atomicity — all-or-nothing.** Set up a settlement where one payer's allocation is insufficient/missing; execute; assert the **entire** settlement fails and **no** balances changed. ✅ "No partial settlement, no exposure."
4. **Conservation invariant.** Assert `Σ net == 0` for the cycle, and that a tampered cycle (sum ≠ 0) is rejected. ✅ "The math is sound."
5. **Authorization — no forging.** Assert that `Sub_US` cannot create an invoice that binds `Sub_DE` without `Sub_DE`'s acceptance (propose/accept enforces this). Assert a subsidiary cannot trigger settlement. ✅ "Authority is enforced."
6. **Regulator selective disclosure.** As `Regulator`, assert full visibility of the cycle and settlement; as a subsidiary, assert you still can't see siblings. ✅ "Selective disclosure works without broadcast."

Run these in CI (GitHub Actions) if time permits — a green CI badge on the repo is a cheap, strong signal of technical execution.

---

## 15. The 4-week build plan, day by day

Calibrated for a solo builder moving fast with Claude Code. Adjust to your pace; the **gates** matter more than the exact days. (Hackathon runs ~Jun 15 – Jul 13; the in-portal "share progress" milestone is around Jun 21–22, so have something demonstrable by end of Week 1.)

### Week 1 — Foundations & proof of the hard part (Jun 15–21)
- **Day 1:** Read this guide + the strategy doc. Install Docker, Daml SDK/DPM, Node, VS Code Daml ext. Clone CN Quickstart, read its README.
- **Day 2:** Bring up LocalNet (or fall back to `daml sandbox`). Allocate parties. Get the Quickstart frontend reading the ledger.
- **Day 3 (GATE):** Daml Script that does an **atomic two-asset swap** between two parties, with a passing privacy assertion. *Do not proceed until green.*
- **Day 4–5:** Implement `Types`, `Invoice` (+ propose/accept), `Cycle`, `NetPosition`. Write the happy-path Script (create invoices, open cycle).
- **Day 6–7:** Implement `Cash` (`Deposit` + `DepositAllocation`) and a first `SettlementBatch.ExecuteSettlement`. Get a 3-party, single-currency netting to settle atomically in a Script. **End-of-week deliverable for the portal:** a short Loom/GIF of an atomic net settlement in the terminal/Script. Post progress in Discord per the milestone.

### Week 2 — Full model, multi-currency, tests (Jun 22–28)
- **Day 8–9:** Add multi-currency + FX fixing; the netting service (TypeScript) computing net positions across currencies. Add the conservation invariant.
- **Day 10 (GATE):** Multi-currency atomic settlement working in a Script across 4–5 parties, 2–3 currencies. If not green, **descope to single currency** and keep moving (note it as future work).
- **Day 11–12:** Write the full Daml Script test suite (section 14): privacy, atomicity, authorization, regulator, conservation. Aim for all green.
- **Day 13–14:** Wire the backend write/read paths to the real templates (create proposal, accept, open/lock cycle, approve, allocate, settle). Confirm reads are done *as the party* so privacy is automatic.

### Week 3 — Frontend & the AI agent (Jun 29 – Jul 5)
- **Day 15–16:** Build the party switcher + subsidiary dashboard (your invoices, your net position, your balances) on the Quickstart React app. Have Claude Code read the frontend-design skill first.
- **Day 17–18:** Build the **Gross→Net visualization** (the centerpiece) and the **privacy proof** view (live data as each party).
- **Day 19:** Build the **operator console** (open/lock cycle, see net positions, reduction metric, execute settlement) and the **regulator view**.
- **Day 20–21:** Build the **AI treasury agent** backend service + the agent panel UI, with the explicit human-approval gate. Lock down the "no path from agent to settlement" guardrail.

### Week 4 — Polish, deploy, submit (Jul 6–13)
- **Day 22–23:** Seed a compelling demo dataset (5 entities, ~20 invoices, 3 currencies, a satisfying reduction like 20→3). Polish UI states, empty/loading/error states, status chips. Tighten copy.
- **Day 24:** Deploy a **live, hosted demo** (host the frontend; run a persistent backend + LocalNet/ScratchNet, clearly labeled "demo environment"). Verify it works from a fresh browser.
- **Day 25:** Write the **README** (architecture diagram, the "only on Canton" argument, how to run, links to each test and what it proves) and the **deck**.
- **Day 26:** Record and edit the **3-minute video** (section 16). Re-shoot until the gross→net moment and the privacy proof land crisply.
- **Day 27:** Final pass — repo hygiene (no secrets, clean history, license), CI badge if you have it, double-check every submission requirement.
- **Day 28 (buffer):** Submit early. Keep a day of slack for portal issues.

---

## 16. The 3-minute demo script

Three minutes is brutally short — script and rehearse it. Suggested beats:

- **0:00–0:30 — The problem (fast, concrete).** "A multinational's subsidiaries send each other hundreds of intercompany invoices a month, in different currencies. Settled gross, that's a fortune in FX spread, wire fees, and trapped cash. Netting fixes it — but today it means trusting one operator with everyone's books, and it can't settle atomically across currencies. Here's AtomicNet on Canton."
- **0:30–1:30 — The core demo.** Operator console: show ~20 gross invoices across 3 currencies. Trigger the AI agent → it proposes a netting cycle and explains why. Human approves. Subsidiaries approve their net positions. Click **Execute settlement** → the **gross→net animation** collapses the web into 3 net payments → "settled atomically against tokenized deposits in one transaction."
- **1:30–2:15 — The two superpowers.** Privacy proof: switch to **Sub_UK** → "I only see my own invoices; the US↔Germany flow simply isn't here — the ledger never sent it to me." Then switch to **Regulator** → "selective disclosure: the auditor sees the full trail, the siblings still don't see each other." Then state the atomicity guarantee and (optionally) flash the passing atomicity test.
- **2:15–2:45 — Why only Canton.** "Public chains expose the whole netting graph. Privacy chains can't settle atomically across currencies. Canton does both at once — sub-transaction privacy and atomic multi-party settlement — which is exactly what institutional netting needs."
- **2:45–3:00 — Close.** "AtomicNet: private, atomic, cross-currency intercompany settlement, with an AI treasury agent that proposes but never settles without on-ledger consent. Built on Canton. Thank you."

**Production tips:** record at 1080p+, clean audio, large UI font, cursor highlights. Pre-seed data so nothing loads slowly on camera. Cut every dead second. The gross→net animation and the live party-switch privacy proof are your two money shots — give them room.

---

## 17. Submission checklist

- [ ] **Public repository** — Daml model, backend, frontend, **tests**, architecture diagram, thorough README, open-source license, clean history, **no secrets/keys committed**.
- [ ] **README must include:** the problem, the "only on Canton" argument, an architecture diagram, run instructions, and a "What our tests prove" section linking each Daml Script to the guarantee it demonstrates (privacy, atomicity, authorization, conservation, selective disclosure).
- [ ] **Presentation deck** — problem → solution → why Canton (privacy + atomicity, with the Ethereum contrast) → architecture → demo screenshots → roadmap → "what's real vs. simulated." Lead with the problem and the one-sentence thesis.
- [ ] **3-minute video** with live demo — gross→net, privacy proof, regulator view, agent + human gate, the "only on Canton" line.
- [ ] **Live product link** — hosted frontend + working backend (demo environment, clearly labeled). Test from a fresh browser/incognito.
- [ ] **Track fit stated** — note that it spans TradeFi/RWA (netting, tokenized deposits) and Payments/Agentic (treasury agent).
- [ ] **Honesty about scope** — explicitly list what's MVP vs. production (no mainnet, simulated bank/FX, ≤5 entities). Judges reward maturity; over-claiming reads as a red flag.

---

## 18. Risk register & fallback plans

| Risk | Likelihood | Mitigation / fallback |
|---|---|---|
| LocalNet won't run / eats RAM | Med | Fall back to `daml sandbox --json-api-port 7575`. You lose the Canton Coin wallet but keep privacy + atomic settlement with your own `Deposit` token. Decide by end of Day 2. |
| Token-standard allocation API integration stalls | Med | Ship the hand-rolled `Deposit`/`DepositAllocation` (section 8.5). Keep token-standard on a branch. Same demo, slightly less "uses the standard" credibility — still wins on privacy+atomicity. |
| Multi-currency atomic settlement is fiddly | Med | Descope to single currency for the MVP; show multi-currency as a Script-only proof or future work. Privacy + atomic netting in one currency is still a strong submission. |
| AI agent scope creep | Med | Keep the agent a thin "positions in → JSON proposal + rationale out" service. The guardrail (no path to settlement) is the point, not agent sophistication. Cut to a static "smart suggestion" if time-pressed. |
| Frontend eats the schedule | High | The Quickstart scaffold + Claude Code should carry most of it. Prioritize the two money shots (gross→net, privacy proof); everything else can be plainer. |
| "Live product" expectation on mainnet | Low | A hosted LocalNet/ScratchNet demo, clearly labeled, satisfies the requirement for a 4-week solo build. State this plainly. |
| Prize structure differs from assumption | Low | AtomicNet wins under either per-track or shared-pool structures. If Track 3 is separately judged and you want a hedge, the agent angle already plants a flag there. |
| Daml correctness bugs (authority/privacy) | Med | Your test suite (section 14) is the safety net. Write the privacy and atomicity tests *early* (Week 2), not at the end. |

---

## 19. Resources to verify against current docs

Treat these as where to confirm exact, current APIs/paths (names evolve):

- **Daml docs** — language reference, Daml Script, templates/choices, the JSON Ledger API. (`docs.daml.com` / Digital Asset's platform docs.)
- **CN Quickstart** — `github.com/digital-asset/cn-quickstart` (LocalNet bootstrap, backend/frontend structure, current RAM/SDK requirements).
- **Token standard** — holdings, allocation, transfer-instruction APIs; free-of-payment and atomic DvP. (`⚠ VERIFY` exact template/choice names.)
- **Splice / Wallet SDK / dApp SDK** — wallet integration and the dApp API, if you wire real wallet auth.
- **Canton Network developer resources** — the Daml-specialized AI code model and current "getting started" path.
- **Anthropic API docs** — for the treasury agent service (auth, messages endpoint, structured output prompting).
- **Hackathon portal + Discord** — confirm the **exact prize split**, judging weightings, submission portal mechanics, and any office-hours/workshop recordings (the "Canton Tech Deep Dive" session is worth watching).

When in doubt, have Claude Code read the *installed* package source to get exact signatures rather than relying on any remembered API.

---

## Appendix A — repo layout

```
atomicnet/
├── README.md                      # problem, "only on Canton", architecture, run, "what tests prove"
├── LICENSE
├── daml/
│   ├── daml.yaml
│   └── AtomicNet/
│       ├── Types.daml
│       ├── Invoice.daml
│       ├── Cycle.daml
│       ├── NetPosition.daml
│       ├── Cash.daml             # Deposit + DepositAllocation (MVP) — swap for token standard
│       └── Settlement.daml
├── daml-tests/
│   └── AtomicNet/Test/
│       ├── Lifecycle.daml        # happy path
│       ├── Privacy.daml          # sibling-cannot-see
│       ├── Atomicity.daml        # all-or-nothing
│       ├── Authorization.daml    # no forging, no unilateral settle
│       └── Regulator.daml        # selective disclosure
├── backend/
│   ├── src/
│   │   ├── ledger/               # command submission + queries (as party)
│   │   ├── netting/              # net-position computation + plan
│   │   └── agent/                # Anthropic-powered treasury agent (proposal only)
│   └── ...
├── frontend/                     # Quickstart React/Vite app, themed
│   └── src/
│       ├── components/
│       │   ├── PartySwitcher.tsx
│       │   ├── SubsidiaryDashboard.tsx
│       │   ├── OperatorConsole.tsx
│       │   ├── GrossToNetGraph.tsx   # the centerpiece
│       │   ├── PrivacyProof.tsx
│       │   ├── RegulatorView.tsx
│       │   └── AgentPanel.tsx
│       └── ...
├── docs/
│   ├── architecture.png
│   └── deck.pdf
└── .github/workflows/ci.yml      # run daml test on push (optional but strong)
```

## Appendix B — glossary

- **Daml** — the smart-contract language for Canton; encodes rights/obligations with `signatory`/`observer`/`controller`.
- **Party / PartyID** — a known identity on the ledger (a legal entity).
- **Template / Contract** — class / instance of on-ledger data + rules.
- **Choice** — an action on a contract; carries a controller and a body.
- **Signatory / Observer / Controller** — must-authorize-and-sees / sees-only / can-exercise-this-choice.
- **Authority propagation** — inside a choice, authority = controllers ∪ signatories of the exercised contract; the basis for delegated, atomic multi-party actions.
- **Sub-transaction privacy** — parties learn only the parts of a transaction they're party to; no global broadcast.
- **Atomic settlement** — all legs of a transaction commit or none do.
- **Allocation** — a co-signed earmark reserving funds for a specific settlement, enabling atomic execution.
- **DvP / PvP** — Delivery-versus-Payment / Payment-versus-Payment: asset and cash legs settle together atomically.
- **Token standard** — Canton's standard for holdings/transfers/allocations (the "right" cash leg).
- **Global Synchronizer** — Canton's mechanism for ordering and atomic cross-domain settlement without exposing data.
- **CN Quickstart** — Digital Asset's full-stack scaffold (LocalNet + backend + React frontend).
- **LocalNet / sandbox** — local Canton environments for development.
- **PQS (Participant Query Store)** — read-optimized query layer in the Quickstart backend.

---

*Build the hard part first (atomic settlement + privacy), prove it with tests, then make it beautiful and tell the story. That sequence is how AtomicNet wins.*
