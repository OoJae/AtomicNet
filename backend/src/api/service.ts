// Domain service: the AtomicNet operations, expressed over the JSON Ledger API.
// Reads are performed AS the relevant party so the ledger enforces privacy; writes set actAs.
// The frontend uses friendly party names ("Sub_US"); we resolve them to full ids here.
import { allocateOrReuse, submit, activeContracts, ofTemplate, type Contract } from "../ledger/client.ts";
import { T, QN, create, exercise, dec, tuple2, tuple3 } from "../ledger/templates.ts";
import { computeNetPositions, buildSettlementPlan, type Invoice, type NetPosition } from "../netting/netting.ts";
import type { FxRate } from "../netting/fx.ts";
import { demoInvoices, DEMO_RATES, DEMO_SUBS, DEMO_OPENING_DEPOSIT } from "../netting/demoData.ts";
import * as agent from "../agent/agent.ts";

const SUBS = [...DEMO_SUBS]; // Sub_US, Sub_UK, Sub_DE, Sub_FR, Sub_SG
const PARTY_NAMES = ["Operator", ...SUBS, "Bank", "Regulator"];
export const parties: Record<string, string> = {}; // friendly name -> full id
const num = (s: string) => parseFloat(s);

// On a SHARED (multi-team) participant — e.g. the hackathon's DevNet validator — party
// hints must be team-prefixed and unique across teams. PARTY_HINT_PREFIX="atomicnet-"
// allocates "Sub_US" as on-ledger hint "atomicnet-sub-us" while the app and UI keep the
// friendly names. Unset (default) keeps the plain hints for local/sandbox deployments.
const HINT_PREFIX = process.env.PARTY_HINT_PREFIX ?? "";
const HINT_SUFFIX = process.env.PARTY_HINT_SUFFIX ?? ""; // e.g. "-1" per the org's convention
const hintOf = (name: string): string =>
  HINT_PREFIX || HINT_SUFFIX
    ? `${HINT_PREFIX}${name.toLowerCase().replace(/_/g, "-")}${HINT_SUFFIX}`
    : name;

// The cycle currently being worked/demoed; views scope to it so re-runs stay clean.
let activeCycleId: string | undefined;

const DEFAULT_RATES: FxRate[] = DEMO_RATES;

// Currencies the netting service can actually convert (USD + every FX-rate leg). Inputs
// outside this set are rejected at the API boundary rather than failing deep in a submit.
const KNOWN_CURRENCIES = new Set<string>([
  "USD",
  ...DEFAULT_RATES.map((r) => r.base),
  ...DEFAULT_RATES.map((r) => r.quote),
]);

// --- Serialize ledger-mutating flows ----------------------------------------------------
// All writes go through a single in-process promise chain so overlapping HTTP calls (two
// visitors clicking "Run demo", or a click racing the boot seed) queue instead of
// interleaving and corrupting each other's cycle. Internal `*_` impls are unlocked so a
// locked flow (runDemo) can call other steps without deadlocking.
let opChain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}

export const nameOf = (id: string): string =>
  Object.entries(parties).find(([, v]) => v === id)?.[0] ?? id.split("::")[0] ?? id;

/** Resolve a friendly name (or pass through a full id) to a full party id. */
export function resolve(nameOrId: string): string {
  if (parties[nameOrId]) return parties[nameOrId]!;
  const byPrefix = Object.values(parties).find((id) => id.startsWith(nameOrId + "::"));
  return byPrefix ?? nameOrId;
}

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
  for (const n of PARTY_NAMES) parties[n] = await withRetry(`allocate ${n}`, () => allocateOrReuse(hintOf(n)));
  for (const sub of SUBS) {
    if ((await balanceOf(parties[sub]!)) === 0) {
      await submit([parties.Bank!], [
        create(T.Deposit, { bank: parties.Bank!, owner: parties[sub]!, currency: "USD", amount: dec(DEMO_OPENING_DEPOSIT) }),
      ]);
    }
  }
  // Adopt the most recent on-ledger cycle so views stay coherent after a restart. DevNet is
  // persistent, so without this a redeploy would forget activeCycleId and getGraph would merge
  // every historical cycle's invoices. (cycleId = "CYCLE-<ms timestamp>" sorts chronologically.)
  const cycleIds = ofTemplate(await activeContracts(parties.Operator!), QN.NettingCycle)
    .map((c) => String(c.payload.cycleId))
    .sort();
  if (cycleIds.length > 0) activeCycleId = cycleIds[cycleIds.length - 1];
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

