import { useEffect, useState } from "react";
import { api, signed, type CycleView } from "../api";
import { useAsync } from "../useApi";
import { AgentPanel } from "./AgentPanel";
import { ErrorBanner } from "./ErrorBanner";

export function OperatorConsole({ cycleId, setCycleId, refresh, bump, readOnly }: { cycleId?: string; setCycleId: (id: string) => void; refresh: number; bump: () => void; readOnly: boolean }) {
  const { data: cycle } = useAsync<CycleView | undefined>(() => (cycleId ? api.cycle(cycleId) : Promise.resolve(undefined)), [cycleId, refresh]);
  const [busyAction, setBusyAction] = useState<string>();
  const [err, setErr] = useState<string>();
  const busy = busyAction !== undefined;

  // While a long op runs (a DevNet cycle is ~minutes of ledger round-trips), poll so the
  // console fills in incrementally — adopting the server's cycle id the moment it opens — so
  // the run never reads as frozen.
  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(async () => {
      try {
        const g = await api.graph();
        if (g.activeCycleId && g.activeCycleId !== cycleId) setCycleId(g.activeCycleId);
      } catch {
        /* transient — keep polling */
      }
      bump();
    }, 3500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, cycleId]);

  async function run<T>(action: string, p: Promise<T>): Promise<T | undefined> {
    setBusyAction(action);
    setErr(undefined);
    try {
      return await p;
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusyAction(undefined);
      bump();
    }
  }
  async function demo() {
    const r = await run("demo", api.runDemo());
    if (r) setCycleId(r.cycleId);
  }
  async function stage() {
    const r = await run("prepare", api.prepareCycle());
    if (r) setCycleId(r.cycleId);
  }

  const settled = cycle?.status === "Settled";

  return (
    <div className="stack">
      <ErrorBanner message={err} onDismiss={() => setErr(undefined)} />
      <div className="card">
        <div className="card-b spread">
          <div className="metric">
            <span className="k">Reduction this cycle</span>
            <span className="big-ratio num">{cycle?.reduction.gross ?? "—"}<span className="arrow">→</span>{cycle?.reduction.net ?? "—"}</span>
          </div>
          <div className="metric" style={{ textAlign: "right", alignItems: "flex-end" }}>
            <span className="k">Cycle status</span>
            {cycle ? <span className={"chip " + (cycle.status || "").toLowerCase()}>{cycle.status}</span> : <span className="note">no active cycle</span>}
            <span className="note mono">{cycleId ?? "run the demo to begin"}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Cycle controls</h3>
          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <button
              className="btn sm"
              onClick={stage}
              disabled={readOnly || busy}
              title={readOnly ? "read-only deployment" : "raise the invoices & compute nets, then approve + settle by hand (human-in-the-loop)"}
            >
              {busyAction === "prepare" ? "Staging…" : "Stage cycle for approval"}
            </button>
            <button
              className="btn primary sm"
              onClick={() => cycleId && run("settle", api.settle(cycleId))}
              disabled={readOnly || !cycle?.allApproved || settled || busy}
              title={readOnly ? "read-only deployment" : settled ? "this cycle is already settled" : cycle?.allApproved ? "" : "every subsidiary must approve & allocate first"}
            >
              {busyAction === "settle" ? "Settling…" : "Execute settlement"}
            </button>
            <button className="btn sm" onClick={demo} disabled={readOnly || busy} title={readOnly ? "read-only deployment" : ""}>
              {busyAction === "demo" ? "Running full cycle…" : "▷ Run full demo cycle"}
            </button>
          </div>
        </div>
        <table>
          <thead><tr><th>Subsidiary</th><th className="r">Net position</th><th>On-ledger approval</th></tr></thead>
          <tbody>
            {(!cycle || cycle.positions.length === 0) && <tr><td colSpan={3} className="empty">{busy ? "Raising invoices and computing nets…" : <>No net positions yet — click <b>▷ Run full demo cycle</b> to raise 20 invoices across 3 currencies and watch them net down to 3 payments.</>}</td></tr>}
            {(cycle?.positions ?? []).map((p) => (
              <tr key={p.subsidiary}>
                <td>{p.subsidiary}</td>
                <td className={"r num " + (p.netAmount >= 0 ? "pos" : "neg")}>{signed(p.netAmount)}</td>
                <td>{p.approved ? <span className="chip approved">approved</span> : <span className="chip">pending</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cycle && cycle.positions.length > 0 && !cycle.allApproved && !settled && (
          <div className="card-b"><div className="banner">👉 This cycle is staged. Act as each subsidiary (the top-bar <b>“Acting as”</b> switcher) to <b>Approve</b> its net position — and <b>Reserve</b> funds if it’s a payer — then come back as <b>Operator</b> and click <b>Execute settlement</b> to settle every leg atomically on-ledger.</div></div>
        )}
        {settled && (
          <div className="card-b"><div className="note">✓ This cycle is settled on-ledger — balances moved atomically in one transaction.</div></div>
        )}
      </div>

      <AgentPanel onApprove={demo} readOnly={readOnly} />
    </div>
  );
}
