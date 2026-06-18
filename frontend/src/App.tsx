import { useState } from "react";
import { api, type GraphView, type PartyInfo } from "./api";
import { useAsync } from "./useApi";
import { GrossToNetGraph } from "./components/GrossToNetGraph";
import { OperatorConsole } from "./components/OperatorConsole";
import { SubsidiaryDashboard } from "./components/SubsidiaryDashboard";
import { PrivacyProof } from "./components/PrivacyProof";
import { RegulatorView } from "./components/RegulatorView";

const ROLE: Record<string, string> = {
  Operator: "Netting center", Sub_US: "Subsidiary", Sub_UK: "Subsidiary",
  Sub_DE: "Subsidiary", Bank: "Cash registry", Regulator: "Observer",
};
type Tab = "console" | "network" | "privacy";

export function App() {
  const parties = useAsync<PartyInfo[]>(() => api.parties(), []);
  const [party, setParty] = useState("Operator");
  const [tab, setTab] = useState<Tab>("console");
  const [cycleId, setCycleId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh((n) => n + 1);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Atomic<span className="dot">Net</span> <small>private atomic netting · Canton</small></div>
        <div className="switcher">
          <span className="lbl">Acting as</span>
          <div className="seg">
            {(parties.data ?? []).map((p) => (
              <button key={p.name} className={party === p.name ? "on" : ""} onClick={() => setParty(p.name)}>
                {p.name}<span className="role">{ROLE[p.name]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="tabs">
          {(["console", "network", "privacy"] as Tab[]).map((t) => (
            <div key={t} className={"tab " + (tab === t ? "active" : "")} onClick={() => setTab(t)}>
              {t === "console" ? "Console" : t === "network" ? "Network" : "Privacy Proof"}
            </div>
          ))}
        </div>
      </header>
      <main className="main">
        {tab === "console" &&
          (party === "Operator" ? (
            <OperatorConsole cycleId={cycleId} setCycleId={setCycleId} refresh={refresh} bump={bump} />
          ) : party === "Regulator" ? (
            <RegulatorView refresh={refresh} />
          ) : (
            <SubsidiaryDashboard party={party} cycleId={cycleId} refresh={refresh} bump={bump} />
          ))}
        {tab === "network" && <NetworkTab refresh={refresh} />}
        {tab === "privacy" && <PrivacyProof party={party} refresh={refresh} />}
      </main>
    </div>
  );
}

function NetworkTab({ refresh }: { refresh: number }) {
  const { data } = useAsync<GraphView>(() => api.graph(), [refresh]);
  const [mode, setMode] = useState<"gross" | "net">("gross");
  return (
    <div className="card">
      <div className="card-h">
        <h3>Gross → Net</h3>
        <div className="row" style={{ marginLeft: "auto", gap: 14, alignItems: "center" }}>
          <div className="legend">
            <span><span className="sw" style={{ background: "#2563eb" }} />USD</span>
            <span><span className="sw" style={{ background: "#7c3aed" }} />EUR</span>
            <span><span className="sw" style={{ background: "#0d9488" }} />GBP</span>
          </div>
          <div className="seg">
            <button className={mode === "gross" ? "on" : ""} onClick={() => setMode("gross")}>Gross web</button>
            <button className={mode === "net" ? "on" : ""} onClick={() => setMode("net")}>Net settlement</button>
          </div>
        </div>
      </div>
      <div className="card-b">
        {data && data.grossEdges.length > 0 ? (
          <GrossToNetGraph graph={data} mode={mode} />
        ) : (
          <div className="empty">No invoices yet. Switch to Operator → “Run full demo cycle”, then come back.</div>
        )}
        {data && data.grossEdges.length > 0 && (
          <div className="spread" style={{ marginTop: 12 }}>
            <span className="note">{data.reduction.gross} gross cross-currency invoices collapse to {data.reduction.net} net payments.</span>
            <span className="big-ratio num" style={{ fontSize: 26 }}>{data.reduction.gross}<span className="arrow">→</span>{data.reduction.net}</span>
          </div>
        )}
      </div>
    </div>
  );
}
