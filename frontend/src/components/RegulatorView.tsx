import { api, signed, type GraphView } from "../api";
import { useAsync } from "../useApi";

export function RegulatorView({ refresh }: { refresh: number }) {
  const audit = useAsync(() => api.audit(), [refresh]);
  const graph = useAsync<GraphView>(() => api.graph(), [refresh]);
  if (audit.loading) return <div className="empty">Loading the regulator’s audit view…</div>;
  if (audit.error) return <div className="empty">Failed to load the audit trail: {audit.error}</div>;

  return (
    <div className="stack">
      <div className="banner">
        Selective disclosure: the regulator is an explicit observer on cycles, net positions, approvals and
        settlements — reconstructing the netting &amp; settlement trail — <b>without</b> subsidiaries ever seeing each other.
      </div>
      <div className="grid c2">
        <div className="card">
          <div className="card-h"><h3>Regulator visibility</h3><span className="note" style={{ marginLeft: "auto" }}>{audit.data?.totalVisible ?? 0} contracts</span></div>
          <div className="card-b">
            <table><tbody>
              {Object.entries(audit.data?.byType ?? {}).map(([k, v]) => (
                <tr key={k}><td className="mono">{k.split(":").pop()}</td><td className="r num">{v}</td></tr>
              ))}
              {Object.keys(audit.data?.byType ?? {}).length === 0 && <tr><td className="empty">Nothing settled yet.</td></tr>}
            </tbody></table>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Net positions (audit trail)</h3></div>
          <table>
            <thead><tr><th>Subsidiary</th><th className="r">Net</th></tr></thead>
            <tbody>
              {(graph.data?.positions ?? []).map((p) => (
                <tr key={p.subsidiary}><td>{p.subsidiary}</td><td className={"r num " + (p.netAmount >= 0 ? "pos" : "neg")}>{signed(p.netAmount)}</td></tr>
              ))}
              {(!graph.data || graph.data.positions.length === 0) && <tr><td colSpan={2} className="empty">No settled positions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
