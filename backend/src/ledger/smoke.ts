// Stage-4a smoke test: drive the FULL netting cycle over the live JSON Ledger API
// (propose -> accept -> open -> include -> lock -> net -> approve -> allocate -> settle),
// then assert balances = opening +/- net and that privacy holds AS each party.
// Run against a live `dpm sandbox ... --dar atomicnet-model-0.1.0.dar`:  node src/ledger/smoke.ts
import assert from "node:assert/strict";
import {
  allocateOrReuse,
  submit,
  activeContracts,
  ofTemplate,
  type Contract,
} from "./client.ts";
import { T, QN, create, exercise, dec, tuple2, tuple3 } from "./templates.ts";
import { computeNetPositions, buildSettlementPlan, type Invoice } from "../netting/netting.ts";
import type { FxRate } from "../netting/fx.ts";

const log = (...a: unknown[]) => console.log("  ", ...a);
const num = (s: string) => parseFloat(s);
const short = (p: string) => p.split("::")[0];

async function find(party: string, qn: string, pred: (p: any) => boolean): Promise<Contract> {
  const cs = ofTemplate(await activeContracts(party), qn).filter((c) => pred(c.payload));
  if (cs.length === 0) throw new Error(`contract not found: ${qn} for ${short(party)}`);
  return cs[0]!;
}

async function balanceOf(party: string, ccy = "USD"): Promise<number> {
  const deps = ofTemplate(await activeContracts(party), QN.Deposit);
  return deps
    .filter((d) => d.payload.currency === ccy && d.payload.owner === party)
    .reduce((a, d) => a + num(d.payload.amount), 0);
}

