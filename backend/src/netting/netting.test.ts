// Run with `pnpm test` (Node's built-in test runner + native TypeScript; zero runtime deps).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convert, type FxRate } from "./fx.ts";
import {
  assertConserved,
  buildSettlementPlan,
  computeNetPositions,
  reductionRatio,
  type Invoice,
  type NetPosition,
} from "./netting.ts";

const rates: FxRate[] = [
  { base: "EUR", quote: "USD", rate: 1.1 },
  { base: "GBP", quote: "USD", rate: 1.25 },
];

// Mirrors the Daml MultiCurrency test: US owes UK 1000 USD; DE owes US 500 EUR (=550);
// UK owes DE 400 GBP (=500). Nets: US -450, UK +500, DE -50.
const invoices: Invoice[] = [
  { issuer: "Sub_UK", payer: "Sub_US", amount: 1000, currency: "USD" },
  { issuer: "Sub_US", payer: "Sub_DE", amount: 500, currency: "EUR" },
  { issuer: "Sub_DE", payer: "Sub_UK", amount: 400, currency: "GBP" },
];

describe("fx.convert", () => {
  it("is identity for the same currency", () => {
    assert.equal(convert(rates, "USD", "USD", 1000), 1000);
  });
  it("applies the rate", () => {
    assert.ok(Math.abs(convert(rates, "EUR", "USD", 500) - 550) < 1e-9);
    assert.ok(Math.abs(convert(rates, "GBP", "USD", 400) - 500) < 1e-9);
  });
  it("throws on a missing rate", () => {
    assert.throws(() => convert(rates, "JPY", "USD", 1), /no FX rate/);
  });
});

describe("computeNetPositions", () => {
  it("nets multi-currency invoices to USD with sum == 0", () => {
    const nets = computeNetPositions(invoices, rates, "USD");
    const byParty = Object.fromEntries(nets.map((n) => [n.party, n.netAmount]));
    assert.equal(byParty["Sub_US"], -450);
    assert.equal(byParty["Sub_UK"], 500);
    assert.equal(byParty["Sub_DE"], -50);
    assert.equal(
      nets.reduce((a, n) => a + n.netAmount, 0),
      0,
    );
  });
});

describe("assertConserved", () => {
  it("accepts a balanced set", () => {
    assert.doesNotThrow(() => assertConserved(computeNetPositions(invoices, rates, "USD")));
  });
  it("rejects a tampered (non-zero-sum) set", () => {
    const tampered: NetPosition[] = [
      { party: "Sub_US", netAmount: -450 },
      { party: "Sub_UK", netAmount: 500 },
      { party: "Sub_DE", netAmount: -49 }, // should be -50
    ];
    assert.throws(() => assertConserved(tampered), /conservation/);
  });
});

describe("buildSettlementPlan", () => {
  it("routes payers to receivers so each receiver nets its position", () => {
    const plan = buildSettlementPlan(computeNetPositions(invoices, rates, "USD"));
    const ukReceived = plan.transfers
      .filter((t) => t.receiver === "Sub_UK")
      .reduce((a, t) => a + t.amount, 0);
    assert.equal(ukReceived, 500);
    const totalIn = plan.transfers.reduce((a, t) => a + t.amount, 0);
    const totalOut = plan.payouts.reduce((a, p) => a + p.amount, 0);
    assert.equal(totalIn, totalOut);
  });
  it("reports the reduction ratio (gross invoices -> net payments)", () => {
    const nets = computeNetPositions(invoices, rates, "USD");
    const r = reductionRatio(invoices, buildSettlementPlan(nets));
    assert.equal(r.gross, 3);
    assert.equal(r.net, 2); // US->UK and DE->UK
  });
});
