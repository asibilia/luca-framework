# Context — Telemetry Batch Decisions

## Locked Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| #29 outcome placement | `meta.outcome` enum, NOT top-level | v:1 schema locked — top-level = v:2 break. Aggregator handles old/new mixed. |
| #10 scope | **Absorb into #43 aggregator** as `durationMs` fallback column (`Date.parse(complete.ts) - Date.parse(invoke.ts)`). Close #10 standalone. | Real-time orchestrator-side unfixable (no in-process Map, same-LLM-turn emit). |
| #18 verification | Drive-by regression test only — assert PR #247 fix covers BOTH reviewer-dx + reviewer-simpl. No code change unless gap. | Already shipped in alpha.5/alpha.6. |
| Janitor trigger | `reset-pipeline` only, NOT `re-enter-pipeline` | re-enter mid-pipeline = live data; archive prior-run on full reset. |
| Aggregator state | Stateless single-shot | Cursor unnecessary for current corpus size. Re-run = re-scan. |
| TelemetryKind new strings | `recall.hit`, `recall.miss`, `review.iteration` | Union is open (`string & {}`); these added for IDE autocomplete only. |
| Schema location | New action schemas in `src/tools/workflow-state.ts` (mirror record-subagent) | Single-source pattern. No new file needed. |

## Out-of-Scope Carve-Outs

- harness/ — read-only
- Existing skills (memory-audit, luca-init, etc.) — preserve unchanged
- Telemetry corpus migration — none exists (lazy-created)
- research.md `record-recall` prose — zero `muninn_recall` callsites in research.md

## Slim-Down Sequel Note

This batch completes telemetry stack. Next phase: run `/luca-telemetry-report` against accumulated data to validate slim-down assumptions before #41 (todo YAML frontmatter foundation).
