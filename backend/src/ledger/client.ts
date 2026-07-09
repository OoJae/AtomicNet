// Thin hand-rolled client for the Canton JSON Ledger API v2.
// Reads are performed AS a given party — the ledger does the privacy filtering, not us.
// Works against: a local `dpm sandbox` (no auth), and a Splice validator node's JSON API
// (nginx vhost `json-ledger-api.localhost` — set JSON_API_HOST_HEADER when the URL is an
// IP/localhost; set LEDGER_API_TOKEN if the validator runs with auth enabled, `-a`).
const JSON_API = process.env.JSON_API_URL ?? "http://localhost:7575";
const HOST_HEADER = process.env.JSON_API_HOST_HEADER; // e.g. json-ledger-api.localhost
const TOKEN = process.env.LEDGER_API_TOKEN; // Bearer token (only if auth is enabled)

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
  const res = await fetch(JSON_API + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(HOST_HEADER ? { Host: HOST_HEADER } : {}),
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
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

/** Allocate a party with this hint, or reuse an existing one (idempotent across restarts). */
export async function allocateOrReuse(hint: string): Promise<string> {
  const existing = (await listParties()).find((p) => p.startsWith(hint + "::"));
  return existing ?? (await allocateParty(hint));
}

export interface SubmitResult {
  updateId: string;
  completionOffset: number;
}
export async function submit(actAs: string[], commands: Command[]): Promise<SubmitResult> {
  return api<SubmitResult>("/v2/commands/submit-and-wait", {
    method: "POST",
    body: JSON.stringify({
      userId: "atomicnet-backend",
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