async function main() {
  console.log("== Stage-4a backend smoke test ==");

  // 1. Parties (idempotent across sandbox restarts within a run).
  const op = await allocateOrReuse("Operator");
  const us = await allocateOrReuse("Sub_US");
  const uk = await allocateOrReuse("Sub_UK");
  const de = await allocateOrReuse("Sub_DE");
  const bank = await allocateOrReuse("Bank");
  const reg = await allocateOrReuse("Regulator");
  log("parties allocated:", [us, uk, de, bank, reg, op].map(short).join(", "));

  const cycleId = `CYCLE-${Date.now()}`;
  const rates: FxRate[] = [
    { base: "EUR", quote: "USD", rate: 1.1 },
    { base: "GBP", quote: "USD", rate: 1.25 },
  ];

  // 2. Bank issues opening deposits: 1000 USD to each subsidiary.
  for (const owner of [us, uk, de]) {
    await submit([bank], [create(T.Deposit, { bank, owner, currency: "USD", amount: dec(1000) })]);
  }
  log("opening balances:", `US=${await balanceOf(us)} UK=${await balanceOf(uk)} DE=${await balanceOf(de)}`);

  // 3. Invoices via propose/accept (multi-currency).
  async function raise(issuer: string, payer: string, amount: number, ccy: string, id: string) {
    await submit(
      [issuer],
      [
        create(T.InvoiceProposal, {
          operator: op,
          issuer,
          payer,
          amount: dec(amount),
          currency: ccy,
          invoiceId: id,
          dueDate: "2026-07-01",
        }),
      ],
    );
    const prop = await find(payer, QN.InvoiceProposal, (p) => p.invoiceId === id);
    await submit([payer], [exercise(T.InvoiceProposal, prop.contractId, "AcceptInvoice", {})]);
  }
  await raise(uk, us, 1000, "USD", "INV-UK-US"); // US owes UK 1000 USD
  await raise(us, de, 500, "EUR", "INV-US-DE"); //  DE owes US 500 EUR
  await raise(de, uk, 400, "GBP", "INV-DE-UK"); //  UK owes DE 400 GBP
  log("3 invoices raised across USD/EUR/GBP");

  // 4. Operator opens the cycle, includes the invoices, and locks it.
  await submit(
    [op],
    [
      create(T.NettingCycle, {
        operator: op,
        regulator: reg,
        participants: [us, uk, de],
        settlementCurrency: "USD",
        fxRates: rates.map((r) => ({ base: r.base, quote: r.quote, rate: dec(r.rate) })),
        cycleId,
        status: "Open",
      }),
    ],
  );
  const ids = ["INV-UK-US", "INV-US-DE", "INV-DE-UK"];
  for (const inv of ofTemplate(await activeContracts(op), QN.IntercompanyInvoice).filter((c) =>
    ids.includes(c.payload.invoiceId),
  )) {
    await submit([op], [exercise(T.IntercompanyInvoice, inv.contractId, "IncludeInCycle", { inCycleId: cycleId })]);
  }
  const cycle = await find(op, QN.NettingCycle, (p) => p.cycleId === cycleId);
  await submit([op], [exercise(T.NettingCycle, cycle.contractId, "LockCycle", {})]);
  log("cycle opened, invoices included, locked");

  // 5. Compute net positions via the netting service (operator observes all invoices).
  const invForNetting: Invoice[] = ofTemplate(await activeContracts(op), QN.IntercompanyInvoice)
    .filter((c) => ids.includes(c.payload.invoiceId))
    .map((c) => ({
      issuer: c.payload.issuer,
      payer: c.payload.payer,
      amount: num(c.payload.amount),
      currency: c.payload.currency,
    }));
  const nets = computeNetPositions(invForNetting, rates, "USD");
  log("net positions:", nets.map((n) => `${short(n.party)}=${n.netAmount}`).join(" "));

  // 6. Operator creates NetPositions; each subsidiary approves its own.
  for (const n of nets) {
    await submit(
      [op],
      [
        create(T.NetPosition, {
          operator: op,
          subsidiary: n.party,
          regulator: reg,
          cycleId,
          settlementCurrency: "USD",
          netAmount: dec(n.netAmount),
        }),
      ],
    );
  }
  for (const sub of [us, uk, de]) {
    const np = await find(sub, QN.NetPosition, (p) => p.subsidiary === sub && p.cycleId === cycleId);
    await submit([sub], [exercise(T.NetPosition, np.contractId, "ApproveNetPosition", {})]);
  }
  log("net positions approved by all subsidiaries");

  // 7. Build the settlement plan; each transfer's payer allocates exactly that amount.
  const plan = buildSettlementPlan(nets);
  log("settlement plan:", plan.transfers.map((t) => `${short(t.payer)}->${short(t.receiver)}:${t.amount}`).join(" "));
  const used = new Set<string>();
  const transferTuples: unknown[] = [];
  for (const t of plan.transfers) {
    const dep = await find(t.payer, QN.Deposit, (p) => p.currency === "USD" && p.owner === t.payer && num(p.amount) >= t.amount);
    await submit(
      [t.payer],
      [exercise(T.Deposit, dep.contractId, "Allocate", { operator: op, allocAmount: dec(t.amount), cycleId })],
    );
    const alloc = ofTemplate(await activeContracts(op), QN.DepositAllocation).find(
      (c) => c.payload.owner === t.payer && num(c.payload.amount) === t.amount && c.payload.cycleId === cycleId && !used.has(c.contractId),
    );
    if (!alloc) throw new Error(`allocation not found for ${short(t.payer)}`);
    used.add(alloc.contractId);
    transferTuples.push(tuple3(alloc.contractId, t.receiver, dec(t.amount)));
  }

  // 8. Operator assembles the SettlementBatch and executes it atomically. ExecuteSettlement is
  //    now bound to the on-ledger Locked cycle + the subsidiaries' approvals (see Settlement.daml).
  const lockedCycle = await find(op, QN.NettingCycle, (p) => p.cycleId === cycleId);
  const approvedCids = ofTemplate(await activeContracts(op), QN.ApprovedNetPosition)
    .filter((c) => c.payload.cycleId === cycleId)
    .map((c) => c.contractId);
  await submit(
    [op],
    [
      create(T.SettlementBatch, {
        operator: op,
        regulator: reg,
        cycleId,
        transfers: transferTuples,
        payouts: plan.payouts.map((p) => tuple2(p.receiver, dec(p.amount))),
        cycle: lockedCycle.contractId,
        approvals: approvedCids,
      }),
    ],
  );
  const batch = await find(op, QN.SettlementBatch, (p) => p.cycleId === cycleId);
  await submit([op], [exercise(T.SettlementBatch, batch.contractId, "ExecuteSettlement", {})]);
  log("settlement executed atomically");

  // 9. Assert final balances = opening +/- net.
  const usBal = await balanceOf(us);
  const ukBal = await balanceOf(uk);
  const deBal = await balanceOf(de);
  log("final balances:", `US=${usBal} UK=${ukBal} DE=${deBal}`);
  assert.equal(usBal, 550, "US final balance"); // 1000 - 450
  assert.equal(ukBal, 1500, "UK final balance"); // 1000 + 500
  assert.equal(deBal, 950, "DE final balance"); // 1000 - 50

  // 10. PRIVACY holds at the API: Sub_UK never sees the US<->DE invoice.
  const ukInvoices = ofTemplate(await activeContracts(uk), QN.IntercompanyInvoice).map((c) => c.payload.invoiceId);
  assert.ok(!ukInvoices.includes("INV-US-DE"), "Sub_UK must NOT see the US<->DE invoice");
  assert.ok(ukInvoices.includes("INV-UK-US"), "Sub_UK sees its own invoice");
  log("privacy OK: Sub_UK's invoice view =", ukInvoices.join(", "));

  console.log("== SMOKE PASSED: full cycle settled, balances correct, privacy enforced ==");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
