# Research: 4-Todo PR — Recall Pattern + Hang-Timeout + Outcome Enum + Model Normalization

## Summary

Scope materially smaller than todo spec implies. **Todo 3 outcome enum already shipped 6 values** (not 3) — only `SKILL.md:122` flag-list needs `timeout` added. **Todo 4 subagent .ts files have no `model:` field** — pin is at MODE level (already consistent); only `execute.md:161` stale example needs fix. Real net-new work: Todo 1 (pre-invoke recall directive in shared-prefix outer block) + Todo 2 (research.md prose-level fast-fail directive) + security patch (CR/LF guard on `model` field).

## Scope

| Todo | Files Touched | Net New |
|------|---------------|---------|
| 1 pre-invoke recall | shared-prefix.ts, memory-tier-prefix.test.ts | YES — directive + size guard |
| 2 hang-timeout | research.md, subagent-telemetry-prose.test.ts | YES — prose directive |
| 3 outcome enum | luca-telemetry-report/SKILL.md:122 | NARROW — flag `timeout` |
| 4 model normalization | execute.md:161, workflow-state.ts:339 + tests | SECURITY PATCH + stale example |

shared-prefix.ts injects into 9 subagents via launch.ts:222. Plan-reviewer + shadow-scanner excluded from MCP (SUBAGENT_INHERITS_MCP at launch.ts:137-145).

## Architecture

**SUBAGENT_SHARED_PREFIX assembly:** 4 blocks at shared-prefix.ts:11-29 — Core Rules → Self-Verification → Anti-Sycophancy → ${MEMORY_TIER_DISCIPLINE} → Luca Reminders → Token Usage prose. Budget warning "<400 tokens × 9 subagents" in file header.

**record-subagent telemetry flow:** workflow-state.ts → appendTelemetry → .planning/telemetry/<runId>.jsonl. outcome stored at meta.outcome. Aggregator skill reads via meta.outcome in Subagent Costs section.

**Harness API:** HarnessSubagent has NO timeoutMs / signal / AbortController. Only `maxSteps`. No harness.abortSubagent API. Hang-timeout must be prose-level orchestrator directive — `Date.now()` elapsed-check + emit `outcome:'timeout'`.

**Model pin:** Per MODE, not per subagent. model-routing.ts:15-19 → tier IDs `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-7`. All 10 modes already consistent.

## Patterns

**Pre-invoke recall canonical form (executor.ts:34-41):**
```ts
mcp__muninn__muninn_recall(
  vault: "<from .planning/config.json → muninn.vault, fallback 'default'>",
  context: ["<task context>"],
  mode: "semantic",
  limit: 5,
)
```

**outcome enum current state (workflow-state.ts:347-357):**
```
['completed', 'completed_no_usage', 'completed_partial_parse', 'crashed', 'killed', 'timeout']
```
shared-prefix.ts:28 already documents all 6.

**Directive form:** inline prose / `// →` directive comment (NOT fenced — causes documentation-treatment per subagent-telemetry-prose.test.ts:57-70 pitfall).

**Model ID format:** `anthropic/claude-<tier>-4-<minor>` (dash form, anthropic/ prefix). Dot form does not exist.

## Dependencies

- mastracode@0.19.0 (exact-pinned), @mastra/core@1.34.0 (exact-pinned)
- No @anthropic-ai/sdk direct dep — model registry via Mastra
- MCP tools opted-in for 7/9 subagents (plan-reviewer + shadow-scanner excluded)
- Canonical pre-invoke recall consumers: muninn_recall, muninn_find_by_entity, muninn_where_left_off

## Risks

**HIGH:**
1. 🔴 Security: `model` field at workflow-state.ts:339 lacks `/^[^\r\n\t]+$/` regex guard (inconsistent with role + correlationId) — CWE-117 log injection risk via AI-parsed `<!-- usage: -->` output. Patch regardless of PR.
2. CI break risk: MEMORY_TIER_DISCIPLINE at 1590/1600 chars (10-char headroom). Adding recall prose to that block fails test. MUST add to outer SUBAGENT_SHARED_PREFIX block + introduce new size guard for the outer prefix.

**MEDIUM:**
3. Hang-timeout — no harness abort API. Prose-only solution → relies on agent compliance. Premature kill on slow CI if floor too low. Recommendation: floor at 60s; emit `outcome:'timeout'` and continue with partial results.
4. plan-reviewer + shadow-scanner get dead-weight instruction if recall directive added to shared-prefix (they have no MCP). Mitigation: prefix prose hedged with "if MuninnDB tools are available".

**LOW:**
5. Outcome enum already 6 values — todo description stale. Real gap: SKILL.md flag list.
6. execute.md:161 stale model ID example — cosmetic but fixes documentation drift.

## Recommendations

1. **Todo 1**: Insert `## Pre-Invoke Memory Recall` block in shared-prefix.ts OUTER block (after MEMORY_TIER_DISCIPLINE, before Luca Reminders), hedged with "if MuninnDB tools available". Inline prose, ≤4 bullets. Add `memory-tier-prefix.test.ts` assertion: `SUBAGENT_SHARED_PREFIX.length < 4000` (current ~1710, headroom for growth, hard cap to catch future bloat). Also assert `.toContain('muninn_recall')` for presence.

2. **Todo 2**: Add prose directive in `research.md` Step "Spawn researchers": agent should capture `const start = Date.now()` per spawn, and if any subagent returns AFTER 60s (configurable per profile?) treat as timeout — emit `outcome:'timeout'`. Use existing 'timeout' enum value. Add subagent-telemetry-prose.test.ts assertion for `'timeout' in research.md` near spawn site.

3. **Todo 3**: Update `skills/luca-telemetry-report/SKILL.md:122` flag list from `{crashed, killed}` to `{crashed, killed, timeout, completed_no_usage, completed_partial_parse}` (full non-success terminal set). Add a parametric test in workflow-state-actions.test.ts iterating all 6 valid outcomes.

4. **Todo 4**: (a) Fix `execute.md:161` example from `"claude-opus-4-5"` → `"anthropic/claude-opus-4-7"`. (b) Add CR/LF/tab regex to `model` field in workflow-state.ts:339 — `.regex(/^[^\r\n\t]+$/)`. Add regression test in workflow-state-actions.test.ts. (c) Audit model-routing.ts canonical IDs — confirm they match current Anthropic alias scheme (DEFER deeper version-pin decision to user — see Open Questions).

## Open Questions

1. **Should `model-routing.ts` use dated aliases (e.g. `claude-opus-4-5-20250929`)?** Current scheme uses bare `4-7`/`4-6` minor versions. If these are mastracode-internal aliases (not Anthropic API IDs), the audit is no-op. If they map directly to Anthropic API, may break on alias deprecation. RECOMMEND: keep current scheme unless user wants stricter pinning.

2. **What's "10-subagent pin" mean exactly?** No `MAX_PARALLEL_SUBAGENTS` constant exists. Interpretation 1: pin all 10 MODES (already done). Interpretation 2: parallel batch cap (research=5, review=4, batch≤10 implied). RECOMMEND: interpret as "10 modes already pinned consistently — Todo 4 is mostly documentation drift fix + security patch".

3. **Hang-timeout floor value?** 60s arbitrary. Could be tier-dependent: fast=30s, balanced=60s, capable=120s. RECOMMEND: single hardcoded 60s in prose, document as configurable via future workflow-config update.

4. **Pre-invoke recall: forced before EVERY tool call, or just first MCP call?** Spec says "before first call". RECOMMEND: directive triggers ONCE at subagent start, not per-tool.
