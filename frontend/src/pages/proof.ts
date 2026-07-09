// /proof — the receipts, set like an audit exhibit: every claim is a runnable test or an
// on-ledger fact a skeptic can check.
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./pages.css";
import { header, footer, reveals } from "./shell";

const PROOFS: [string, string][] = [
  ["lifecycle", "The full invoice → cycle → net-position → approval flow works end to end."],
  ["settlement", "Net payers reserve funds; the operator settles every leg in ONE transaction; balances = opening ± net."],
  ["atomicity", "One under-funded leg → the entire settlement reverts; no balances change. No partial settlement, no exposure."],
  ["settlementGate", "The operator CANNOT settle without the subsidiaries' on-ledger approvals, and cannot pay out more than they approved."],
  ["multiCurrencySettlement", "USD/EUR/GBP invoices FX-net to USD (Σ = 0, exactly) and settle atomically."],
  ["privacy", "A sibling cannot see another pair's invoice or another sub's net position — by protocol, not by app."],
  ["authorization", "No party can forge an invoice binding another; no subsidiary can trigger settlement or approve another's position."],
  ["regulatorDisclosure", "The regulator reconstructs the netting & settlement trail while siblings stay blind. Selective disclosure without broadcast."],
];

document.getElementById("page")!.innerHTML = `
${header("proof")}
<main class="article">
  <p class="eyebrow rv">Exhibits</p>
  <h1 class="page-title rv">Don't take our word.<br /><em>Run the proofs.</em></h1>
  <p class="lede rv">
    Every guarantee on this site is a runnable test or an on-ledger fact. Clone the repo,
    run <span class="mono">dpm test</span>, read the CI — or query Canton DevNet yourself.
  </p>

  <section class="exhibit rv" aria-label="Exhibit A: Daml proofs">
    <p class="eyebrow">Exhibit A — the model</p>
    <h2>Eight Daml Script proofs</h2>
    <table>
      <thead><tr><th>Script</th><th>What it proves</th><th></th></tr></thead>
      <tbody>
        ${PROOFS.map(([n, d]) => `<tr><td>${n}</td><td>${d}</td><td class="ok">ok</td></tr>`).join("\n        ")}
      </tbody>
    </table>
    <p class="code-cap">daml-tests/AtomicNet/Test/ — run: dpm test</p>
  </section>

  <section class="exhibit rv" aria-label="Exhibit B: the app and CI">
    <p class="eyebrow">Exhibit B — the app</p>
    <h2>The bridge is tested against a live ledger</h2>
    <table>
      <thead><tr><th>Check</th><th>What it proves</th><th></th></tr></thead>
      <tbody>
        <tr><td>demoData.test</td><td>The demo dataset genuinely nets 20 → 3 with Sub_SG at exactly zero — via the real netting code.</td><td class="ok">ok</td></tr>
        <tr><td>netting.test</td><td>FX conversion, Σ net == 0 (tampered books rejected), deterministic plan routing.</td><td class="ok">ok</td></tr>
        <tr><td>agent.guardrail + agent.behavior</td><td>The AI agent has no code path to settlement — and, run for real, issues ZERO ledger writes.</td><td class="ok">ok</td></tr>
        <tr><td>CI integration job</td><td>Boots a live Canton sandbox, settles the 20→3 cycle over the JSON Ledger API, asserts Sub_UK sees exactly 8 of 20 invoices.</td><td class="ok">ok</td></tr>
      </tbody>
    </table>
    <p class="code-cap">backend/src/**/*.test.ts · .github/workflows/ci.yml — 4 jobs, all green on main</p>
  </section>

  <section class="exhibit rv" aria-label="Exhibit C: Canton DevNet">
    <p class="eyebrow">Exhibit C — the real network</p>
    <h2>Settled on Canton DevNet</h2>
    <ul class="fact-list">
      <li><span class="k">Validator</span><span class="v">the hackathon's shared DevNet validator (Canton 3.5.7), via the JSON Ledger API v2</span></li>
      <li><span class="k">Namespace</span><span class="v">1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8</span></li>
      <li><span class="k">Parties</span><span class="v">atomicnet-operator-1 · atomicnet-sub-{us,uk,de,fr,sg}-1 · atomicnet-bank-1 · atomicnet-regulator-1</span></li>
      <li><span class="k">Package</span><span class="v">atomicnet-model-0.2.0 — 7712f358… (the hardened model: approval gate + Σ=0 checked in the choice)</span></li>
      <li><span class="k">Settled cycle</span><span class="v">CYCLE-1783619153596 — 20 invoices → 3 net payments · status Settled · net deltas exact · Sub_UK sees 8/20</span></li>
      <li><span class="k">First contract</span><span class="v">update 122014778b13dc35d3c6709457cf5b59ecc70778f442c6b8d68abda34e9cf3539391 @ offset 4,141,881</span></li>
    </ul>
    <div class="live-strip" id="live-strip" role="status"></div>
  </section>

  <div class="page-ctas rv">
    <a class="btn-primary" href="/app">Open the live console<span aria-hidden="true"> →</span></a>
    <a class="btn-ghost" href="https://github.com/OoJae/AtomicNet" target="_blank" rel="noopener">Read the code<span aria-hidden="true"> ↗</span></a>
    <a class="btn-ghost" href="/how">How it works<span aria-hidden="true"> →</span></a>
  </div>
</main>
${footer()}
`;

reveals();

// Live receipt: on the DevNet origin, show the CURRENT on-ledger state, fetched right now.
(async () => {
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    const g = await fetch("/api/graph").then((r) => r.json());
    if (!g?.activeCycleId) return;
    const strip = document.getElementById("live-strip")!;
    const net = cfg.network === "devnet" ? "CANTON DEVNET" : "SANDBOX LEDGER";
    strip.innerHTML = `<b>LIVE</b> · queried ${net} just now → active cycle ${g.activeCycleId} · ${g.reduction.gross} gross → ${g.reduction.net} net`;
    strip.classList.add("on");
  } catch {
    /* no live strip if the API is unreachable — the static evidence stands */
  }
})();
