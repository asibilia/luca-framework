// Barrel exports for the telemetry domain.
// Append-only per-run event log at `.luca/telemetry/<runId>.jsonl`.

export { TelemetryRecordSchema } from './schemas.ts'
export type { TelemetryKind, TelemetryRecord } from './schemas.ts'

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
