// Domain service: the AtomicNet operations, expressed over the JSON Ledger API.
// Reads are performed AS the relevant party so the ledger enforces privacy; writes set actAs.
// The frontend uses friendly party names ("Sub_US"); we resolve them to full ids here.
import { allocateOrReuse, submit, activeContracts, ofTemplate, type Contract } from "../ledger/client.ts";
import { T, QN, create, exercise, dec, tuple2, tuple3 } from "../ledger/templates.ts";
import { computeNetPositions, buildSettlementPlan, reductionRatio, type Invoice, type NetPosition } from "../netting/netting.ts";
import type { FxRate } from "../netting/fx.ts";

const PARTY_NAMES = ["Operator", "Sub_US", "Sub_UK", "Sub_DE", "Bank", "Regulator"];
const SUBS = ["Sub_US", "Sub_UK", "Sub_DE"];
export const parties: Record<string, string> = {}; // name -> full id
const num = (s: string) => parseFloat(s);

export const nameOf = (id: string): string =>
  Object.entries(parties).find(([, v]) => v === id)?.[0] ?? id.split("::")[0] ?? id;

/** Resolve a friendly name (or pass through a full id) to a full party id. */
export function resolve(nameOrId: string): string {
  if (parties[nameOrId]) return parties[nameOrId]!;
  const byPrefix = Object.values(parties).find((id) => id.startsWith(nameOrId + "::"));
  return byPrefix ?? nameOrId;
}

const DEFAULT_RATES: FxRate[] = [
  { base: "EUR", quote: "USD", rate: 1.1 },
  { base: "GBP", quote: "USD", rate: 1.25 },
];

async function find(party: string, qn: string, pred: (p: any) => boolean): Promise<Contract | undefined> {
  return ofTemplate(await activeContracts(party), qn).find((c) => pred(c.payload));
}

export async function balanceOf(party: string, ccy = "USD"): Promise<number> {
  return ofTemplate(await activeContracts(party), QN.Deposit)
    .filter((d) => d.payload.currency === ccy && d.payload.owner === party)
    .reduce((a, d) => a + num(d.payload.amount), 0);
}

// ---------------------------------------------------------------------------- bootstrap
export async function bootstrap(): Promise<void> {
  for (const n of PARTY_NAMES) parties[n] = await allocateOrReuse(n);
  for (const sub of SUBS) {
    if ((await balanceOf(parties[sub]!)) === 0) {
      await submit([parties.Bank!], [
        create(T.Deposit, { bank: parties.Bank!, owner: parties[sub]!, currency: "USD", amount: dec(1000) }),
      ]);
    }
  }
}

export function getParties(): { name: string; party: string }[] {
  return PARTY_NAMES.map((name) => ({ name, party: parties[name]! }));
}

// ---------------------------------------------------------------------------- reads
export async function getDashboard(nameOrId: string) {
  const party = resolve(nameOrId);
  const cs = await activeContracts(party);
  const balances: Record<string, number> = {};
  for (const d of ofTemplate(cs, QN.Deposit).filter((d) => d.payload.owner === party)) {
    balances[d.payload.currency] = (balances[d.payload.currency] ?? 0) + num(d.payload.amount);
  }
  const invoices = [
    ...ofTemplate(cs, QN.InvoiceProposal).map((c) => ({ status: "proposed", cid: c.contractId, ...money(c) })),
    ...ofTemplate(cs, QN.IntercompanyInvoice).map((c) => ({ status: c.payload.included ? "included" : "accepted", cid: c.contractId, ...money(c) })),
  ];
  const netPositions = [
    ...ofTemplate(cs, QN.NetPosition).map((c) => ({ status: "pending", cid: c.contractId, subsidiary: nameOf(c.payload.subsidiary), netAmount: num(c.payload.netAmount), cycleId: c.payload.cycleId })),
    ...ofTemplate(cs, QN.ApprovedNetPosition).map((c) => ({ status: "approved", cid: c.contractId, subsidiary: nameOf(c.payload.subsidiary), netAmount: num(c.payload.netAmount), cycleId: c.payload.cycleId })),
  ];
  return { party: nameOf(party), partyId: party, balances, invoices, netPositions };
}

