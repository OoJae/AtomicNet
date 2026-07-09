// Inviolable rule #3, proven BEHAVIORALLY (not just lexically): running the real agentPropose()
// seam issues reads only — never a ledger write. We intercept global fetch and assert no request
// ever hits the command-submission endpoint (/v2/commands/submit-and-wait), while the agent's
// chat endpoint IS called. This catches a future regression even if service.ts (not agent.ts)
// were wired to settle off an agent proposal.
import { test } from "node:test";
import assert from "node:assert/strict";

test("agentPropose() issues no ledger writes — reads + agent call only", async () => {
  // Must be set BEFORE importing the modules (client.ts/agent.ts read env at load time).
  process.env.AGENT_API_KEY = "test-key";
  process.env.JSON_API_URL = "http://mock-ledger";

  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { method?: string }) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (u.includes("/chat/completions")) {
      const content = JSON.stringify({
        rationale: "run the cycle",
        proposal: { participants: [], settlementCurrency: "USD", fxRates: [], expectedReduction: { gross: 0, net: 0 } },
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }
    if (u.includes("/v2/state/ledger-end")) return new Response(JSON.stringify({ offset: 1 }), { status: 200 });
    if (u.includes("/v2/state/active-contracts")) return new Response(JSON.stringify([]), { status: 200 });
    // Any command submission would be a WRITE — recorded, and asserted to never happen.
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  try {
    const svc = await import("../api/service.ts");
    await svc.agentPropose();
    const writes = calls.filter((c) => c.includes("/v2/commands") || c.includes("submit-and-wait"));
    assert.equal(writes.length, 0, `agentPropose must issue no ledger writes; observed: ${writes.join(" | ")}`);
    assert.ok(calls.some((c) => c.includes("/chat/completions")), "agent chat endpoint should have been called");
  } finally {
    globalThis.fetch = realFetch;
  }
});