/** Raw visible contract templates+counts AS a party — powers the live privacy proof. The
 *  invoice list is scoped to the active cycle (like getGraph) so the "8 of 20" proof stays
 *  coherent on a persistent ledger where a party accumulates invoices across many cycles. */
export async function getVisibility(nameOrId: string) {
  const party = resolve(nameOrId);
  const cs = await activeContracts(party);
  const byType: Record<string, number> = {};
  for (const c of cs) {
    const k = c.templateId.split(":").slice(-2).join(":");
    byType[k] = (byType[k] ?? 0) + 1;
  }
  const inScope = (c: Contract) =>
    activeCycleId == null || c.payload.cycleId == null || c.payload.cycleId === activeCycleId;
  const invoices = ofTemplate(cs, QN.IntercompanyInvoice).filter(inScope).map(money);
  return { party: nameOf(party), totalVisible: cs.length, byType, invoices };
}

// ---------------------------------------------------------------------------- invoice writes
/** Reject malformed / unsupported invoice inputs at the boundary (unauthenticated callers). */
function validateInvoiceInput(body: { payer: string; amount: number; currency: string; invoiceId: string }): void {
  if (!body || typeof body !== "object") throw new Error("invoice body is required");
  if (!body.payer) throw new Error("payer is required");
  if (typeof body.invoiceId !== "string" || body.invoiceId.length === 0 || body.invoiceId.length > 128)
    throw new Error("invoiceId must be a non-empty string (<=128 chars)");
  if (typeof body.currency !== "string" || !KNOWN_CURRENCIES.has(body.currency))
    throw new Error(`unsupported currency: ${body.currency} (supported: ${[...KNOWN_CURRENCIES].join(", ")})`);
  if (!Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1e12)
    throw new Error("amount must be a positive, finite number");
}

async function proposeInvoiceImpl(issuerName: string, body: { payer: string; amount: number; currency: string; invoiceId: string; dueDate?: string }) {
  validateInvoiceInput(body);
  const issuer = resolve(issuerName);
  await submit([issuer], [create(T.InvoiceProposal, {
    operator: parties.Operator!, issuer, payer: resolve(body.payer),
    amount: dec(body.amount), currency: body.currency, invoiceId: body.invoiceId,
    dueDate: body.dueDate ?? "2026-07-01",
  })]);
  return { ok: true };
}
export const proposeInvoice = (issuerName: string, body: { payer: string; amount: number; currency: string; invoiceId: string; dueDate?: string }) =>
  withLock(() => proposeInvoiceImpl(issuerName, body));

async function acceptInvoiceImpl(payerName: string, invoiceId: string) {
  const payer = resolve(payerName);
  const prop = await find(payer, QN.InvoiceProposal, (p) => p.invoiceId === invoiceId);
  if (!prop) throw new Error(`no proposal ${invoiceId} for ${payerName}`);
  await submit([payer], [exercise(T.InvoiceProposal, prop.contractId, "AcceptInvoice", {})]);
  return { ok: true };
}
export const acceptInvoice = (payerName: string, invoiceId: string) => withLock(() => acceptInvoiceImpl(payerName, invoiceId));

