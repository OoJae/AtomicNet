import { useState } from "react";
import { api, signed, type CycleView } from "../api";
import { useAsync } from "../useApi";
import { AgentPanel } from "./AgentPanel";
import { ErrorBanner } from "./ErrorBanner";

export function OperatorConsole({ cycleId, setCycleId, refresh, bump }: { cycleId?: string; setCycleId: (id: string) => void; refresh: number; bump: () => void }) {
  const { data: cycle } = useAsync<CycleView | undefined>(() => (cycleId ? api.cycle(cycleId) : Promise.resolve(undefined)), [cycleId, refresh]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  async function run<T>(p: Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setErr(undefined);
    try {
      return await p;
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
      bump();
    }
  }
  async function openCycle() {
    const id = `CYCLE-${Date.now()}`;
    await run(api.openCycle({ cycleId: id }));
    setCycleId(id);
  }
  async function demo() {
    const r = await run(api.runDemo());
    if (r) setCycleId(r.cycleId);
  }

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
            <span className="note mono">{cycleId ?? "open a cycle to begin"}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Cycle controls</h3>
          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <button className="btn sm" onClick={openCycle} disabled={busy}>Open new cycle</button>
            <button className="btn sm" onClick={() => cycleId && run(api.lockCycle(cycleId))} disabled={!cycleId || busy}>Lock &amp; compute nets</button>
            <button className="btn primary sm" onClick={() => cycleId && run(api.settle(cycleId))} disabled={!cycle?.allApproved || busy} title={cycle?.allApproved ? "" : "every subsidiary must approve & allocate first"}>Execute settlement</button>
            <button className="btn sm" onClick={demo} disabled={busy}>▷ Run full demo cycle</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Subsidiary</th><th className="r">Net position</th><th>On-ledger approval</th></tr></thead>
          <tbody>
            {(!cycle || cycle.positions.length === 0) && <tr><td colSpan={3} className="empty">No net positions yet — click <b>▷ Run full demo cycle</b> to raise 20 invoices across 3 currencies and watch them net down to 3 payments.</td></tr>}
            {(cycle?.positions ?? []).map((p) => (
              <tr key={p.subsidiary}>
                <td>{p.subsidiary}</td>
                <td className={"r num " + (p.netAmount >= 0 ? "pos" : "neg")}>{signed(p.netAmount)}</td>
                <td>{p.approved ? <span className="chip approved">approved</span> : <span className="chip">pending</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cycle && cycle.positions.length > 0 && !cycle.allApproved && (
          <div className="card-b"><div className="note">Execute is disabled until every subsidiary approves &amp; allocates (switch the “Acting as” party to a subsidiary to do so).</div></div>
        )}
      </div>

      <AgentPanel onApprove={openCycle} />
    </div>
  );
}
