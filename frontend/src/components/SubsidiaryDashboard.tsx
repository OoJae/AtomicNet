import { useState } from "react";
import { api, fmt, signed, type Dashboard } from "../api";
import { useAsync } from "../useApi";
import { ErrorBanner } from "./ErrorBanner";

export function SubsidiaryDashboard({ party, cycleId, refresh, bump }: { party: string; cycleId?: string; refresh: number; bump: () => void }) {
  const { data, error, loading } = useAsync<Dashboard>(() => api.dashboard(party), [party, refresh]);
  const [err, setErr] = useState<string>();
  if (loading) return <div className="empty">Loading {party}’s ledger view…</div>;
  if (error) return <div className="empty">Error: {error}</div>;
  if (!data) return null;
  const myNet = data.netPositions.find((n) => n.cycleId === cycleId) ?? data.netPositions[data.netPositions.length - 1];

  const act = async (p: Promise<unknown>) => {
    setErr(undefined);
    try {
      await p;
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
    bump();
  };

  return (
    <div className="stack">
      <ErrorBanner message={err} onDismiss={() => setErr(undefined)} />
      <div className="grid c3">
        {Object.keys(data.balances).length === 0 && (
          <div className="card"><div className="card-b empty">No deposits</div></div>
        )}
        {Object.entries(data.balances).map(([ccy, amt]) => (
          <div className="card" key={ccy}>
            <div className="card-b metric"><span className="k">{ccy} balance</span><span className="v num">{fmt(amt, ccy)}</span></div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-h"><h3>My net position{myNet ? ` · ${myNet.cycleId}` : ""}</h3></div>
        <div className="card-b">
          {!myNet && <div className="note">No net position yet. The operator computes these when the cycle is locked.</div>}
          {myNet && (
            <div className="spread">
              <div className="metric">
                <span className="k">Net ({myNet.netAmount >= 0 ? "receiver" : "payer"} · {myNet.status})</span>
                <span className={"v num " + (myNet.netAmount >= 0 ? "pos" : "neg")}>{signed(myNet.netAmount)}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {myNet.status === "pending" && <button className="btn primary sm" onClick={() => act(api.approve(party, myNet.cycleId))}>Approve net position</button>}
                {myNet.status === "approved" && myNet.netAmount < 0 && <button className="btn sm" onClick={() => act(api.allocate(party, myNet.cycleId))}>Reserve {fmt(-myNet.netAmount)} to settle</button>}
                {myNet.status === "approved" && myNet.netAmount >= 0 && <span className="chip approved">approved · awaiting settlement</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>My intercompany invoices</h3><span className="note" style={{ marginLeft: "auto" }}>{data.invoices.length} visible to me</span></div>
        <table>
          <thead><tr><th>Invoice</th><th>Relationship</th><th className="r">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {data.invoices.length === 0 && <tr><td colSpan={4} className="empty">No invoices</td></tr>}
            {data.invoices.map((inv) => (
              <tr key={inv.cid}>
                <td className="mono">{inv.invoiceId}</td>
                <td>{inv.issuer === party ? <><b>{inv.payer}</b> <span className="muted">owes me</span></> : <><span className="muted">I owe</span> <b>{inv.issuer}</b></>}</td>
                <td className="r num">{fmt(inv.amount, inv.currency)} <span className={"chip ccy-" + inv.currency}>{inv.currency}</span></td>
                <td><span className="chip">{inv.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
