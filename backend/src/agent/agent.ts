// AI treasury agent. Takes a COMPACT summary of the operator-visible netting analysis and
// returns a netting-cycle PROPOSAL + a plain-English rationale via an OpenAI-compatible
// chat-completions endpoint (MiMo v2.5 Pro by default). This module deliberately has NO
// ledger access and NO settlement path: its output is a suggestion object that can only ever
// pre-fill the proposal form.
import type { FxRate } from "../netting/fx.ts";

const BASE = process.env.AGENT_BASE_URL ?? "https://token-plan-sgp.xiaomimimo.com/v1";
const KEY = process.env.AGENT_API_KEY ?? "";
const MODEL = process.env.AGENT_MODEL ?? "mimo-v2.5-pro";
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 60000);

export interface AgentInput {
  invoiceCount: number;
  currencies: string[];
  settlementCurrency: string;
  fxRates: FxRate[];
  netPositions: { party: string; netUsd: number }[];
  reduction: { gross: number; net: number };
}
export interface AgentProposal {
  rationale: string;
  proposal: {
    participants: string[];
    settlementCurrency: string;
    fxRates: { base: string; quote: string; rate: number }[];
    expectedReduction: { gross: number; net: number };
  };
}

const SYSTEM = `You are AtomicNet's AI treasury agent. Given a summary of a multinational's
intercompany netting analysis (invoice count, currencies, FX rates, each subsidiary's net
position in the settlement currency, and the gross->net reduction), you recommend running the
netting cycle and explain the benefit briefly.

CONSTRAINTS:
- You ONLY propose. You cannot move money or settle anything — settlement needs each
  subsidiary's on-ledger approval and a human's click, never you.
- Reply with STRICT JSON only (no markdown, no prose outside JSON), matching exactly:
{
  "rationale": "2-3 sentence plain-English case for running this cycle (name the reduction, the FX/working-capital benefit, and any entity that nets to zero)",
  "proposal": {
    "participants": ["Sub_US","Sub_UK","..."],
    "settlementCurrency": "USD",
    "fxRates": [{"base":"EUR","quote":"USD","rate":1.1}],
    "expectedReduction": {"gross": 0, "net": 0}
  }
}
Participants = the subsidiaries in the net positions. Echo the settlement currency, the FX
rates, and the reduction you were given. Be concise.`;

export function isConfigured(): boolean {
  return KEY.length > 0;
}

export async function propose(input: AgentInput): Promise<AgentProposal> {
  if (!KEY) throw new Error("AGENT_API_KEY is not set (configure .env)");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: "json_object" }, // constrain the endpoint to valid JSON
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
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new Error(`agent timed out after ${TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
