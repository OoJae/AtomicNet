// Proves the demo dataset's headline claims via the REAL netting service:
// 20 gross invoices, 3 currencies, Sigma net == 0, Sub_SG nets to exactly zero,
// and the settlement plan collapses to exactly 3 net payments (20 -> 3).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeNetPositions, buildSettlementPlan, reductionRatio } from "./netting.ts";
import { demoInvoices, DEMO_RATES, DEMO_SETTLEMENT_CURRENCY, DEMO_SUBS, DEMO_OPENING_DEPOSIT } from "./demoData.ts";

const invoices = demoInvoices("TEST");
const nets = computeNetPositions(invoices, DEMO_RATES, DEMO_SETTLEMENT_CURRENCY);
const byParty = Object.fromEntries(nets.map((n) => [n.party, n.netAmount]));
const plan = buildSettlementPlan(nets);

describe("demo dataset (the 20->3 headline)", () => {
  it("has 20 invoices across exactly 3 currencies among 5 subsidiaries", () => {
    assert.equal(invoices.length, 20);
    assert.deepEqual([...new Set(invoices.map((i) => i.currency))].sort(), ["EUR", "GBP", "USD"]);
    const partiesInvolved = new Set(invoices.flatMap((i) => [i.issuer, i.payer]));
    assert.deepEqual([...partiesInvolved].sort(), [...DEMO_SUBS].sort());
  });

  it("nets to the engineered positions with Sigma == 0", () => {
    assert.equal(byParty["Sub_US"], -700);
    assert.equal(byParty["Sub_UK"], 500);
    assert.equal(byParty["Sub_DE"], -300);
    assert.equal(byParty["Sub_FR"], 500);
    assert.equal(nets.reduce((a, n) => a + n.netAmount, 0), 0);
  });

  it("Sub_SG nets to exactly ZERO (owed as much as it owes)", () => {
    assert.equal(byParty["Sub_SG"], 0);
    // ...even though SG appears on 9 invoices
    assert.ok(invoices.filter((i) => i.issuer === "Sub_SG" || i.payer === "Sub_SG").length >= 8);
  });

  it("collapses to EXACTLY 3 net payments (20 -> 3)", () => {
    assert.equal(plan.transfers.length, 3);
    const r = reductionRatio(invoices, plan);
    assert.deepEqual(r, { gross: 20, net: 3 });
    // conservation at the plan level
    const totalIn = plan.transfers.reduce((a, t) => a + t.amount, 0);
    const totalOut = plan.payouts.reduce((a, p) => a + p.amount, 0);
    assert.equal(totalIn, totalOut);
    assert.equal(totalIn, 1000); // 500 to FR + 500 to UK
  });

  it("opening deposits cover every payer's |net|", () => {
    for (const n of nets) assert.ok(-n.netAmount <= DEMO_OPENING_DEPOSIT, `${n.party} covered`);
  });
});
