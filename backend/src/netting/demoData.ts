// The demo dataset: 5 subsidiaries, 20 intercompany invoices across 3 currencies,
// engineered so the netting collapses 20 gross cross-currency payments into exactly
// 3 net payments (the headline reduction), with one entity (Sub_SG) netting to ZERO.
//
// USD-equivalent nets: US -700, UK +500, DE -300, FR +500, SG 0  (Sigma = 0).
// Greedy routing => DE->FR 300, US->FR 200, US->UK 500  (3 transfers).
// Every EUR/GBP amount converts to an exact USD value at the fixed demo rates,
// so conservation holds exactly (no rounding residue).
// Proven by demoData.test.ts against the real netting service — not eyeballed.
import type { FxRate } from "./fx.ts";
import type { Invoice } from "./netting.ts";

export interface DemoInvoice extends Invoice {
  invoiceId: string;
}

export const DEMO_SUBS = ["Sub_US", "Sub_UK", "Sub_DE", "Sub_FR", "Sub_SG"] as const;

export const DEMO_RATES: FxRate[] = [
  { base: "EUR", quote: "USD", rate: 1.1 },
  { base: "GBP", quote: "USD", rate: 1.25 },
];

/** issuer is OWED; payer OWES. USD-equivalents noted per line. */
const FLOWS: Invoice[] = [
  // US owes (out 1500)
  { issuer: "Sub_UK", payer: "Sub_US", amount: 500, currency: "USD" }, // 500
  { issuer: "Sub_UK", payer: "Sub_US", amount: 240, currency: "GBP" }, // 300
  { issuer: "Sub_FR", payer: "Sub_US", amount: 200, currency: "EUR" }, // 220
  { issuer: "Sub_FR", payer: "Sub_US", amount: 180, currency: "USD" }, // 180
  { issuer: "Sub_SG", payer: "Sub_US", amount: 300, currency: "USD" }, // 300
  // UK owes (out 900)
  { issuer: "Sub_US", payer: "Sub_UK", amount: 400, currency: "USD" }, // 400
  { issuer: "Sub_DE", payer: "Sub_UK", amount: 300, currency: "USD" }, // 300
  { issuer: "Sub_SG", payer: "Sub_UK", amount: 160, currency: "GBP" }, // 200
  // DE owes (out 1200)
  { issuer: "Sub_FR", payer: "Sub_DE", amount: 300, currency: "EUR" }, // 330
  { issuer: "Sub_FR", payer: "Sub_DE", amount: 270, currency: "USD" }, // 270
  { issuer: "Sub_UK", payer: "Sub_DE", amount: 320, currency: "GBP" }, // 400
  { issuer: "Sub_SG", payer: "Sub_DE", amount: 160, currency: "GBP" }, // 200
  // FR owes (out 600)
  { issuer: "Sub_US", payer: "Sub_FR", amount: 200, currency: "USD" }, // 200
  { issuer: "Sub_DE", payer: "Sub_FR", amount: 300, currency: "USD" }, // 300
  { issuer: "Sub_SG", payer: "Sub_FR", amount: 100, currency: "USD" }, // 100
  // SG owes (out 800) — and is owed 800, netting to exactly ZERO
  { issuer: "Sub_US", payer: "Sub_SG", amount: 200, currency: "USD" }, // 200
  { issuer: "Sub_UK", payer: "Sub_SG", amount: 80, currency: "GBP" }, //  100
  { issuer: "Sub_UK", payer: "Sub_SG", amount: 100, currency: "USD" }, // 100
  { issuer: "Sub_DE", payer: "Sub_SG", amount: 300, currency: "USD" }, // 300
  { issuer: "Sub_FR", payer: "Sub_SG", amount: 100, currency: "USD" }, // 100
];

/** Materialize the demo invoices with per-run unique invoice ids. */
export function demoInvoices(tag: string | number): DemoInvoice[] {
  return FLOWS.map((f, i) => ({
    ...f,
    invoiceId: `INV-${String(i + 1).padStart(2, "0")}-${f.payer.replace("Sub_", "")}>${f.issuer.replace("Sub_", "")}-${tag}`,
  }));
}

export const DEMO_SETTLEMENT_CURRENCY = "USD";
/** Opening USD deposit per subsidiary (covers the largest |net| of 700 with headroom). */
export const DEMO_OPENING_DEPOSIT = 2000;