const money = (c: Contract) => ({
  invoiceId: c.payload.invoiceId,
  issuer: nameOf(c.payload.issuer),
  payer: nameOf(c.payload.payer),
  amount: num(c.payload.amount),
  currency: c.payload.currency,
});

/** Raw visible contract templates+counts AS a party — powers the live privacy proof. */
export async function getVisibility(nameOrId: string) {
  const party = resolve(nameOrId);
  const cs = await activeContracts(party);
  const byType: Record<string, number> = {};
  for (const c of cs) {
    const k = c.templateId.split(":").slice(-2).join(":");
    byType[k] = (byType[k] ?? 0) + 1;
  }
  const invoices = ofTemplate(cs, QN.IntercompanyInvoice).map(money);
  return { party: nameOf(party), totalVisible: cs.length, byType, invoices };
}

// ---------------------------------------------------------------------------- invoice writes
export async function proposeInvoice(issuerName: string, body: { payer: string; amount: number; currency: string; invoiceId: string; dueDate?: string }) {
  const issuer = resolve(issuerName);
  await submit([issuer], [create(T.InvoiceProposal, {
    operator: parties.Operator!, issuer, payer: resolve(body.payer),
    amount: dec(body.amount), currency: body.currency, invoiceId: body.invoiceId,
    dueDate: body.dueDate ?? "2026-07-01",
  })]);
  return { ok: true };
}

export async function acceptInvoice(payerName: string, invoiceId: string) {
  const payer = resolve(payerName);
  const prop = await find(payer, QN.InvoiceProposal, (p) => p.invoiceId === invoiceId);
  if (!prop) throw new Error(`no proposal ${invoiceId} for ${payerName}`);
  await submit([payer], [exercise(prop.templateId, prop.contractId, "AcceptInvoice", {})]);
  return { ok: true };
}

// ---------------------------------------------------------------------------- cycle
export async function openCycle(body: { cycleId: string; participants?: string[]; settlementCurrency?: string; fxRates?: FxRate[] }) {
  const op = parties.Operator!;
  const participants = (body.participants ?? SUBS).map(resolve);
  const rates = body.fxRates ?? DEFAULT_RATES;
  await submit([op], [create(T.NettingCycle, {
    operator: op, regulator: parties.Regulator!, participants,
    settlementCurrency: body.settlementCurrency ?? "USD",
    fxRates: rates.map((r) => ({ base: r.base, quote: r.quote, rate: dec(r.rate) })),
    cycleId: body.cycleId, status: "Open",
  })]);
  return { ok: true, cycleId: body.cycleId };
}

/** Include all accepted invoices among participants, lock the cycle, compute nets, create NetPositions. */
export async function lockCycle(cycleId: string) {
  const op = parties.Operator!;
  const cycle = await find(op, QN.NettingCycle, (p) => p.cycleId === cycleId);
  if (!cycle) throw new Error(`no cycle ${cycleId}`);
  const participants: string[] = cycle.payload.participants;
  const rates: FxRate[] = (cycle.payload.fxRates as any[]).map((r) => ({ base: r.base, quote: r.quote, rate: num(r.rate) }));
  const settlementCurrency: string = cycle.payload.settlementCurrency;

  const isParticipant = (id: string) => participants.includes(id);
  const invoiceContracts = ofTemplate(await activeContracts(op), QN.IntercompanyInvoice)
    .filter((c) => isParticipant(c.payload.issuer) && isParticipant(c.payload.payer));
  for (const inv of invoiceContracts.filter((c) => !c.payload.included)) {
    await submit([op], [exercise(inv.templateId, inv.contractId, "IncludeInCycle", { cycleId })]);
  }
  await submit([op], [exercise(cycle.templateId, cycle.contractId, "LockCycle", {})]);

  const invoices: Invoice[] = invoiceContracts.map((c) => ({
    issuer: c.payload.issuer, payer: c.payload.payer, amount: num(c.payload.amount), currency: c.payload.currency,
  }));
  const nets = computeNetPositions(invoices, rates, settlementCurrency);
  for (const n of nets) {
    await submit([op], [create(T.NetPosition, {
      operator: op, subsidiary: n.party, regulator: parties.Regulator!, cycleId,
      settlementCurrency, netAmount: dec(n.netAmount),
    })]);
  }
  return { ok: true, nets: nets.map((n) => ({ subsidiary: nameOf(n.party), netAmount: n.netAmount })) };
}

