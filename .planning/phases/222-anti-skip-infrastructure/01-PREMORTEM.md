# Phase 222: Anti-Skip Infrastructure — Pre-Mortem Risk Brief

**Complexity:** COMPLEX
**Risk Rating:** MEDIUM-HIGH (3 domain-specific scenarios, all mitigatable)

## Failure Scenarios

### 1. Guard Exception Swallowing Defeats Gap Detector

**Scenario:** `executeDAG` swallows guard exceptions as silent skips, recording bare string IDs in `skippedSteps`. The gap detector cannot distinguish "guard returned false" from "guard threw exception" — producing false-negative audit results for required steps.

**Probability:** HIGH (code path confirmed in dag-executor.ts lines 183-208)
**Impact:** MEDIUM (gap detector reports clean when gaps exist)

**Mitigation:** Before implementing `gap-detector.ts`, extend `DAGCheckpointSchema.skippedSteps` from `z.array(z.string())` to `z.array(z.object({ id: z.string(), reason: z.enum(['guard-false', 'guard-exception', 'flag-skip']), optional: z.boolean() }))`. Update `executeDAG` to write structured entries.

### 2. Pre-Step Hook TTL Collision Silently Disables Enforcement

**Scenario:** Two different skills fire within the 1-2s TTL window during parallel wave execution (`Promise.allSettled` fan-out). The second Skill call exits 0 immediately, bypassing pre-step validation entirely. Enforcement is silently absent with no error.

**Probability:** MEDIUM (parallel wave execution is legitimate and expected)
**Impact:** HIGH (enforcement disabled for concurrent steps)

**Mitigation:** Lower TTL to 200ms (sufficient for duplicate-within-same-event-loop collapse). Document TTL constraint in hook source. Ensure guard key includes `toolName` + session prefix for narrow scoping.

### 3. Progressive Disclosure Zone Signal Diverges from Actual Token Count

**Scenario:** `executeProgressively()` captures zone signal once at call time. Structured summaries consume tokens as waves progress. Later waves receive verbose summaries (GOOD-zone quality) when actual budget has crossed into DEGRADING, compressing context headroom.

**Probability:** MEDIUM (multi-wave phases will cross zone boundaries)
**Impact:** MEDIUM (quality degradation in later waves)

**Mitigation:** Re-query context zone via `resolveContextTier()` at each wave boundary, not just at invocation time. Accept `contextMode` parameter for testing override, but do not replace per-wave re-evaluation.

## Plan Constraints

1. `DAGCheckpointSchema.skippedSteps` type must be widened BEFORE `gap-detector.ts` is authored (first sub-task of Layer 4)
2. Pre-step hook TTL must be explicitly specified in TypeScript source comment (not left to framework default)
3. `executeProgressively()` must re-query context zone per wave boundary
4. Manual smoke-test procedures must be documented in plan verification criteria (no automated tests available per no-tests.md rule)