// ---------------------------------------------------------------------------- cycle
async function openCycleImpl(body: { cycleId: string; participants?: string[]; settlementCurrency?: string; fxRates?: FxRate[] }) {
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
export const openCycle = (body: { cycleId: string; participants?: string[]; settlementCurrency?: string; fxRates?: FxRate[] }) =>
  withLock(() => openCycleImpl(body));

/** Include this cycle's accepted invoices, lock the cycle, compute nets, create NetPositions.
 *  Scoped + idempotent: only invoices raised for THIS cycle are swept (so a prior partial run
 *  can't leak orphan invoices into the next), the empty-set guard runs BEFORE any side effect,
 *  and NetPositions are created only for subsidiaries that don't already have one. */
async function lockCycleImpl(cycleId: string) {
  const op = parties.Operator!;
  const cycle = await find(op, QN.NettingCycle, (p) => p.cycleId === cycleId);
  if (!cycle) throw new Error(`no cycle ${cycleId}`);
  const participants: string[] = cycle.payload.participants;
  const rates: FxRate[] = (cycle.payload.fxRates as any[]).map((r) => ({ base: r.base, quote: r.quote, rate: num(r.rate) }));
  const settlementCurrency: string = cycle.payload.settlementCurrency;

  // Scope to invoices actually raised for this cycle. runDemo tags each invoiceId with the
  // cycle's tag (cycleId "CYCLE-<tag>" ; invoiceId "...-<tag>"), so a strict suffix match
  // includes exactly this run's invoices and nothing orphaned from an earlier one.
  const tag = cycleId.startsWith("CYCLE-") ? cycleId.slice("CYCLE-".length) : undefined;
  const isParticipant = (id: string) => participants.includes(id);
  const eligible = ofTemplate(await activeContracts(op), QN.IntercompanyInvoice).filter(
    (c) =>
      isParticipant(c.payload.issuer) &&
      isParticipant(c.payload.payer) &&
      c.payload.cycleId == null &&
      (tag == null || String(c.payload.invoiceId).endsWith(`-${tag}`)),
  );

  // Guard BEFORE any IncludeInCycle/LockCycle side effect, so an empty cycle stays clean.
  if (eligible.length === 0) throw new Error(`no eligible invoices to include in ${cycleId}`);

  const invoices: Invoice[] = eligible.map((c) => ({
    issuer: c.payload.issuer, payer: c.payload.payer, amount: num(c.payload.amount), currency: c.payload.currency,
  }));
  const nets = computeNetPositions(invoices, rates, settlementCurrency);

  for (const inv of eligible) {
    await submit([op], [exercise(T.IntercompanyInvoice, inv.contractId, "IncludeInCycle", { inCycleId: cycleId })]);
  }
  await submit([op], [exercise(T.NettingCycle, cycle.contractId, "LockCycle", {})]);

  // Create NetPositions idempotently: skip subs that already have one (safe to retry).
  const already = new Set(
    [
      ...ofTemplate(await activeContracts(op), QN.NetPosition),
      ...ofTemplate(await activeContracts(op), QN.ApprovedNetPosition),
    ]
      .filter((c) => c.payload.cycleId === cycleId)
      .map((c) => c.payload.subsidiary),
  );
  for (const n of nets) {
    if (already.has(n.party)) continue;
    await submit([op], [create(T.NetPosition, {
      operator: op, subsidiary: n.party, regulator: parties.Regulator!, cycleId,
      settlementCurrency, netAmount: dec(n.netAmount),
    })]);
  }
  return { ok: true, nets: nets.map((n) => ({ subsidiary: nameOf(n.party), netAmount: n.netAmount })) };
}
export const lockCycle = (cycleId: string) => withLock(() => lockCycleImpl(cycleId));

async function approveNetPositionImpl(subName: string, cycleId: string) {
  const sub = resolve(subName);
  const np = await find(sub, QN.NetPosition, (p) => p.subsidiary === sub && p.cycleId === cycleId);
  if (!np) throw new Error(`no net position for ${subName} in ${cycleId}`);
  await submit([sub], [exercise(T.NetPosition, np.contractId, "ApproveNetPosition", {})]);
  return { ok: true };
}
export const approveNetPosition = (subName: string, cycleId: string) => withLock(() => approveNetPositionImpl(subName, cycleId));

/** A net payer earmarks funds for the cycle — ONE allocation per planned transfer (the
 *  institutional pattern: reserve per payment instruction), so settle() can match each
 *  transfer to a co-signed allocation exactly. No-op for receivers / zero-net parties.
 *  The plan is deterministic from the approved positions, so settle() recomputes it. */
async function allocateImpl(subName: string, cycleId: string) {
  const sub = resolve(subName);
  const approved = ofTemplate(await activeContracts(parties.Operator!), QN.ApprovedNetPosition).filter((c) => c.payload.cycleId === cycleId);
  const plan = buildSettlementPlan(approved.map((c) => ({ party: c.payload.subsidiary, netAmount: num(c.payload.netAmount) })));
  const myTransfers = plan.transfers.filter((t) => resolve(t.payer) === sub);
  let total = 0;
  for (const t of myTransfers) {
    const dep = await find(sub, QN.Deposit, (p) => p.owner === sub && p.currency === "USD" && num(p.amount) >= t.amount);
    if (!dep) throw new Error(`${subName} has insufficient USD to allocate ${t.amount}`);
    await submit([sub], [exercise(T.Deposit, dep.contractId, "Allocate", { operator: parties.Operator!, allocAmount: dec(t.amount), cycleId })]);
    total += t.amount;
  }
  return { ok: true, allocated: total, allocations: myTransfers.length };
}
export const allocate = (subName: string, cycleId: string) => withLock(() => allocateImpl(subName, cycleId));

/** Operator gathers allocations, builds the plan from approved positions, executes atomically.
 *  The SettlementBatch now carries the Locked cycle + the on-ledger approvals; ExecuteSettlement
 *  re-checks conservation and cycle/currency earmarks on-ledger (see Settlement.daml). */
async function settleImpl(cycleId: string) {
  const op = parties.Operator!;
  const cs = await activeContracts(op); // one consistent snapshot for cycle + approvals + allocations
  const cycle = ofTemplate(cs, QN.NettingCycle).find((c) => c.payload.cycleId === cycleId);
  if (!cycle) throw new Error(`no cycle ${cycleId} to settle`);
  const approved = ofTemplate(cs, QN.ApprovedNetPosition).filter((c) => c.payload.cycleId === cycleId);
  if (approved.length === 0) throw new Error(`no approved net positions for ${cycleId}`);
  const nets: NetPosition[] = approved.map((c) => ({ party: c.payload.subsidiary, netAmount: num(c.payload.netAmount) }));
  const plan = buildSettlementPlan(nets);

  const allocs = ofTemplate(cs, QN.DepositAllocation).filter((c) => c.payload.cycleId === cycleId);
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
    cycle: cycle.contractId,                      // the Locked cycle (on-ledger state gate)
    approvals: approved.map((c) => c.contractId), // every subsidiary's co-signed approval
  })]);
  const batch = await find(op, QN.SettlementBatch, (p) => p.cycleId === cycleId);
  await submit([op], [exercise(T.SettlementBatch, batch!.contractId, "ExecuteSettlement", {})]);
  const balances = Object.fromEntries(await Promise.all(SUBS.map(async (s) => [s, await balanceOf(parties[s]!)])));
  return { ok: true, settled: plan.transfers.length, balances };
}
export const settle = (cycleId: string) => withLock(() => settleImpl(cycleId));

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
 *  Scoped to the active cycle (plus not-yet-included invoices) so demo re-runs stay clean.
 *  Returns activeCycleId so the frontend can hydrate the seeded cycle on first load. */
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
  return { activeCycleId, grossEdges, positions, netEdges: plan.transfers, reduction: { gross: grossEdges.length, net: plan.transfers.length } };
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
 *  the 20-invoice / 3-currency / 5-subsidiary dataset that nets down to 3 payments. Runs under
 *  the write-lock as a single unit (its internal steps call the unlocked impls). */
