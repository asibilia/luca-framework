# Postmortem — Run run_mot10qqe_2gqytmiv

- **Started**: 2026-05-05T19:33:39.542Z
- **Ended**: 2026-05-07T15:00:26.599Z
- **Duration**: 2607 min

## Violations

- **Critical**: 0
- **Warning**: 2

| Severity | Code | Message |
| --- | --- | --- |
| warning | `WAVE_NO_VERIFICATION` | Blocked attempt to advance wave without verification-result. Tool layer prevented the unsafe transition. |
| warning | `PIPELINE_GUARD_IDLE_BYPASS` | Pipeline-guard skipped enforcement because pipelineStep was idle. May indicate stale state contamination. |

## Phases

### Phase A — Project preferences foundation

- Started: 2026-05-07T14:29:25.400Z | Completed: ?
- Diff: _(indeterminate — non-git or no snapshot)_

## Metrics

- **totalEvents**: 59
- **modeTransitions**: 8
- **phasesCompleted**: 0
- **emptyPhasesJustified**: 0
- **todosMovedToDone**: 0
- **lowConfidenceCount**: 0
- **forcedTransitions**: 0
- **moveBlockedCount**: 0

## What to do next

- ⚠ Warnings present but non-blocking. Review the table above before merging.
