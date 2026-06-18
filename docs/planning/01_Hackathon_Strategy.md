# Build on Canton Hackathon: How to Win 1st Place — Strategy + 5 Project Ideas, and the One to Build

> Research & strategy brief for the **Build on Canton Hackathon** (Encode Club × Canton Foundation), 15 Jun – 13 Jul 2026, online, 4 weeks.
> Theme: *Build institutional-grade financial applications on Canton Network.*

---

## TL;DR

- **Build "AtomicNet" — a privacy-preserving multilateral intercompany netting + cross-currency settlement engine**, with an AI treasury agent. It hits Canton's exact flagship narrative (atomic settlement + sub-transaction privacy + tokenized deposits), spans two of the three tracks, is genuinely under-built on Canton, and demos a visually dramatic "many gross payments collapse into one private net settlement" moment — the single strongest path to a top-3 finish in the $7,000 pool.
- **Avoid the saturated lanes**: DEXes/AMMs, overcollateralized lending, basic wallets, prediction markets, and plain "tokenize a treasury" RWA demos are already shipped on Canton (Cantex, ACME, Alpend, Console/Loop/Bron, Auric) and were the explicit themes of the prior Canton Construct Ideathon — they read as derivative to Canton Foundation judges.
- **Win on the rubric** (technical execution, originality, UX, real-world applicability) by shipping a *working* Daml app on LocalNet with a real React frontend, an AI agent that initiates but never unilaterally settles (human-in-the-loop), a regulator "selective disclosure" view, and a crisp 3-minute video that shows privacy and atomicity that Ethereum demonstrably cannot replicate.

---

## The hackathon and what judges reward

The hackathon is run by Encode Club and judged by the Canton Foundation, running June 15 – July 13, 2026 (a 4-week program), fully online. Three tracks:

1. **Private DeFi & Capital Markets** — confidential lending, private credit/invoice financing, OTC trading workflows, private deal execution, capital-markets tools where pricing/counterparties/positions shouldn't be public.
2. **TradeFi, RWA & Tokenized Assets** — invoice/supply-chain financing, inter-company cross-currency netting, tokenized deposits, RWA-based products, enterprise workflows using tokenized real-world assets.
3. **Payments, Neobanking & Agentic Commerce** — payments infrastructure, wallets/neobank tools, treasury/business banking workflows, agentic commerce with privacy, AI agents initiating/coordinating commercial actions safely.

**Judging criteria (four):** technical execution (does it work; clean, well-structured, documented code), originality/creativity (fresh approach or new use case), UX/design (could a real user use this; clear/functional interface), real-world applicability (solves a genuine problem; someone would actually want to use it).

**Submission requirements:** public repository, presentation deck, 3-minute video pitch with demo, link to a live product.

**Note on prizes.** The exact dollar breakdown of the $7,000 pool is not exposed on the (JavaScript-rendered) Encode programme page. Secondary aggregation indicates a **shared top-3 structure** — the top 3 teams *across all tracks* share the prize pool — rather than strictly separate per-track prizes. **Treat this as directional and confirm in the hackathon Discord / registration portal.** Strategic implication: you want a project that is both best-in-its-track *and* aligned with Canton's flagship narrative, because an overall top-3 placement (not just track-best) is what pays.

---

## What Canton is, technically (and why it's not Ethereum)

Canton is a public, permissioned Layer-1 built on Daml (Digital Asset Modeling Language). Its defining properties — which competitors on Ethereum/Solana cannot easily replicate:

- **Sub-transaction privacy by default.** Only the signatories, observers, and choice controllers of a Daml contract see it; validators on the Global Synchronizer handle encrypted blobs, timestamps, and ordering metadata — never raw transaction data. A lender doesn't see the borrower's other positions; a clearinghouse can validate a trade without seeing the price.
- **Atomic multi-party composition across applications.** The Global Synchronizer uses a two-phase commit to settle multi-step deals across independent apps/subnets in one all-or-nothing transaction — without a shared global ledger that exposes everyone's data. On Ethereum you get atomic composability only by sacrificing privacy; privacy L2s sacrifice the atomicity.
- **Native identity & permissioning.** Every party is a known legal entity identified by a Daml PartyID; the token standard bakes KYC/regulator roles and DvP into the protocol, unlike ERC-20, which has no native identity.
- **Authorization-by-design.** Daml encodes rights/obligations as `signatory` / `observer` / `controller` keywords; you cannot accidentally expose data, and contracts compose atomically.

