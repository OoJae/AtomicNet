# AtomicNet

**Private, atomic, cross-currency intercompany settlement on Canton — with an AI treasury agent that proposes but never settles.**

AtomicNet lets the subsidiaries of a multinational settle their intercompany invoices by *netting* — collapsing a tangled web of gross cross-currency payments into one net payment per entity — where (a) no subsidiary can see another's bilateral balances, and (b) the multi-currency net settlement executes **atomically** against tokenized bank deposits. It showcases the two things Canton does that Ethereum cannot do at once: **sub-transaction privacy** and **atomic multi-party settlement**.

> Hackathon project — Build on Canton (Encode Club × Canton Foundation, 2026). MVP scope: 3–5 subsidiaries, 1 operator, 1 bank, 1 regulator; 2–3 currencies; hosted demo environment (not mainnet).

## Status
- ✅ **Stage 0** — toolchain + atomic-settlement/privacy gate proven. See [docs/STAGE0.md](docs/STAGE0.md).
- ✅ **Stage 1** — Daml core (Invoice propose/accept, Cycle, NetPosition → ApprovedNetPosition) + happy-path lifecycle test.
- ✅ **Stage 2** — tokenized cash (Deposit / DepositAllocation) + atomic single-currency settlement; `settlement` + `atomicity` tests green.
- ⬜ Stage 3 — multi-currency + FX + full test suite (privacy, atomicity, conservation, authorization, regulator)
- ⬜ Stage 4 — Node/TS backend + React frontend + AI treasury agent
- ⬜ Stage 5 — demo dataset, polish, hosted demo, CI

## Tech
Daml 3.x / Canton 3.x (via DPM) · Daml Script tests · Node/TypeScript backend on the JSON Ledger API · React + Vite frontend · Anthropic API for the treasury agent.

## Develop
See [CLAUDE.md](CLAUDE.md) for the verified toolchain, commands, and the project's inviolable rules.

## License
Apache-2.0 — see [LICENSE](LICENSE).