export async function approveNetPosition(subName: string, cycleId: string) {
  const sub = resolve(subName);
  const np = await find(sub, QN.NetPosition, (p) => p.subsidiary === sub && p.cycleId === cycleId);
  if (!np) throw new Error(`no net position for ${subName} in ${cycleId}`);
  await submit([sub], [exercise(np.templateId, np.contractId, "ApproveNetPosition", {})]);
  return { ok: true };
}

/** A net payer reserves its |net| for the cycle (no-op for receivers). */
export async function allocate(subName: string, cycleId: string) {
  const sub = resolve(subName);
  const ap = await find(sub, QN.ApprovedNetPosition, (p) => p.subsidiary === sub && p.cycleId === cycleId);
  const net = ap ? num(ap.payload.netAmount) : 0;
  if (net >= 0) return { ok: true, allocated: 0 };
  const amount = -net;
  const dep = await find(sub, QN.Deposit, (p) => p.owner === sub && p.currency === "USD" && num(p.amount) >= amount);
  if (!dep) throw new Error(`${subName} has insufficient USD to allocate ${amount}`);
  await submit([sub], [exercise(dep.templateId, dep.contractId, "Allocate", { operator: parties.Operator!, allocAmount: dec(amount), cycleId })]);
  return { ok: true, allocated: amount };
}

/** Operator gathers allocations, builds the plan from approved positions, executes atomically. */
export async function settle(cycleId: string) {
  const op = parties.Operator!;
  const approved = ofTemplate(await activeContracts(op), QN.ApprovedNetPosition).filter((c) => c.payload.cycleId === cycleId);
  const nets: NetPosition[] = approved.map((c) => ({ party: c.payload.subsidiary, netAmount: num(c.payload.netAmount) }));
  const plan = buildSettlementPlan(nets);

  const allocs = ofTemplate(await activeContracts(op), QN.DepositAllocation).filter((c) => c.payload.cycleId === cycleId);
  const used = new Set<string>();
  const transfers: unknown[] = [];
  for (const t of plan.transfers) {
    const payerId = resolve(t.payer);
    const alloc = allocs.find((c) => c.payload.owner === payerId && num(c.payload.amount) === t.amount && !used.has(c.contractId));
    if (!alloc) throw new Error(`missing allocation for ${nameOf(payerId)} (${t.amount}); approve & allocate first`);
    used.add(alloc.contractId);
    transfers.push(tuple3(alloc.contractId, t.receiver, dec(t.amount)));
  }
  await submit([op], [create(T.SettlementBatch, {
    operator: op, regulator: parties.Regulator!, cycleId,
    transfers, payouts: plan.payouts.map((p) => tuple2(p.receiver, dec(p.amount))),
  })]);
  const batch = await find(op, QN.SettlementBatch, (p) => p.cycleId === cycleId);
  await submit([op], [exercise(batch!.templateId, batch!.contractId, "ExecuteSettlement", {})]);
  const balances = Object.fromEntries(await Promise.all(SUBS.map(async (s) => [s, await balanceOf(parties[s]!)])));
  return { ok: true, settled: plan.transfers.length, balances };
}

