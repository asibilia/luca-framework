# Research Capture — Patterns

**Subagent**: researcher
**Perspective**: patterns
**Timestamp**: 2026-05-15T17:10:00Z

## Findings

**SUBAGENT_SHARED_PREFIX structure (shared-prefix.ts:11-29, ~1710 bytes, 29 lines):**
- Block 1: Core Operating Rules (3 bullets, lines 12-14)
- Block 2: Self-Verification Mandate
- Block 3: Anti-Sycophancy Directive
- Block 4: ${MEMORY_TIER_DISCIPLINE} (interpolated, ~1590 chars)
- Block 5: Token Usage prose (lines 27-29) — instructs `<!-- usage: {...} -->` self-report

**Existing pre-invoke recall examples:**
- executor.ts:31-42 (pre-commit recall with vault, context, mode, limit)
- discussion.ts:78-93 (recall before discussion)
- shadow-scanner.ts:54-64 (recall for shadow-scanner perspectives)
- learner.ts:67-69 (pre-capture recall)
- 0 matches for `muninn_recall` in shared-prefix.ts (gap confirmed)

**record-subagent schema (workflow-state.ts:319-358 internal, :664-677 flat):**
```ts
outcome: z.enum([
    'completed',
    'completed_no_usage',
    'completed_partial_parse',
    'crashed',
    'killed',
    'timeout',
]).nullable().optional()
```
- role: .min(1).max(64).regex(/^[^\r\n\t]+$/)
- correlationId: .min(1).max(128).regex(/^[^\r\n\t]+$/)
- **model: .max(64).nullable().optional() — NO regex guard (security gap)**

**Existing tests:**
- workflow-state-actions.test.ts:1395-1438 — outcome enum tests
- memory-tier-prefix.test.ts:29-33 (1600 char ceiling), :70-78 (presence check)
- subagent-telemetry-prose.test.ts — record-subagent prose in 5 instruction files

**Current canonical model IDs (model-routing.ts:15-19):**
```ts
fast:     'anthropic/claude-haiku-4-5'
balanced: 'anthropic/claude-sonnet-4-6'
capable:  'anthropic/claude-opus-4-7'
```

**Mode defaultModelId (all 10 modes use dash + anthropic/ prefix):**
- discuss/triage/review/fast/finalize/research/plan: `anthropic/claude-sonnet-4-6`
- architect/execute/build: `anthropic/claude-opus-4-7`

**Stale references found:**
- execute.md:161 telemetry example: `model: "claude-opus-4-5"` (no prefix, old version)

**Directive form patterns:**
- Inline prose with bullets (Core Operating Rules)
- `// →` directive comment (used in execute.md spawn sites)
- NOT fenced code blocks (causes agents to treat as documentation per subagent-telemetry-prose.test.ts:57-70 pitfall)

**Vault resolution pattern (canonical):**
> Read .planning/config.json → muninn.vault, fallback "default"
