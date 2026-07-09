// Typed client for the AtomicNet backend (proxied at /api by the Vite dev server).
export interface PartyInfo { name: string; party: string }
export interface InvoiceRow { status: string; cid: string; invoiceId: string; issuer: string; payer: string; amount: number; currency: string }
export interface NetRow { status: string; cid: string; subsidiary: string; netAmount: number; cycleId: string }
export interface Dashboard { party: string; partyId: string; balances: Record<string, number>; invoices: InvoiceRow[]; netPositions: NetRow[] }
export interface Visibility { party: string; totalVisible: number; byType: Record<string, number>; invoices: { invoiceId: string; issuer: string; payer: string; amount: number; currency: string }[] }
export interface CyclePosition { subsidiary: string; netAmount: number; approved: boolean }
export interface CycleView { cycleId: string; status: string; settlementCurrency: string; fxRates: { base: string; quote: string; rate: number }[]; positions: CyclePosition[]; allApproved: boolean; reduction: { gross: number; net: number } }
export interface GraphEdge { from: string; to: string; amount: number; currency: string }
export interface NetEdge { payer: string; receiver: string; amount: number }
export interface GraphView { activeCycleId?: string; grossEdges: GraphEdge[]; positions: { subsidiary: string; netAmount: number }[]; netEdges: NetEdge[]; reduction: { gross: number; net: number } }

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${res.status} ${path}`);
  return res.json() as Promise<T>;
}
const post = <T>(path: string, body?: unknown) => http<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  config: () => http<{ writeLocked: boolean }>("/config"),
  parties: () => http<PartyInfo[]>("/parties"),
  dashboard: (party: string) => http<Dashboard>(`/p/${party}/dashboard`),
  visibility: (party: string) => http<Visibility>(`/p/${party}/visibility`),
  graph: () => http<GraphView>("/graph"),
  cycle: (id: string) => http<CycleView>(`/cycle/${id}`),
  audit: () => http<{ party: string; totalVisible: number; byType: Record<string, number> }>("/audit"),

  proposeInvoice: (issuer: string, b: { payer: string; amount: number; currency: string; invoiceId: string }) => post(`/p/${issuer}/invoices/propose`, b),
  acceptInvoice: (payer: string, id: string) => post(`/p/${payer}/invoices/${id}/accept`),
  openCycle: (b: { cycleId: string }) => post("/cycle/open", b),
  lockCycle: (id: string) => post<{ ok: boolean; nets: { subsidiary: string; netAmount: number }[] }>(`/cycle/${id}/lock`),
  approve: (party: string, id: string) => post(`/p/${party}/cycle/${id}/approve`),
  allocate: (party: string, id: string) => post(`/p/${party}/cycle/${id}/allocate`),
  settle: (id: string) => post<{ ok: boolean; settled: number; balances: Record<string, number> }>(`/cycle/${id}/settle`),
  runDemo: () => post<{ cycleId: string; nets: { subsidiary: string; netAmount: number }[]; settled: number; balances: Record<string, number> }>("/demo/run"),
};

export const fmt = (n: number, ccy = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 2 }).format(n);
export const signed = (n: number, ccy = "USD") => (n > 0 ? "+" : "") + fmt(n, ccy);