---

## Developer tooling a solo builder + Claude Code can actually use

- **Daml SDK + Canton Sandbox** for local dev (`daml new`, `daml build`, `daml sandbox`).
- **CN Quickstart (`digital-asset/cn-quickstart`)** — the single most important scaffold: Docker Compose LocalNet with validator nodes, a super validator, Canton Coin wallet, a backend (PQS for reads, gRPC Ledger API for writes), and a React/TypeScript/Vite frontend. Ships a reference app with a multi-party model (Provider, User, Amulet/Canton Coin, DSO). Requires Docker Desktop with ≥8 GB RAM.
- **JSON Ledger API** (`canton sandbox --json-api-port 7575`, OpenAPI at `/docs/openapi`) — lets Claude Code generate typed clients and drive the ledger over HTTP/JSON.
- **Splice + Wallet SDK + dApp SDK**, the **token standard** (token metadata, holdings, transfer instruction, allocation, allocation request, allocation instruction; supports free-of-payment transfers and atomic DvP), and a Daml-specialized AI code model referenced on Canton's developer-resources page.
- **DPM** (Digital Asset Package Manager) CLI for newer SDK versions; **Daml Shell** + **Canton Console** for ledger inspection.

---

## What's already built (and therefore NOT original)

**Capital-markets flagships (do NOT recreate):** Broadridge DLR (very large daily repo volumes), Goldman GS DAP (bond tokenization, EIB green bond, DvP), DTCC tokenized Treasuries, the Canton Global Collateral Network (intraday cross-border repo with tokenized Gilts, tokenized deposits; participants incl. Euroclear, Citadel Securities, Cumberland DRW, Tradeweb, Société Générale), Tradeweb's on-chain UST repo, HSBC Tokenized Deposit Service piloting issuance/transfer/atomic settlement on Canton, and JPMorgan Kinexys issuing JPM Coin (JPMD) natively on Canton.

**Already-shipped ecosystem apps (saturated):** Cantex DEX (AMM + order book), ACME and Alpend (institutional/overcollateralized lending), BitSafe (BTC yield vaults), HydrAX (liquidity), Auric Predict (prediction markets), Console/Bron/Loop/Zoro (wallets), CantonSwap, analytics tools (CantonScan-style). The prior **Canton Construct Ideathon** required one of exactly five themes — *Lending/Borrowing/Yield; AMM Swaps & DEXes; Prediction Markets; Tokenized RWAs; Collateral & Margin Tools* — those themes are now "done."

**Canton's strategic narrative to align with.** Digital Asset publicly focuses on "use cases where shared, privacy-enabled infrastructure can reduce friction and improve capital efficiency — including tokenization, collateral mobility, settlement, payments, and other regulated financial workflows," working with 700+ ecosystem participants to make Canton "the core infrastructure for global finance." Tokenized deposits as the cash leg for DvP/PvP, and agentic commerce (named directly in Track 3), are explicit priorities — and privacy-preserving agentic finance on Canton is wide open.

---

## Where the genuine unsolved gaps are

- **Multilateral intercompany / cross-currency netting** — a large, real, *underserved* corporate-treasury pain point (FX spreads, gross-payment bank fees, trapped working capital, FX risk between indicative and fixed netting runs, regulatory constraints on cross-border netting). It needs exactly Canton's properties: each subsidiary's bilateral balances must stay confidential from siblings, yet the net settlement must execute atomically across currencies. No flagship Canton app occupies this space.
- **Privacy-preserving agentic treasury/commerce** — AI agents that initiate financial actions with cryptographic spend limits, human-in-the-loop approval, and selective disclosure. Canton's identity + privacy + atomicity is a far safer substrate than card rails for B2B agent payments.
- **Confidential private-credit / invoice financing** with private credit data — a fast-growing tokenized-RWA segment built mostly on transparent chains where invoice pricing/client lists leak.

---

## The 5 Project Ideas

For each: problem, Canton-fit, architecture, demo, feasibility, scoring, originality.

