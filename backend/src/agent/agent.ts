// AI treasury agent. Takes the OPERATOR-visible positions as JSON and returns a netting-cycle
// PROPOSAL + a plain-English rationale via an OpenAI-compatible chat-completions endpoint
// (MiMo v2.5 Pro by default). This module deliberately has NO ledger access and NO settlement
// path: its output is a suggestion object that can only ever pre-fill the proposal form.
const BASE = process.env.AGENT_BASE_URL ?? "https://token-plan-sgp.xiaomimimo.com/v1";
const KEY = process.env.AGENT_API_KEY ?? "";
const MODEL = process.env.AGENT_MODEL ?? "mimo-v2.5-pro";

export interface AgentInvoice { invoiceId: string; issuer: string; payer: string; amount: number; currency: string }
export interface AgentInput { invoices: AgentInvoice[]; settlementCurrency?: string }
export interface AgentProposal {
  rationale: string;
  proposal: {
    participants: string[];
    includedInvoiceIds: string[];
    settlementCurrency: string;
    fxRates: { base: string; quote: string; rate: number }[];
    expectedReduction?: { gross: number; net: number };
  };
}

const SYSTEM = `You are AtomicNet's AI treasury agent. You help a netting operator draft an intercompany
netting cycle from the invoices it can see. You analyse which invoices to include, the settlement
currency, and the FX rates needed, and you explain your reasoning briefly.

CRITICAL CONSTRAINTS:
- You ONLY propose. You cannot and must not move money or settle anything. Settlement requires each
  subsidiary's on-ledger approval and a human's explicit click — never you.
- Reply with STRICT JSON only (no markdown, no prose outside JSON), matching exactly:
{
  "rationale": "2-4 sentence plain-English explanation of the proposed cycle and the expected netting benefit",
  "proposal": {
    "participants": ["Sub_US","Sub_UK","Sub_DE"],
    "includedInvoiceIds": ["..."],
    "settlementCurrency": "USD",
    "fxRates": [{"base":"EUR","quote":"USD","rate":1.10},{"base":"GBP","quote":"USD","rate":1.25}],
    "expectedReduction": {"gross": 0, "net": 0}
  }
}
Include every invoice id you were given. Participants are the distinct issuers/payers. Provide an FX rate
for every non-settlement currency present.`;

export function isConfigured(): boolean {
  return KEY.length > 0;
}

export async function propose(input: AgentInput): Promise<AgentProposal> {
  if (!KEY) throw new Error("AGENT_API_KEY is not set (configure .env)");
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`agent endpoint ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data: any = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return parseProposal(text);
}

/** Tolerant JSON extraction: strip code fences / surrounding prose, take the first JSON object. */
export function parseProposal(text: string): AgentProposal {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const json = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
  return {
    rationale: json.rationale ?? json.reason ?? "",
    proposal: json.proposal ?? json,
  };
}
