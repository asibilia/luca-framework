// Barrel exports for the telemetry domain.
//
// MINIMAL SINK. `.luca/telemetry/<runId>.jsonl` is no longer a general pipeline
// event log — LangSmith owns that. What remains is the recall-quality family
// (`recall.hit` / `recall.miss` / `recall.utilization`), which LangSmith cannot
// observe, plus the slug/wave records the `trace-insights` Stage A5 join reads.
// See `./schemas.ts` for the full rationale.

export {
    RecallOutcomeMetaSchema,
    RecallUtilizationMetaSchema,
    TelemetryRecordSchema,
} from './schemas.ts'
export type {
    RecallOutcomeMeta,
    RecallUtilizationMeta,
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
