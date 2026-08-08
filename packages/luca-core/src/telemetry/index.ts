// Barrel exports for the telemetry domain.
// Append-only per-run event log at `.luca/telemetry/<runId>.jsonl`.

export {
    ClassifierOverrideMetaSchema,
    FailureDumpMetaSchema,
    OverrideSourceSchema,
    PrOutcomeMetaSchema,
    RecallUtilizationMetaSchema,
    SatisfactionSignalMetaSchema,
    TelemetryRecordSchema,
} from './schemas.ts'
export type {
    ClassifierOverrideMeta,
    FailureDumpMeta,
    OverrideSource,
    PrOutcomeMeta,
    RecallUtilizationMeta,
    SatisfactionSignalMeta,
    TelemetryKind,
    TelemetryRecord,
} from './schemas.ts'

export {
    appendTelemetry,
    buildTelemetryRecord,
    readTelemetry,
} from './telemetry.ts'
export type {
    AppendTelemetryOptions,
    ReadTelemetryOptions,
    TelemetryContext,
    TelemetryOverrides,
} from './telemetry.ts'

// `generateRunId` is NOT re-exported here: it is owned by the ledger domain
// (`ledger/helpers/generate-run-id.ts`) because it mints `state.sessionId`.
// Both are surfaced from the package root barrel, so importers are unaffected.

export { computeOutcomeKpis } from './outcome-kpi.ts'
export type {
    ComputeOutcomeKpisOptions,
    OutcomeKpiBucket,
    OutcomeKpis,
} from './outcome-kpi.ts'