### Idea 1 (WINNER PICK): "AtomicNet" — Confidential Multilateral Netting & Cross-Currency Settlement with an AI Treasury Agent

**Tracks:** Primarily TradeFi/RWA + Payments/Agentic (spans 2 and 3).

- **Problem:** Multinationals run thousands of intercompany invoices monthly across currencies; without netting they pay gross cross-border fees, eat FX spreads, and trap working capital. Existing netting centers are closed TMS systems with no confidentiality between participants and slow, manual FX fixing that creates settlement risk.
- **Why Canton (not Ethereum):** Each subsidiary pair's payables/receivables must be invisible to other subsidiaries (sub-transaction privacy), yet the netted multi-currency settlement must clear atomically against tokenized deposits/stablecoins in one all-or-nothing transaction (Global Synchronizer). On Ethereum the netting graph would be public; on a privacy L2 you'd lose the atomic cross-currency settlement. Canton is the only place both hold simultaneously.
- **Architecture (Daml):** Parties = NettingCenter (operator), Subsidiary_n, Bank/CashRegistry, Regulator (observer). Templates: `IntercompanyInvoice` (visible only to the two counterparties + operator), `NettingCycle` (operator), `NetPosition` (per sub, visible only to that sub + operator), `MultiCurrencySettlement` exercising an atomic DvP across tokenized-deposit/stablecoin holdings using the allocation API. FX fixing via a price-feed input contract. Frontend: React treasury dashboard. AI: a Claude-powered treasury agent that proposes the optimal netting/settlement timing and drafts the cycle, but settlement requires a human controller's signature (human-in-the-loop) — a clean answer to agentic-commerce safety.
- **Demo (3 min):** Show 5 subsidiaries with a tangled web of ~20 gross cross-currency invoices → AI agent recommends a netting cycle → one click collapses them into a single net payment per entity, settled atomically in tokenized deposits → then prove privacy (Subsidiary B literally cannot see A↔C balances) and show the Regulator's selective-disclosure view. End with "this settled in 2 seconds, atomically, privately — try that on Ethereum."
- **Feasibility (solo + Claude Code, 4 wks):** High. Netting math is simple; the hard part is Daml modeling of privacy + atomic DvP, which the token standard's allocation API and the Quickstart scaffold support. Scope MVP to 3–5 parties, 2–3 currencies.
- **Scoring:** Technical execution ★★★★★; Originality ★★★★★; UX ★★★★☆; Real-world applicability ★★★★★.
- **Originality:** Fresh on Canton. Netting is a textbook DLT use case but has NOT been built as a privacy-preserving Canton flagship; adding the AI treasury agent + regulator view makes it memorable.

### Idea 2: "Syndicate" — Confidential Syndicated Loan / Private-Credit Origination & Servicing

**Track:** Private DeFi & Capital Markets.

- **Problem:** Syndicated lending is an operational nightmare of bilateral comms; private-credit funds manage loans via PDFs and quarterly marks. Lenders need to see their own exposure but not each other's tickets or pricing.
- **Why Canton:** A lead arranger, multiple lenders, and a borrower transact on one deal where each lender sees only its tranche and the borrower's covenant data on a need-to-know basis; drawdowns/repayments settle atomically vs tokenized cash. Transparent chains leak the whole syndicate book.
- **Architecture:** Parties = Arranger, Lender_n, Borrower, Agent, Regulator (observer). Templates: `LoanFacility`, `Tranche` (per-lender private), `Drawdown`, `RepaymentSchedule`, covenant-test contracts with selective disclosure; atomic interest/principal settlement via DvP. React deal-room UI.
- **Demo:** Originate a facility across 3 lenders → show each lender's private view → execute a drawdown and an automated coupon, atomic vs cash → reveal regulator read-only observer view.
- **Feasibility:** Medium-high; lifecycle logic is more complex than netting.
- **Scoring:** Tech ★★★★☆, Originality ★★★★☆, UX ★★★★☆, Applicability ★★★★★.
- **Originality:** Differentiates from ACME/Alpend (retail-style overcollateralized money markets) by being institutional, multi-party, privacy-first.

### Idea 3: "DarkPool" — Privacy-Preserving OTC Block-Trade Matching & Settlement

