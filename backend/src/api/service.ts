// Domain service: the AtomicNet operations, expressed over the JSON Ledger API.
// Reads are performed AS the relevant party so the ledger enforces privacy; writes set actAs.
// The frontend uses friendly party names ("Sub_US"); we resolve them to full ids here.
import { allocateOrReuse, submit, activeContracts, ofTemplate, type Contract } from "../ledger/client.ts";
import { T, QN, create, exercise, dec, tuple2, tuple3 } from "../ledger/templates.ts";
import { computeNetPositions, buildSettlementPlan, reductionRatio, type Invoice, type NetPosition } from "../netting/netting.ts";
import type { FxRate } from "../netting/fx.ts";
import { demoInvoices, DEMO_RATES, DEMO_SUBS, DEMO_OPENING_DEPOSIT } from "../netting/demoData.ts";
import * as agent from "../agent/agent.ts";

const SUBS = [...DEMO_SUBS]; // Sub_US, Sub_UK, Sub_DE, Sub_FR, Sub_SG
const PARTY_NAMES = ["Operator", ...SUBS, "Bank", "Regulator"];
export const parties: Record<string, string> = {}; // name -> full id
const num = (s: string) => parseFloat(s);

// The cycle currently being worked/demoed; views scope to it so re-runs stay clean.
let activeCycleId: string | undefined;

export const nameOf = (id: string): string =>
  Object.entries(parties).find(([, v]) => v === id)?.[0] ?? id.split("::")[0] ?? id;

/** Resolve a friendly name (or pass through a full id) to a full party id. */
export function resolve(nameOrId: string): string {
  if (parties[nameOrId]) return parties[nameOrId]!;
  const byPrefix = Object.values(parties).find((id) => id.startsWith(nameOrId + "::"));
  return byPrefix ?? nameOrId;
}

const DEFAULT_RATES: FxRate[] = DEMO_RATES;

async function find(party: string, qn: string, pred: (p: any) => boolean): Promise<Contract | undefined> {
  return ofTemplate(await activeContracts(party), qn).find((c) => pred(c.payload));
}

export async function balanceOf(party: string, ccy = "USD"): Promise<number> {
  return ofTemplate(await activeContracts(party), QN.Deposit)
    .filter((d) => d.payload.currency === ccy && d.payload.owner === party)
    .reduce((a, d) => a + num(d.payload.amount), 0);
}

