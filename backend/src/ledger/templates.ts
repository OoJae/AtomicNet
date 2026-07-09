// Template IDs + Create/Exercise command builders for the AtomicNet model.
// ALL commands (creates AND exercises) use the `#<package-name>:Module:Entity` form:
// Canton 3.5+ dropped package-id template references on the Ledger API, so the ACS's
// package-id `templateId` must never be echoed back into commands.
import type { Command } from "./client.ts";

const PKG = "#atomicnet-model";
const tid = (module: string, entity: string): string => `${PKG}:${module}:${entity}`;

/** Submission template IDs (package-name form). */
export const T = {
  InvoiceProposal: tid("AtomicNet.Invoice", "InvoiceProposal"),
  IntercompanyInvoice: tid("AtomicNet.Invoice", "IntercompanyInvoice"),
  NettingCycle: tid("AtomicNet.Cycle", "NettingCycle"),
  NetPosition: tid("AtomicNet.NetPosition", "NetPosition"),
  ApprovedNetPosition: tid("AtomicNet.NetPosition", "ApprovedNetPosition"),
  Deposit: tid("AtomicNet.Cash", "Deposit"),
  DepositAllocation: tid("AtomicNet.Cash", "DepositAllocation"),
  SettlementBatch: tid("AtomicNet.Settlement", "SettlementBatch"),
} as const;

/** Qualified names for ACS filtering (the ledger returns package-id:Module:Entity). */
export const QN = {
  InvoiceProposal: "AtomicNet.Invoice:InvoiceProposal",
  IntercompanyInvoice: "AtomicNet.Invoice:IntercompanyInvoice",
  NettingCycle: "AtomicNet.Cycle:NettingCycle",
  NetPosition: "AtomicNet.NetPosition:NetPosition",
  ApprovedNetPosition: "AtomicNet.NetPosition:ApprovedNetPosition",
  Deposit: "AtomicNet.Cash:Deposit",
  DepositAllocation: "AtomicNet.Cash:DepositAllocation",
  SettlementBatch: "AtomicNet.Settlement:SettlementBatch",
} as const;

export const create = (templateId: string, createArguments: Record<string, unknown>): Command => ({
  CreateCommand: { templateId, createArguments },
});

export const exercise = (
  templateId: string,
  contractId: string,
  choice: string,
  choiceArgument: Record<string, unknown> = {},
): Command => ({ ExerciseCommand: { templateId, contractId, choice, choiceArgument } });

/** Daml decimals are JSON strings; format a number to 2dp for the ledger. */
export const dec = (n: number): string => n.toFixed(2);

/** Daml Tuple2 / Tuple3 are encoded as records with _1/_2/_3 fields. */
export const tuple2 = (a: unknown, b: unknown) => ({ _1: a, _2: b });
export const tuple3 = (a: unknown, b: unknown, c: unknown) => ({ _1: a, _2: b, _3: c });
