// Barrel exports for the telemetry domain.
// Append-only per-run event log at `.luca/telemetry/<runId>.jsonl`.

export {
    ClassifierOverrideMetaSchema,
    FailureDumpMetaSchema,
    OverrideSourceSchema,
    SatisfactionSignalMetaSchema,
    TelemetryRecordSchema,
} from './schemas.ts'
export type {
    ClassifierOverrideMeta,
    FailureDumpMeta,
    OverrideSource,
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
