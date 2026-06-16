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

export { generateRunId } from './helpers/generate-run-id.ts'

export { computeOutcomeKpis } from './outcome-kpi.ts'
export type {
    ComputeOutcomeKpisOptions,
    OutcomeKpiBucket,
    OutcomeKpis,
} from './outcome-kpi.ts'
