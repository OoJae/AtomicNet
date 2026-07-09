// /how — the settlement pipeline in four true steps, each annotated with the actual Daml
// that enforces it (trimmed from daml/AtomicNet/*; the full files are in the repo).
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./pages.css";
import { header, footer, reveals } from "./shell";

document.getElementById("page")!.innerHTML = `
${header("how")}
<main class="article">
  <p class="eyebrow rv">The pipeline</p>
  <h1 class="page-title rv">Four steps, and every one<br /><em>enforced by the ledger.</em></h1>
  <p class="lede rv">
    AtomicNet's app computes; Canton's ledger <em>enforces</em>. Each step below names the
    guarantee, shows the Daml that makes it physical, and what that makes impossible —
    the app never filters data or fakes authority.
  </p>

  <section class="step rv" aria-label="Step 1: invoices">
    <div>
      <p class="eyebrow">01 — Invoices</p>
      <h2>An obligation needs<br /><em>both</em> signatures.</h2>
      <p>
        An issuer can only <em>propose</em>. The binding invoice — signed by issuer and payer —
        can come into existence one way: the payer accepting. There is no code path, ours or
        anyone's, that forges a debt onto a party that didn't sign.
      </p>
      <p class="prevents">PREVENTS · <b>forged obligations</b> — proven by Authorization.daml</p>
    </div>
    <div>
      <pre class="code"><span class="k">template</span> InvoiceProposal
  <span class="s">signatory issuer</span>            <span class="c">-- the issuer alone: only a proposal</span>
  <span class="k">choice</span> AcceptInvoice : ContractId IntercompanyInvoice
    <span class="s">controller payer</span>          <span class="c">-- the payer's consent, on-ledger</span>
    do create IntercompanyInvoice with … cycleId = None

<span class="k">template</span> IntercompanyInvoice
  <span class="s">signatory issuer, payer</span>     <span class="c">-- BOTH signed → a real obligation</span>
  <span class="s">observer  operator</span></pre>
      <p class="code-cap">daml/AtomicNet/Invoice.daml</p>
    </div>
  </section>

  <section class="step rv" aria-label="Step 2: the netting cycle">
    <div>
      <p class="eyebrow">02 — The cycle</p>
      <h2>Participants are data,<br /><em>not disclosure.</em></h2>
      <p>
        The operator opens a netting cycle over the subsidiaries. Deliberately, the
        participant list is <em>data</em> — not an observer list — so no subsidiary can
        enumerate the others from the cycle. And an invoice can be claimed by a cycle
        exactly once: the ledger asserts it.
      </p>
      <p class="prevents">PREVENTS · <b>graph leakage, double-netting</b> — proven by Privacy.daml</p>
    </div>
    <div>
      <pre class="code"><span class="k">template</span> NettingCycle
  <span class="s">signatory operator</span>
  <span class="s">observer  regulator</span>          <span class="c">-- selective disclosure for audit</span>
  <span class="c">-- NB: participants is NOT an observer list. Making it one</span>
  <span class="c">-- would leak the whole cycle to every subsidiary.</span>

<span class="k">choice</span> IncludeInCycle           <span class="c">-- on IntercompanyInvoice</span>
  <span class="s">controller operator</span>
  do assertMsg <span class="c">"already included in a cycle"</span> (cycleId == None)
     create this with cycleId = Some inCycleId</pre>
      <p class="code-cap">daml/AtomicNet/Cycle.daml · Invoice.daml</p>
    </div>
  </section>

  <section class="step rv" aria-label="Step 3: approval and reservation">
    <div>
      <p class="eyebrow">03 — Approval</p>
      <h2>Consent is a co-signature,<br /><em>not a checkbox.</em></h2>
      <p>
        Each subsidiary sees only its own net position and approves it — producing a
        contract signed by <em>both</em> operator and subsidiary. Net payers then earmark
        funds into an allocation co-signed by payer and bank. Those captured signatures are
        what let the operator settle everyone atomically without asking again.
      </p>
      <p class="prevents">PREVENTS · <b>settling unapproved positions, spending unreserved cash</b></p>
    </div>
    <div>
      <pre class="code"><span class="k">choice</span> ApproveNetPosition        <span class="c">-- on NetPosition</span>
  <span class="s">controller subsidiary</span>        <span class="c">-- only the sub itself can consent</span>
  do create ApprovedNetPosition with …
     <span class="c">-- signatory operator, subsidiary → co-signed delegation</span>

<span class="k">choice</span> Allocate                  <span class="c">-- on Deposit (bank-issued cash)</span>
  <span class="s">controller owner</span>
  do create DepositAllocation with …
     <span class="c">-- signatory bank, owner → pre-authorized settlement leg</span></pre>
      <p class="code-cap">daml/AtomicNet/NetPosition.daml · Cash.daml</p>
    </div>
  </section>

  <section class="step rv" aria-label="Step 4: atomic settlement">
    <div>
      <p class="eyebrow">04 — Atomic settlement</p>
      <h2>One transaction.<br /><em>All or nothing.</em></h2>
      <p>
        ExecuteSettlement re-checks everything <em>inside the choice</em>: the cycle is
        Locked; the approved positions conserve to exactly zero; the payouts equal exactly
        what was approved; every allocation is earmarked for this cycle. Then it moves every
        leg and marks the cycle Settled — in one Canton transaction. Any failure reverts all
        of it.
      </p>
      <p class="prevents">PREVENTS · <b>partial settlement, fabricated payouts, double-settle</b> — proven by Atomicity.daml + SettlementGate.daml</p>
    </div>
    <div>
      <pre class="code"><span class="k">choice</span> ExecuteSettlement
  <span class="s">controller operator</span>
  do cyc &lt;- fetch cycleCid
     assertMsg <span class="c">"cycle is not Locked"</span> (cyc.status == Locked)
     approved &lt;- forA approvalCids fetch      <span class="c">-- the co-signatures</span>
     assertMsg <span class="c">"Σ net /= 0"</span> (sum netAmounts == 0.0)
     assertMsg <span class="c">"payouts ≠ approved"</span> (sort payouts == expected)
     …                                        <span class="c">-- disburse every leg</span>
     assertMsg <span class="c">"not conserved"</span> (totalIn == totalOut)
     exercise cycleCid MarkSettled            <span class="c">-- can never settle twice</span></pre>
      <p class="code-cap">daml/AtomicNet/Settlement.daml — one transaction; any assert reverts everything</p>
    </div>
  </section>

  <div class="page-ctas rv">
    <a class="btn-primary" href="/app">Run it yourself in the console<span aria-hidden="true"> →</span></a>
    <a class="btn-ghost" href="/proof">See the receipts<span aria-hidden="true"> →</span></a>
  </div>
</main>
${footer()}
`;

reveals();
