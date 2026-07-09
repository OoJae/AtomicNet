// The landing constellation renders the REAL demo dataset — the same 20 invoices the live
// console raises (source of truth: backend/src/netting/demoData.ts). issuer is OWED; payer
// OWES; the rendered thread runs payer → issuer (the direction money would move).
export type Ccy = "USD" | "EUR" | "GBP";
export interface Flow {
  payer: string;
  issuer: string;
  ccy: Ccy;
  usd: number; // USD-equivalent, drives thread weight
}

export const NODES = ["US", "UK", "DE", "FR", "SG"] as const;
export type NodeId = (typeof NODES)[number];

export const FLOWS: Flow[] = [
  // US owes (out 1500)
  { payer: "US", issuer: "UK", ccy: "USD", usd: 500 },
  { payer: "US", issuer: "UK", ccy: "GBP", usd: 300 },
  { payer: "US", issuer: "FR", ccy: "EUR", usd: 220 },
  { payer: "US", issuer: "FR", ccy: "USD", usd: 180 },
  { payer: "US", issuer: "SG", ccy: "USD", usd: 300 },
  // UK owes (out 900)
  { payer: "UK", issuer: "US", ccy: "USD", usd: 400 },
  { payer: "UK", issuer: "DE", ccy: "USD", usd: 300 },
  { payer: "UK", issuer: "SG", ccy: "GBP", usd: 200 },
  // DE owes (out 1200)
  { payer: "DE", issuer: "FR", ccy: "EUR", usd: 330 },
  { payer: "DE", issuer: "FR", ccy: "USD", usd: 270 },
  { payer: "DE", issuer: "UK", ccy: "GBP", usd: 400 },
  { payer: "DE", issuer: "SG", ccy: "GBP", usd: 200 },
  // FR owes (out 600)
  { payer: "FR", issuer: "US", ccy: "USD", usd: 200 },
  { payer: "FR", issuer: "DE", ccy: "USD", usd: 300 },
  { payer: "FR", issuer: "SG", ccy: "USD", usd: 100 },
  // SG owes (out 800) — and is owed 800: nets to exactly ZERO
  { payer: "SG", issuer: "US", ccy: "USD", usd: 200 },
  { payer: "SG", issuer: "UK", ccy: "GBP", usd: 100 },
  { payer: "SG", issuer: "UK", ccy: "USD", usd: 100 },
  { payer: "SG", issuer: "DE", ccy: "USD", usd: 300 },
  { payer: "SG", issuer: "FR", ccy: "USD", usd: 100 },
];

// Net result (proven by demoData.test.ts): US −700 · UK +500 · DE −300 · FR +500 · SG 0
// Greedy routing → exactly three wires:
export const NET_ARCS: { payer: NodeId; receiver: NodeId; usd: number }[] = [
  { payer: "DE", receiver: "FR", usd: 300 },
  { payer: "US", receiver: "FR", usd: 200 },
  { payer: "US", receiver: "UK", usd: 500 },
];

/** During THE COLLAPSE, threads from net payers merge into their arc; every other thread
 *  dissolves — its value cancels inside the netting. Returns the arc index or -1 (dissolve). */
export function arcFor(flow: Flow, index: number): number {
  if (flow.payer === "DE") return 0;
  if (flow.payer === "US") return index % 2 === 0 ? 2 : 1; // split US threads across its two arcs
  return -1;
}

export const CCY_COLOR: Record<Ccy, number> = {
  USD: 0x4d7cff,
  EUR: 0xa78bfa,
  GBP: 0x2dd4bf,
};