async function runDemoImpl() {
  const tag = Date.now();
  const cycleId = `CYCLE-${tag}`;
  const invs = demoInvoices(tag);
  for (const i of invs) {
    await proposeInvoiceImpl(i.issuer, i);
    await acceptInvoiceImpl(i.payer, i.invoiceId);
  }
  await openCycleImpl({ cycleId, participants: SUBS, fxRates: DEMO_RATES });
  const locked = await lockCycleImpl(cycleId);
  for (const s of SUBS) await approveNetPositionImpl(s, cycleId);
  for (const s of SUBS) await allocateImpl(s, cycleId);
  const settled = await settleImpl(cycleId);
  return { cycleId, reduction: { gross: invs.length, net: settled.settled }, nets: locked.nets, ...settled };
}
export const runDemo = () => withLock(runDemoImpl);

/** Ask the AI treasury agent to draft a netting cycle from a COMPACT summary of the
 *  operator-visible netting analysis (net positions + reduction, computed by the netting
 *  service). Returns a proposal + rationale only — there is NO path from here to settlement. */
export async function agentPropose() {
  const op = parties.Operator!;
  const cs = await activeContracts(op);
  const inScope = (c: Contract) => activeCycleId == null || c.payload.cycleId == null || c.payload.cycleId === activeCycleId;
  const invoices: Invoice[] = ofTemplate(cs, QN.IntercompanyInvoice)
    .filter(inScope)
    .map((c) => ({ issuer: nameOf(c.payload.issuer), payer: nameOf(c.payload.payer), amount: num(c.payload.amount), currency: c.payload.currency }));
  const nets = computeNetPositions(invoices, DEFAULT_RATES, "USD");
  const plan = buildSettlementPlan(nets);
  return agent.propose({
    invoiceCount: invoices.length,
    currencies: [...new Set(invoices.map((i) => i.currency))].sort(),
    settlementCurrency: "USD",
    fxRates: DEFAULT_RATES,
    netPositions: nets.map((n) => ({ party: nameOf(n.party), netUsd: n.netAmount })),
    reduction: { gross: invoices.length, net: plan.transfers.length },
  });
}
