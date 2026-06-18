// Inviolable rule #3: the agent proposes; it never settles. This test asserts there is NO
// code path from the agent module to settlement — it imports no ledger/settlement code and
// references no settlement template or choice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("agent.ts has NO settlement path (proposes, never settles)", () => {
  const src = readFileSync(new URL("./agent.ts", import.meta.url), "utf8");
  const banned = [
    "ExecuteSettlement",
    "SettlementBatch",
    "../ledger",
    "../api/service",
    "submit(",
    "Disburse",
  ];
  for (const token of banned) {
    assert.ok(!src.includes(token), `agent.ts must not reference "${token}" — no path to settlement`);
  }
});