**Track:** Private DeFi & Capital Markets.

- **Problem:** Large block trades move markets if pre-trade interest leaks; OTC desks want a venue where order size/counterparty/price stay private until matched, then settle DvP instantly.
- **Why Canton:** Sub-transaction privacy means resting orders are visible only to the venue; on match, the trade settles atomically (asset vs tokenized cash) with neither side seeing the other's broader book. This is the canonical thing public order books cannot do.
- **Architecture:** Parties = Venue, Trader_n, CashRegistry, AssetRegistry, Regulator. Templates: `Order` (private to trader+venue), `MatchProposal`, atomic `Settlement` (DvP via allocation API). React trading blotter.
- **Demo:** Two desks submit hidden block orders → venue matches → atomic DvP → prove neither saw the other's order until/after match; show MEV/front-running impossibility.
- **Feasibility:** Medium; matching engine off-ledger in backend, settlement on-ledger.
- **Scoring:** Tech ★★★★☆, Originality ★★★★☆, UX ★★★★☆, Applicability ★★★★☆.
- **Originality:** Distinct from Cantex (public AMM/order book). Risk: "dark pool" is a known DLT trope, so execution polish matters.

### Idea 4: "PayAgentX" — Privacy-Preserving Agentic B2B Commerce with Programmable Spend Mandates

**Track:** Payments, Neobanking & Agentic Commerce.

- **Problem:** AI agents are starting to buy on behalf of businesses, but card rails assume a human at authorization and leak commercial terms; agents need cryptographic, auditable, privacy-preserving spend authority.
- **Why Canton:** A `SpendMandate` Daml contract grants an agent bounded authority (per-tx cap, total cap, merchant whitelist, expiry) with the principal as signatory; agent-initiated purchases settle atomically vs tokenized deposits and are private to buyer/seller, with a built-in audit/regulator observer. Identity is native (Daml PartyID), unlike anonymous Ethereum addresses.
- **Architecture:** Parties = Principal (business), Agent, Merchant_n, CashRegistry, Auditor (observer). Templates: `SpendMandate`, `PurchaseOrder`, atomic `PaymentSettlement`, `MandateRevocation`. Claude-powered agent that reads a goal ("reorder supplies under $5k from approved vendors"), proposes orders, executes only within mandate. React dashboard showing live agent activity + spend caps.
- **Demo:** Set a mandate → agent autonomously buys from 2 whitelisted merchants → attempt an over-limit/off-whitelist purchase and watch the Daml contract reject it on-ledger → show the private, atomic settlement and the auditor's view.
- **Feasibility:** Medium-high; the agent is a thin LLM wrapper, the value is the on-ledger mandate enforcement.
- **Scoring:** Tech ★★★★☆, Originality ★★★★★, UX ★★★★★, Applicability ★★★★☆.
- **Originality:** Directly targets Track 3's "AI agents initiating commercial actions safely." Strong "wow factor." Slightly less aligned with Canton's capital-markets core than Idea 1. **This is the strongest hedge / alternative.**

### Idea 5: "TradeFlow" — Confidential Invoice/Supply-Chain Financing Marketplace

**Track:** TradeFi, RWA & Tokenized Assets.

- **Problem:** SMEs wait 30–90 days for invoices; financing markets exist but invoices carry sensitive pricing/client data that can't go on a public chain, and double-financing fraud is rife.
- **Why Canton:** Tokenize invoices as private Daml contracts; financiers bid without seeing competitors' bids or the supplier's full client list; funding and repayment settle atomically vs tokenized cash; the registry prevents the same invoice being financed twice (no double-spend), with selective disclosure to an auditor.
- **Architecture:** Parties = Supplier, Buyer (obligor/observer), Financier_n, CashRegistry, Auditor. Templates: `Invoice`, `FinancingRequest`, sealed-bid `Offer` (private per financier), atomic `Funding` and `Repayment`. React marketplace UI.
- **Demo:** Supplier tokenizes an invoice → 2 financiers submit sealed private bids → supplier accepts → atomic funding → buyer pays at maturity, atomic repayment → show that financier A never saw financier B's bid, and the anti-double-financing guarantee.
- **Feasibility:** Medium-high.
- **Scoring:** Tech ★★★★☆, Originality ★★★★☆, UX ★★★★☆, Applicability ★★★★★.
- **Originality:** Invoice tokenization is a known RWA category, so leaning hard on the privacy/sealed-bid/fraud-prevention angle is what differentiates it.