// ---------------------------------------------------------------------------- views
export async function getCycle(cycleId: string) {
  const op = parties.Operator!;
  const cs = await activeContracts(op);
  const cycle = ofTemplate(cs, QN.NettingCycle).find((c) => c.payload.cycleId === cycleId);
  const positions = [
    ...ofTemplate(cs, QN.NetPosition).filter((c) => c.payload.cycleId === cycleId).map((c) => ({ subsidiary: nameOf(c.payload.subsidiary), netAmount: num(c.payload.netAmount), approved: false })),
    ...ofTemplate(cs, QN.ApprovedNetPosition).filter((c) => c.payload.cycleId === cycleId).map((c) => ({ subsidiary: nameOf(c.payload.subsidiary), netAmount: num(c.payload.netAmount), approved: true })),
  ];
  const invoices = ofTemplate(cs, QN.IntercompanyInvoice).filter((c) => c.payload.included).map(money);
  const allApproved = positions.length > 0 && positions.every((p) => p.approved);
  return {
    cycleId,
    status: cycle?.payload.status ?? "None",
    settlementCurrency: cycle?.payload.settlementCurrency ?? "USD",
    fxRates: (cycle?.payload.fxRates ?? []).map((r: any) => ({ base: r.base, quote: r.quote, rate: num(r.rate) })),
    positions, allApproved,
    reduction: { gross: invoices.length, net: positions.filter((p) => p.netAmount > 0).length },
  };
}

/** Gross invoice graph + net result for the Gross->Net visualization (operator view). */
export async function getGraph() {
  const op = parties.Operator!;
  const cs = await activeContracts(op);
  const grossEdges = ofTemplate(cs, QN.IntercompanyInvoice).map((c) => ({ from: nameOf(c.payload.issuer), to: nameOf(c.payload.payer), amount: num(c.payload.amount), currency: c.payload.currency }));
  const positions = ofTemplate(cs, QN.ApprovedNetPosition).map((c) => ({ subsidiary: nameOf(c.payload.subsidiary), netAmount: num(c.payload.netAmount) }));
  const plan = positions.length ? buildSettlementPlan(positions.map((p) => ({ party: p.subsidiary, netAmount: p.netAmount }))) : { transfers: [], payouts: [] };
  return { grossEdges, positions, netEdges: plan.transfers, reduction: { gross: grossEdges.length, net: plan.transfers.length } };
}

export async function getAudit() {
  const reg = parties.Regulator!;
  const cs = await activeContracts(reg);
  const byType: Record<string, number> = {};
  for (const c of cs) {
    const k = c.templateId.split(":").slice(-2).join(":");
    byType[k] = (byType[k] ?? 0) + 1;
  }
  return { party: "Regulator", totalVisible: cs.length, byType };
}

/** Orchestrate a full demo cycle end-to-end (used by the HTTP smoke and the "Run demo" button). */
export async function runDemo() {
  const tag = Date.now();
  const cycleId = `CYCLE-${tag}`;
  const invs = [
    { issuer: "Sub_UK", payer: "Sub_US", amount: 1000, currency: "USD", invoiceId: `UKUS-${tag}` },
    { issuer: "Sub_US", payer: "Sub_DE", amount: 500, currency: "EUR", invoiceId: `USDE-${tag}` },
    { issuer: "Sub_DE", payer: "Sub_UK", amount: 400, currency: "GBP", invoiceId: `DEUK-${tag}` },
  ];
  for (const i of invs) {
    await proposeInvoice(i.issuer, i);
    await acceptInvoice(i.payer, i.invoiceId);
  }
  await openCycle({ cycleId });
  const locked = await lockCycle(cycleId);
  for (const s of SUBS) await approveNetPosition(s, cycleId);
  for (const s of SUBS) await allocate(s, cycleId);
  const settled = await settle(cycleId);
  return { cycleId, nets: locked.nets, ...settled };
}
