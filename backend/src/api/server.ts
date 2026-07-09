// AtomicNet backend HTTP API (Hono). Thin bridge: routes map to ledger operations; reads
// are performed AS the path's party so the LEDGER enforces privacy (the backend has none).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import * as svc from "./service.ts";

const app = new Hono();
app.use("/*", cors());

// Write-lock: on a PUBLICLY-exposed deploy that drives REAL shared-network parties (the
// DevNet service), set WRITE_MODE=locked so the internet can VIEW the live ledger but cannot
// drive our parties / burn synchronizer traffic / trigger billable agent calls. Mutating
// requests then require the x-atomicnet-key header to match WRITE_SECRET. Unset (default) =
// fully open, for the self-contained sandbox demo and local dev.
const WRITE_LOCKED = process.env.WRITE_MODE === "locked";
const WRITE_SECRET = process.env.WRITE_SECRET ?? "";
app.use("/api/*", async (c, next) => {
  const mutating = c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "DELETE";
  if (WRITE_LOCKED && mutating && c.req.header("x-atomicnet-key") !== WRITE_SECRET) {
    return c.json({ error: "read-only: writes are disabled on this deployment" }, 403);
  }
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true, writeLocked: WRITE_LOCKED }));
app.get("/api/config", (c) => c.json({ writeLocked: WRITE_LOCKED }));
app.get("/api/parties", (c) => c.json(svc.getParties()));

// Per-party reads (the ledger filters by stakeholder).
app.get("/api/p/:party/dashboard", async (c) => c.json(await svc.getDashboard(c.req.param("party"))));
app.get("/api/p/:party/visibility", async (c) => c.json(await svc.getVisibility(c.req.param("party"))));

// Invoice writes (propose as issuer; accept as payer).
app.post("/api/p/:party/invoices/propose", async (c) => c.json(await svc.proposeInvoice(c.req.param("party"), await c.req.json())));
app.post("/api/p/:party/invoices/:id/accept", async (c) => c.json(await svc.acceptInvoice(c.req.param("party"), c.req.param("id"))));

// Cycle lifecycle (operator) + subsidiary approve/allocate.
app.post("/api/cycle/open", async (c) => c.json(await svc.openCycle(await c.req.json())));
app.post("/api/cycle/:id/lock", async (c) => c.json(await svc.lockCycle(c.req.param("id"))));
app.post("/api/p/:party/cycle/:id/approve", async (c) => c.json(await svc.approveNetPosition(c.req.param("party"), c.req.param("id"))));
app.post("/api/p/:party/cycle/:id/allocate", async (c) => c.json(await svc.allocate(c.req.param("party"), c.req.param("id"))));
app.post("/api/cycle/:id/settle", async (c) => c.json(await svc.settle(c.req.param("id"))));
app.get("/api/cycle/:id", async (c) => c.json(await svc.getCycle(c.req.param("id"))));

// Views.
app.get("/api/graph", async (c) => c.json(await svc.getGraph()));
app.get("/api/audit", async (c) => c.json(await svc.getAudit()));

// AI treasury agent: positions in -> proposal + rationale out (it proposes, never settles).
app.post("/api/agent/propose", async (c) => c.json(await svc.agentPropose()));

// Demo orchestration (full cycle end to end).
app.post("/api/demo/run", async (c) => c.json(await svc.runDemo()));

app.onError((err, c) => {
  // Log the full error server-side; return a generic message so anonymous public callers
  // don't get raw ledger/OAuth/agent internals echoed back.
  console.error("[api error]", err);
  const msg = String((err as Error)?.message ?? err);
  // Client-actionable validation messages are safe to surface; everything else is opaque.
  const safe = /^(invoice|amount|payer|invoiceId|unsupported|no eligible|no cycle|no proposal|no net position|no approved|missing allocation|read-only)/i.test(msg);
  return c.json({ error: safe ? msg : "internal error" }, 500);
});

// In production, serve the built frontend from the same origin (no proxy / CORS needed).
const dist = process.env.FRONTEND_DIST;
if (dist) {
  app.use("/assets/*", serveStatic({ root: dist }));
  app.use("/*", serveStatic({ root: dist }));
  app.get("*", serveStatic({ path: `${dist}/index.html` })); // SPA fallback
}

const port = Number(process.env.PORT ?? 8080);
console.log("AtomicNet backend: bootstrapping ledger (allocating parties, seeding deposits)...");
await svc.bootstrap();
console.log(`AtomicNet backend listening on :${port}` + (dist ? " (serving frontend + API)" : ""));
serve({ fetch: app.fetch, port });
// Seed the 20-invoice demo cycle AFTER the server is up (it's ~70 ledger commands);
// the UI fills in live as the seed progresses.
if (process.env.SEED_DEMO === "1") {
  svc
    .runDemo()
    .then((r) => console.log("seeded demo cycle:", r.cycleId, "reduction", r.reduction, r.balances))
    .catch((e) => console.error("demo seed failed (non-fatal):", (e as Error)?.message ?? e));
}
