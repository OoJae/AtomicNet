// Thin hand-rolled client for the Canton JSON Ledger API v2.
// Reads are performed AS a given party — the ledger does the privacy filtering, not us.
// Works against: a local `dpm sandbox` (no auth), and a Splice validator node's JSON API
// (nginx vhost `json-ledger-api.localhost` — set JSON_API_HOST_HEADER when the URL is an
// IP/localhost; set LEDGER_API_TOKEN if the validator runs with auth enabled, `-a`).
const JSON_API = process.env.JSON_API_URL ?? "http://localhost:7575";
const HOST_HEADER = process.env.JSON_API_HOST_HEADER; // e.g. json-ledger-api.localhost
const TOKEN = process.env.LEDGER_API_TOKEN; // static Bearer token (only if auth is enabled)

// OAuth2 client-credentials (e.g. 5N Seaport / shared DevNet validator: tokens expire ~8h,
// so we fetch and auto-refresh instead of relying on a static token). Takes precedence over
// LEDGER_API_TOKEN when configured.
const OAUTH_URL = process.env.LEDGER_OAUTH_TOKEN_URL; // e.g. https://auth.../oauth/token
const OAUTH_ID = process.env.LEDGER_OAUTH_CLIENT_ID;
const OAUTH_SECRET = process.env.LEDGER_OAUTH_CLIENT_SECRET;
const OAUTH_SCOPE = process.env.LEDGER_OAUTH_SCOPE ?? "daml_ledger_api";
const OAUTH_AUDIENCE = process.env.LEDGER_OAUTH_AUDIENCE; // some IdPs require an audience claim

let cachedToken: { token: string; expiresAt: number } | undefined;
async function bearer(): Promise<string | undefined> {
  if (!OAUTH_URL || !OAUTH_ID || !OAUTH_SECRET) return TOKEN;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: OAUTH_ID,
      client_secret: OAUTH_SECRET,
      scope: OAUTH_SCOPE,
      ...(OAUTH_AUDIENCE ? { audience: OAUTH_AUDIENCE } : {}),
    }),
  });
  if (!res.ok) throw new Error(`oauth token fetch failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in ?? 3600) * 1000),
  };
  return cachedToken.token;
}

export interface CreateCommand {
  CreateCommand: { templateId: string; createArguments: Record<string, unknown> };
}
export interface ExerciseCommand {
  ExerciseCommand: {
    templateId: string;
    contractId: string;
    choice: string;
    choiceArgument: Record<string, unknown>;
  };
}
export type Command = CreateCommand | ExerciseCommand;

export interface Contract {
  templateId: string; // package-id:Module:Entity
  contractId: string;
  payload: Record<string, any>;
  signatories: string[];
  observers: string[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const tok = await bearer();
  const res = await fetch(JSON_API + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(HOST_HEADER ? { Host: HOST_HEADER } : {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function ledgerEnd(): Promise<number> {
  const r = await api<{ offset: number }>("/v2/state/ledger-end");
  return r.offset;
}

export async function listParties(): Promise<string[]> {
  const r = await api<{ partyDetails: unknown }>("/v2/parties");
  const pd = r.partyDetails as any;
  return (Array.isArray(pd) ? pd : [pd]).map((p: any) => p.party);
}

export async function allocateParty(hint: string): Promise<string> {
  const r = await api<{ partyDetails: unknown }>("/v2/parties", {
    method: "POST",
    body: JSON.stringify({ partyIdHint: hint }),
  });
  const pd = r.partyDetails as any;
  return (Array.isArray(pd) ? pd[0] : pd).party;
}

/** Allocate a party with this hint, or reuse the existing one (idempotent across restarts).
 *  Allocate-first: on a shared participant the party list can hold thousands of entries
 *  (paginated), so we try to allocate and, if the party already exists, recover its full id
 *  from the error message — falling back to a paged search. */
export async function allocateOrReuse(hint: string): Promise<string> {
  try {
    return await allocateParty(hint);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (!/already exists/i.test(msg)) throw e;
    // Fast path: on a shared participant the namespace is fixed and known — construct the id.
    if (process.env.PARTY_NAMESPACE) return `${hint}::${process.env.PARTY_NAMESPACE}`;
    // The error message may TRUNCATE the party id — only trust a full-length namespace
    // (fingerprints are "1220" + 64 hex chars); otherwise fall back to the paged search
    // (slow on shared participants with many thousands of parties).
    const esc = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = msg.match(new RegExp(`${esc}::1220[0-9a-fA-F]{64}`));
    if (m) return m[0];
    let pageToken = "";
    do {
      const r = await api<{ partyDetails?: any[]; nextPageToken?: string }>(
        `/v2/parties?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      );
      const hit = (r.partyDetails ?? []).map((p: any) => p.party).find((p: string) => p.startsWith(hint + "::"));
      if (hit) return hit;
      pageToken = r.nextPageToken ?? "";
    } while (pageToken);
    throw e;
  }
}

export interface SubmitResult {
  updateId: string;
  completionOffset: number;
}
export async function submit(actAs: string[], commands: Command[]): Promise<SubmitResult> {
  return api<SubmitResult>("/v2/commands/submit-and-wait", {
    method: "POST",
    body: JSON.stringify({
      // With auth enabled, userId must match the token's ledger user (e.g. "6" on the
      // shared hackathon validator); any label works on a no-auth local sandbox.
      userId: process.env.LEDGER_USER_ID ?? "atomicnet-backend",
      commandId: `cmd-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      actAs,
      readAs: [],
      commands,
    }),
  });
}

/** Active contracts visible to `party` (the ledger filters by stakeholder = real privacy). */
export async function activeContracts(party: string): Promise<Contract[]> {
  const offset = await ledgerEnd();
  if (offset <= 0) return [];
  const raw = await api<any[]>("/v2/state/active-contracts", {
    method: "POST",
    body: JSON.stringify({
      activeAtOffset: offset,
      eventFormat: {
        filtersByParty: {
          [party]: {
            cumulative: [
              { identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } },
            ],
          },
        },
        verbose: false,
      },
    }),
  });
  return raw
    .map((row) => row?.contractEntry?.JsActiveContract?.createdEvent)
    .filter(Boolean)
    .map((ce: any) => ({
      templateId: ce.templateId,
      contractId: ce.contractId,
      payload: ce.createArgument,
      signatories: ce.signatories ?? [],
      observers: ce.observers ?? [],
    }));
}

/** Filter contracts by qualified template name, e.g. "AtomicNet.Cash:Deposit". */
export function ofTemplate(contracts: Contract[], qualifiedName: string): Contract[] {
  return contracts.filter((c) => c.templateId.endsWith(`:${qualifiedName}`));
}
