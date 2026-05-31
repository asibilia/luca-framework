---
"@alecsibilia/luca": patch
---

Add `mode.start` / `mode.end` telemetry records emitted from `switch-mode` in `workflow-state.ts`. Captures outer pipeline loop durations (triage, research, architect, execute, review, finalize) that were missing from the v1 telemetry foundation (PR #239). Extends `TelemetryRecord.kind` union, adds `currentModeStartedAt` to `LucaWorkflowState`.
