# AtomicNet

**Private, atomic, cross-currency intercompany settlement on Canton — with an AI treasury agent that proposes but never settles.**

AtomicNet lets the subsidiaries of a multinational settle their intercompany invoices by *netting* — collapsing a tangled web of gross cross-currency payments into one net payment per entity — where (a) no subsidiary can see another's bilateral balances, and (b) the multi-currency net settlement executes **atomically** against tokenized bank deposits. It showcases the two things Canton does that Ethereum cannot do at once: **sub-transaction privacy** and **atomic multi-party settlement**.

> Hackathon project — Build on Canton (Encode Club × Canton Foundation, 2026). MVP scope: 3–5 subsidiaries, 1 operator, 1 bank, 1 regulator; 2–3 currencies; hosted demo environment (not mainnet).

## Status
- ✅ **Stage 0** — toolchain + atomic-settlement/privacy gate proven. See [docs/STAGE0.md](docs/STAGE0.md).
- ✅ **Stage 1** — Daml core (Invoice propose/accept, Cycle, NetPosition → ApprovedNetPosition) + happy-path lifecycle test.
- ✅ **Stage 2** — tokenized cash (Deposit / DepositAllocation) + atomic single-currency settlement; `settlement` + `atomicity` tests green.
- ✅ **Stage 3** — multi-currency FX netting → atomic USD settlement; TypeScript netting service; full Daml test suite. **7 Daml scripts + 8 netting tests green.**
- ⬜ Stage 4 — Node/TS backend + React frontend + AI treasury agent
- ⬜ Stage 5 — demo dataset, polish, hosted demo, CI

## What the tests prove
Each Daml Script in [daml-tests/](daml-tests/AtomicNet/Test/) demonstrates a guarantee a judge cares about (`dpm test`, all green):

| Test | Proves |
|---|---|
| `lifecycle` | The full invoice → cycle → net-position → approval flow works end to end. |
| `settlement` | Net payers reserve funds; the operator settles every leg in ONE transaction; balances = opening ± net, cash conserved. |
| `atomicity` | One under-funded leg → the **entire** settlement reverts, no balances change. *No partial settlement, no exposure.* |
| `multiCurrencySettlement` | Invoices in USD/EUR/GBP FX-net to USD (Σ = 0) and settle atomically. |
| `privacy` | A sibling cannot see another pair's invoice or another sub's net position — privacy by protocol, not by app. |
| `authorization` | No party can forge an invoice that binds another; no subsidiary can trigger settlement or approve another's position. |
| `regulatorDisclosure` | The regulator reconstructs the full audit trail (cycle, positions, approvals, settlement); siblings stay blind to each other. |

The [TypeScript netting service](backend/src/netting/) (`pnpm test`, 8 tests) converts multi-currency invoices, computes each entity's net position, asserts Σ net == 0 (rejecting tampered books), builds the settlement plan, and reports the gross→net reduction ratio.

## Tech
Daml 3.x / Canton 3.x (via DPM) · Daml Script tests · Node/TypeScript backend on the JSON Ledger API · React + Vite frontend · Anthropic API for the treasury agent.

## Develop
See [CLAUDE.md](CLAUDE.md) for the verified toolchain, commands, and the project's inviolable rules.

## License
Apache-2.0 — see [LICENSE](LICENSE).