---

## The Winning Pick and Why

**Build Idea 1 — AtomicNet.** Reasoning against the judging criteria and the strategic question of impressing Canton Foundation judges:

1. **It is the purest demonstration of Canton's two unique superpowers at once** — sub-transaction privacy AND atomic cross-currency settlement — in a single, legible workflow. The "does this need Canton?" question has an unambiguous answer: it is impossible to build well anywhere else.
2. **It rides the sponsor's exact flagship narrative** — tokenized deposits as the cash leg for DvP/PvP, collateral/cash mobility, settlement, payments — which Digital Asset itself is championing.
3. **It is genuinely original on Canton.** Netting was not an Ideathon theme, no flagship app occupies it, and it is not in the saturated DEX/lending/wallet set. The AI treasury agent + regulator selective-disclosure view add memorable, on-trend "wow."
4. **It is feasible for a solo builder + Claude Code in 4 weeks.** Netting logic is simple arithmetic; the CN Quickstart gives the full-stack scaffold; the token standard's allocation API gives atomic DvP out of the box. Scope to 3–5 subsidiaries and 2–3 currencies for the MVP.
5. **It spans two of the three tracks** (TradeFi/RWA + Payments/Agentic), which matters if judges weigh cross-track ambition — and it competes credibly for an overall top-3 placement under the shared-pool structure.

**Wow-factor elements to engineer deliberately:** (a) the visceral "tangled web → single net payment" animation; (b) a live privacy proof where you log in as a sibling subsidiary and show the data is simply *not there*; (c) the AI agent proposing but never unilaterally settling; (d) a one-click regulator view that materializes a complete audit trail.

---

## How to maximize each judging dimension

- **Technical execution:** show passing Daml tests in the repo; document the privacy/atomicity guarantees in the README; clean commit history; keep authorization declarative (`signatory`/`controller`), avoid the "visibility-as-security" and "authority-smuggling" anti-patterns.
- **Originality:** in the deck, explicitly contrast with Ethereum (public netting graph) and privacy-L2s (no atomic cross-currency settlement); state plainly that no Canton flagship does netting.
- **UX/design:** make the "gross → net" moment and the privacy proof feel like a product, not a script; readable transaction previews.
- **Real-world applicability:** open the pitch with the corporate-treasury pain (FX spreads, gross fees, trapped capital), note that intercompany netting is a known-but-under-implemented treasury strategy, and tie to tokenized-deposit DvP.

**Submission package:** public GitHub repo (Daml + backend + frontend + tests + architecture diagram + clear run instructions); a deck that leads with the problem and the "only on Canton" argument; a 3-minute video (≈30s problem, ≈2min live demo: web → net → privacy proof → regulator view, ≈30s architecture and roadmap); a live product link.

**Benchmarks that would change the recommendation:** If you cannot get atomic DvP working by ~Day 10, descope the AI agent and the cross-currency leg first (keep single-currency netting + privacy, still a strong submission). If Track 3 (Payments/Agentic) is clearly judged and rewarded on its own, **PayAgentX (Idea 4)** is the strong hedge.

---

## Caveats

- **Prize specifics partially unverified.** The exact $7,000 split is not on the (JS-rendered) Encode page; the "top 3 across all tracks share the pool" structure comes from a secondary aggregator and should be confirmed in the hackathon Discord / registration portal.
- **Ecosystem facts move fast.** Headline figures (repo volumes, tokenized-asset totals, market-cap rank) come from press releases and secondary trackers and should be treated as directional. Verify any number you put in your deck against a primary Canton/Digital Asset source.
- **LocalNet resource demands** (Docker ≥8 GB) and the rapidly evolving Quickstart/SDK can cost setup time — front-load environment setup.
- **"Live product" on Canton mainnet is unrealistic** for a solo 4-week build; a hosted LocalNet/DevNet demo clearly labeled as such satisfies the spirit of the requirement.
- **Agent safety framing matters to institutional judges** — always show the AI proposing and a human/contract constraint disposing; never demo an agent settling unilaterally.
