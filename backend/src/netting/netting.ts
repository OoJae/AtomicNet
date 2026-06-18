// AtomicNet netting service: convert multi-currency invoices to the settlement currency,
// compute each party's net position, assert conservation (Sigma net == 0), and build a
// minimal payer->receiver settlement plan that the Daml SettlementBatch will execute.
//
// Money is handled in integer minor units (cents) internally to avoid float drift, so the
// conservation check is exact — mirroring the Daml model's exact Numeric arithmetic.
import { convert, type FxRate } from "./fx.ts";

export interface Invoice {
  issuer: string; // the entity OWED money (receivable)
  payer: string; // the entity that OWES money (payable)
  amount: number;
  currency: string;
}

export interface NetPosition {
  party: string;
  netAmount: number; // settlement currency; > 0 receives, < 0 pays
}

export interface Transfer {
  payer: string;
  receiver: string;
  amount: number;
}

export interface Payout {
  receiver: string;
  amount: number;
}

export interface SettlementPlan {
  transfers: Transfer[];
  payouts: Payout[];
}

const toCents = (x: number): number => Math.round(x * 100);
const fromCents = (c: number): number => c / 100;

/** Throw unless the net positions sum to exactly zero (the Sigma-net invariant). */
export function assertConserved(nets: NetPosition[], settlementCurrency = "USD"): void {
  const totalCents = nets.reduce((acc, n) => acc + toCents(n.netAmount), 0);
  if (totalCents !== 0) {
    throw new Error(
      `conservation violated: net positions sum to ${fromCents(totalCents)} ${settlementCurrency}, expected 0`,
    );
  }
}

/** Compute each party's net position in the settlement currency. Asserts Sigma net == 0. */
export function computeNetPositions(
  invoices: Invoice[],
  rates: FxRate[],
  settlementCurrency: string,
): NetPosition[] {
  const cents = new Map<string, number>();
  const bump = (party: string, c: number): void => {
    cents.set(party, (cents.get(party) ?? 0) + c);
  };
  for (const inv of invoices) {
    const c = toCents(convert(rates, inv.currency, settlementCurrency, inv.amount));
    bump(inv.issuer, c); // issuer is owed -> receives
    bump(inv.payer, -c); // payer owes -> pays
  }
  const nets = [...cents.entries()]
    .map(([party, c]) => ({ party, netAmount: fromCents(c) }))
    .sort((a, b) => a.party.localeCompare(b.party));
  assertConserved(nets, settlementCurrency);
  return nets;
}

/** Build a minimal payer->receiver settlement plan (greedy fill). */
export function buildSettlementPlan(nets: NetPosition[]): SettlementPlan {
  const payers = nets
    .filter((n) => n.netAmount < 0)
    .map((n) => ({ party: n.party, cents: toCents(-n.netAmount) }));
  const receivers = nets
    .filter((n) => n.netAmount > 0)
    .map((n) => ({ party: n.party, cents: toCents(n.netAmount) }));

  const transfers: Transfer[] = [];
  let pi = 0;
  let ri = 0;
  while (pi < payers.length && ri < receivers.length) {
    const payer = payers[pi]!;
    const receiver = receivers[ri]!;
    const pay = Math.min(payer.cents, receiver.cents);
    if (pay > 0) {
      transfers.push({ payer: payer.party, receiver: receiver.party, amount: fromCents(pay) });
    }
    payer.cents -= pay;
    receiver.cents -= pay;
    if (payer.cents === 0) pi++;
    if (receiver.cents === 0) ri++;
  }

  const payouts: Payout[] = nets
    .filter((n) => n.netAmount > 0)
    .map((n) => ({ receiver: n.party, amount: n.netAmount }));

  return { transfers, payouts };
}

/** Headline metric: gross invoice count -> net payment (transfer) count. */
export function reductionRatio(
  invoices: Invoice[],
  plan: SettlementPlan,
): { gross: number; net: number } {
  return { gross: invoices.length, net: plan.transfers.length };
}
