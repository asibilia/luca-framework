# Research Capture — Architecture

**Subagent**: researcher
**Perspective**: architecture
**Timestamp**: 2026-05-15T17:10:00Z

## Findings

(Subagent emitted no usage; output summarized from invoke + cross-references with patterns/risk dimensions)

**SUBAGENT_SHARED_PREFIX assembly:**
- src/subagents/shared-prefix.ts:11-29 — 4 blocks: Core Operating Rules → Self-Verification → Anti-Sycophancy → ${MEMORY_TIER_DISCIPLINE} → Luca Reminders
- Assembled at launch.ts:222: `SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions`
- File-header warning: "Keep this under 400 tokens. Every token here is multiplied by 9 subagents."

**record-subagent telemetry flow:**
- workflow-state.ts record-subagent action → appendTelemetry → .planning/telemetry/<runId>.jsonl
- outcome enters via meta.outcome (Record<string, unknown>)
- Aggregator skill (luca-telemetry-report/SKILL.md) consumes via `meta.outcome` field

**Subagent invocation flow:**
- 9 HarnessSubagent definitions registered at launch.ts:210-222
- Mastra harness spawns subagents directly via internal runSubagent API
- No orchestrator-side timeoutMs / AbortSignal exists
- `SUBAGENT_INHERITS_MCP` set at launch.ts:137-145 excludes `plan-reviewer` + `shadow-scanner` from MCP tools

**Model pinning:**
- Per MODE (not per subagent) via `defaultModelId` in modes/*.ts
- Tier resolution in src/integration/model-routing.ts:15-19
- Subagents inherit caller mode's model (no per-subagent override)

**Invariants:**
- MEMORY_TIER_DISCIPLINE ceiling: 1600 chars (current 1590 — 10 char headroom)
- No total SUBAGENT_SHARED_PREFIX size test exists
- Outcome enum changes break workflow-state-actions.test.ts assertions
- Model IDs are user-controlled via config — flow into telemetry meta unsanitized
- Harness timeout cannot be reduced below sane floor (no API exists)

**Debt confirmed:**
- run-subagent.ts / parallel-runner.ts do NOT exist (prior session was correct)
- No model-normalization utility in source
- model field validation: .max(64) only — NO CR/LF/tab regex (security gap)
