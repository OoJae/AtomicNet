import { useState } from "react";

interface Proposal {
  rationale: string;
  proposal: unknown;
}

// The AI treasury agent panel. It proposes; a human disposes; the contract constrains.
// The "Analyze" call hits /api/agent/propose (wired in Stage 4c). The agent output can only
// pre-fill the proposal — there is NO path from here to settlement.
export function AgentPanel({ onApprove }: { onApprove: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Proposal>();
  const [error, setError] = useState<string>();

  async function analyze() {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/agent/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `agent unavailable (${res.status})`);
      setResult(await res.json());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>AI Treasury Agent</h3>
        <span className="chip">MiMo v2.5 Pro</span>
        <span className="note" style={{ marginLeft: "auto" }}>proposes · never settles</span>
      </div>
      <div className="card-b stack">
        <p className="note" style={{ margin: 0 }}>
          The agent reads the operator-visible positions and drafts a netting cycle with a plain-English
          rationale. It can only pre-fill the proposal — settlement still requires each subsidiary's
          on-ledger approval and a human's Execute click.
        </p>
        <div>
          <button className="btn" onClick={analyze} disabled={loading}>
            {loading ? "Analyzing positions…" : "Analyze open positions"}
          </button>
        </div>
        {error && <div className="note" style={{ color: "var(--neg)" }}>Agent offline: {error}</div>}
        {result && (
          <div className="stack">
            <div className="banner">{result.rationale}</div>
            <pre className="mono" style={{ fontSize: 12, background: "var(--surface-2)", padding: 12, borderRadius: 8, overflow: "auto", margin: 0 }}>
              {JSON.stringify(result.proposal, null, 2)}
            </pre>
            <div className="spread">
              <span className="note">⛔ The agent cannot settle. Approving only opens a cycle for subsidiaries to consent to.</span>
              <button className="btn primary" onClick={onApprove}>Approve &amp; propose cycle</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
