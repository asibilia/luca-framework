// Barrel exports for the ledger domain.
// Append-only session event log at `.luca/ledger.jsonl`.

export { LedgerEntrySchema } from './schemas.ts'
export type { LedgerEntry } from './schemas.ts'

export {
    appendLedger,
    computeSessionMetrics,
    getLedgerByEvent,
    listRuns,
    readLedger,
    readLedgerForRun,
} from './ledger.ts'
export type {
    AppendLedgerOptions,
    RunSummary,
    SessionMetrics,
} from './ledger.ts'