// ---------------------------------------------------------------------------- bootstrap
/** Retry helper: a freshly-launched sandbox answers HTTP before its participant has
 *  connected to the synchronizer (PARTY_ALLOCATION_WITHOUT_CONNECTED_SYNCHRONIZER on slow
 *  cloud boots), so bootstrap operations retry with backoff instead of crashing. */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 30, delayMs = 3000): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      console.log(`[bootstrap] ${label} not ready (attempt ${i}/${tries}): ${String((e as Error)?.message ?? e).slice(0, 140)}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function bootstrap(): Promise<void> {
  for (const n of PARTY_NAMES) parties[n] = await withRetry(`allocate ${n}`, () => allocateOrReuse(n));
  for (const sub of SUBS) {
    if ((await balanceOf(parties[sub]!)) === 0) {
      await submit([parties.Bank!], [
        create(T.Deposit, { bank: parties.Bank!, owner: parties[sub]!, currency: "USD", amount: dec(DEMO_OPENING_DEPOSIT) }),
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
    ...ofTemplate(cs, QN.IntercompanyInvoice).map((c) => ({ status: c.payload.cycleId != null ? "included" : "accepted", cid: c.contractId, ...money(c) })),
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
  activeCycleId = body.cycleId; // views scope to the cycle being worked
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

  // Only invoices NOT yet claimed by any cycle (cycleId == None) are included — invoices
  // settled in earlier cycles can never be netted twice (the model also asserts this).
  const isParticipant = (id: string) => participants.includes(id);
  const invoiceContracts = ofTemplate(await activeContracts(op), QN.IntercompanyInvoice)
    .filter((c) => isParticipant(c.payload.issuer) && isParticipant(c.payload.payer) && c.payload.cycleId == null);
  for (const inv of invoiceContracts) {
    await submit([op], [exercise(inv.templateId, inv.contractId, "IncludeInCycle", { inCycleId: cycleId })]);
  }
  await submit([op], [exercise(cycle.templateId, cycle.contractId, "LockCycle", {})]);

  const invoices: Invoice[] = invoiceContracts.map((c) => ({
    issuer: c.payload.issuer, payer: c.payload.payer, amount: num(c.payload.amount), currency: c.payload.currency,
  }));
  if (invoices.length === 0) throw new Error(`no eligible invoices to include in ${cycleId}`);
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

/** A net payer earmarks funds for the cycle — ONE allocation per planned transfer (the
 *  institutional pattern: reserve per payment instruction), so settle() can match each
 *  transfer to a co-signed allocation exactly. No-op for receivers / zero-net parties.
 *  The plan is deterministic from the approved positions, so settle() recomputes it. */
export async function allocate(subName: string, cycleId: string) {
  const sub = resolve(subName);
  const approved = ofTemplate(await activeContracts(parties.Operator!), QN.ApprovedNetPosition).filter((c) => c.payload.cycleId === cycleId);
  const plan = buildSettlementPlan(approved.map((c) => ({ party: c.payload.subsidiary, netAmount: num(c.payload.netAmount) })));
  const myTransfers = plan.transfers.filter((t) => resolve(t.payer) === sub);
  let total = 0;
  for (const t of myTransfers) {
    const dep = await find(sub, QN.Deposit, (p) => p.owner === sub && p.currency === "USD" && num(p.amount) >= t.amount);
    if (!dep) throw new Error(`${subName} has insufficient USD to allocate ${t.amount}`);
    await submit([sub], [exercise(dep.templateId, dep.contractId, "Allocate", { operator: parties.Operator!, allocAmount: dec(t.amount), cycleId })]);
    total += t.amount;
  }
  return { ok: true, allocated: total, allocations: myTransfers.length };
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
  const invoices = ofTemplate(cs, QN.IntercompanyInvoice).filter((c) => c.payload.cycleId === cycleId).map(money);
  const allApproved = positions.length > 0 && positions.every((p) => p.approved);
  const plan = positions.length ? buildSettlementPlan(positions.map((p) => ({ party: p.subsidiary, netAmount: p.netAmount }))) : { transfers: [] };
  return {
    cycleId,
    status: cycle?.payload.status ?? "None",
    settlementCurrency: cycle?.payload.settlementCurrency ?? "USD",
    fxRates: (cycle?.payload.fxRates ?? []).map((r: any) => ({ base: r.base, quote: r.quote, rate: num(r.rate) })),
    positions, allApproved,
    reduction: { gross: invoices.length, net: plan.transfers.length },
  };
}

/** Gross invoice graph + net result for the Gross->Net visualization (operator view).
 *  Scoped to the active cycle (plus not-yet-included invoices) so demo re-runs stay clean. */
export async function getGraph() {
  const op = parties.Operator!;
  const cs = await activeContracts(op);
  const inScope = (c: Contract) =>
    activeCycleId == null || c.payload.cycleId == null || c.payload.cycleId === activeCycleId;
  const grossEdges = ofTemplate(cs, QN.IntercompanyInvoice)
    .filter(inScope)
    .map((c) => ({ from: nameOf(c.payload.issuer), to: nameOf(c.payload.payer), amount: num(c.payload.amount), currency: c.payload.currency }));
  const positions = ofTemplate(cs, QN.ApprovedNetPosition)
    .filter((c) => activeCycleId == null || c.payload.cycleId === activeCycleId)
    .map((c) => ({ subsidiary: nameOf(c.payload.subsidiary), netAmount: num(c.payload.netAmount) }));
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

/** Orchestrate a full demo cycle end-to-end (used by the boot seed and the "Run demo" button):
 *  the 20-invoice / 3-currency / 5-subsidiary dataset that nets down to 3 payments. */
export async function runDemo() {
  const tag = Date.now();
  const cycleId = `CYCLE-${tag}`;
  const invs = demoInvoices(tag);
  for (const i of invs) {
    await proposeInvoice(i.issuer, i);
    await acceptInvoice(i.payer, i.invoiceId);
  }
  await openCycle({ cycleId, participants: SUBS, fxRates: DEMO_RATES });
  const locked = await lockCycle(cycleId);
  for (const s of SUBS) await approveNetPosition(s, cycleId);
  for (const s of SUBS) await allocate(s, cycleId);
  const settled = await settle(cycleId);
  return { cycleId, reduction: { gross: invs.length, net: settled.settled }, nets: locked.nets, ...settled };
}

/** Ask the AI treasury agent to draft a netting cycle from the OPERATOR-visible invoices.
 *  Returns a proposal + rationale only — there is NO path from here to settlement. */
export async function agentPropose() {
  const op = parties.Operator!;
  const invoices = ofTemplate(await activeContracts(op), QN.IntercompanyInvoice).map((c) => ({
    invoiceId: c.payload.invoiceId,
    issuer: nameOf(c.payload.issuer),
    payer: nameOf(c.payload.payer),
    amount: num(c.payload.amount),
    currency: c.payload.currency,
  }));
  return agent.propose({ invoices, settlementCurrency: "USD" });
}
