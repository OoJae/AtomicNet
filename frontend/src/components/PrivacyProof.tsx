import { api, fmt, type GraphView, type Visibility } from "../api";
import { useAsync } from "../useApi";

// The live privacy proof: every invoice exists, but the ledger only discloses the ones the
// selected party is a stakeholder of. Switching parties makes data appear and disappear.
export function PrivacyProof({ party, refresh }: { party: string; refresh: number }) {
  const vis = useAsync<Visibility>(() => api.visibility(party), [party, refresh]);
  const all = useAsync<GraphView>(() => api.graph(), [refresh]);
  if (vis.loading || all.loading) return <div className="empty">Loading…</div>;
  if (!vis.data || !all.data) return <div className="empty">No data — switch to Operator and run a demo cycle first.</div>;

  const key = (issuer: string, payer: string, amount: number, ccy: string) => `${issuer}|${payer}|${amount}|${ccy}`;
  const visibleSet = new Set(vis.data.invoices.map((i) => key(i.issuer, i.payer, i.amount, i.currency)));
  const allInv = all.data.grossEdges; // operator's full view: from=issuer, to=payer
  const hidden = allInv.filter((e) => !visibleSet.has(key(e.from, e.to, e.amount, e.currency))).length;

  return (
    <div className="stack">
      <div className="banner">
        Privacy is enforced by the Canton <b>ledger</b>, not the app. Acting as <b>{party}</b>, the ledger
        discloses <b>{vis.data.totalVisible}</b> contracts and <b>{allInv.length - hidden}</b> of <b>{allInv.length}</b> invoices.
        The other <b>{hidden}</b> are never sent to {party} — switch the “Acting as” party to watch them appear and disappear.
      </div>
      <div className="card">
        <div className="card-h">
          <h3>Every intercompany invoice — what {party} is shown</h3>
          <span className="note" style={{ marginLeft: "auto" }}>{hidden} hidden by the ledger</span>
        </div>
        <table>
          <thead><tr><th>Payment flow</th><th className="r">Amount</th><th>As {party}, you see…</th></tr></thead>
          <tbody>
            {allInv.length === 0 && <tr><td colSpan={3} className="empty">No invoices yet. Switch to Operator → “Run full demo cycle”, then return here.</td></tr>}
            {allInv.map((e, i) => {
              const visible = visibleSet.has(key(e.from, e.to, e.amount, e.currency));
              return (
                <tr key={i} style={{ opacity: visible ? 1 : 0.4 }}>
                  <td><b>{e.to}</b> <span className="muted">owes</span> <b>{e.from}</b></td>
                  <td className="r num">{fmt(e.amount, e.currency)} <span className={"chip ccy-" + e.currency}>{e.currency}</span></td>
                  <td>{visible ? <span className="chip approved">visible</span> : <span className="chip">🔒 hidden by the ledger</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
