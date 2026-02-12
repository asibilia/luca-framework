# Phase 16 Context — Context-Modular Sub-Agent Architecture

**Phase:** 16
**Created:** 2026-02-11
**Complexity:** COMPLEX
**Requirements:** CTXM-01 through CTXM-06

---

## Decisions

### 1. Context Budget Model — Additive Tier-Mapped Profiles

**Decision:** Extend the T0-T3 cognition tier system to also control task context. Each tier defines what context sections a sub-agent receives, following an additive pattern:

| Tier | Cognitive Context (Phase 15) | Task Context (Phase 16)                                  |
| ---- | ---------------------------- | -------------------------------------------------------- |
| T0   | None                         | Plan content only                                        |
| T1   | Selective MEMORY recall      | + BRAIN.md summary / project conventions                 |
| T2   | + WORKING.md session state   | + STATE.md + selective MEMORY + WORKING.md               |
| T3   | + Full BRAIN + MEMORY        | + Full BRAIN + full MEMORY + summaries from other agents |

**Rationale:** Leverages Phase 15 infrastructure directly. Additive tiers are easy to reason about — each level includes everything below it plus new sections.

**Key detail:** Cognitive tier and context tier are **two independent dimensions** with **independent promotion tracks**.

### 2. Independent Promotion — Context Promotes More Aggressively

**Decision:** Context promotion triggers one complexity level lower than cognitive promotion.

| Complexity | Cognitive Promotion | Context Promotion |
| ---------- | ------------------- | ----------------- |
| TRIVIAL    | None                | None              |
| SIMPLE     | None                | None              |
| MODERATE   | None                | T0→T1, T1→T2      |
| COMPLEX    | T1→T2, T2→T3        | T1→T2, T2→T3      |
| CRITICAL   | T0→T1 (+above)      | T0→T1 (+above)    |

**Rationale:** Giving an agent more task context is cheap (just more text in prompt), while cognitive promotion has higher overhead (BRAIN/MEMORY loading, recall filtering). So context expansion happens earlier.

### 3. Output Reservation — Advisory

**Decision:** The 25-50% output reservation from TALE framework research is documented as a best practice in agent definitions, not enforced at runtime.

**Rationale:** Claude Code's Task tool doesn't expose token limit parameters. No mechanism for hard enforcement. Prompt engineering and good context selection achieve the same goal.

### 4. Universal Result Envelope — Zod Schema

**Decision:** Define a universal result envelope as a Zod schema that all sub-agents must return:

```typescript
{
  status: 'passed' | 'failed' | 'partial' | 'unknown',
  summary: string,           // 2-3 sentence summary
  artifacts: Artifact[],     // Files created/modified
  issues: Issue[],           // Findings with severity + source agent tag
  metadata: Record<string, unknown>  // Agent-specific data
}
```

**Implementation:** Zod schema in `src/context/result-envelope.ts` with parsing utility. On parse failure, fallback to raw output as `summary` with `status='unknown'`.

### 5. Conflict Resolution — Keep All, Tag Source

**Decision:** When multiple agents flag the same file:line with different severities, keep ALL findings tagged with their source agent. No auto-resolution — the orchestrator (or user in UAT) sees both perspectives.

**Rationale:** Transparency over automation. Different reviewers have different domain expertise. Collapsing findings loses information. Deduplication happens by file:line, but severity conflicts are preserved.

### 6. Writer/Reviewer Isolation — Two Depths

**Decision:** Two isolation levels for different agent roles:

| Isolation Level | Applies To                                                          | Context Included                                                   | Context Excluded                                                            |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Cold**        | Code reviewers (dx-advocate, code-simplifier, code-architect, etc.) | Git diff + BRAIN.md conventions                                    | Plan content, execution history, WORKING.md, SUMMARY.md                     |
| **Warm**        | Verifier (lu-verifier)                                              | Plan content + SUMMARY.md + harness results + ROADMAP requirements | Execution history, WORKING.md (prevents bias from executor self-assessment) |

**Rationale:** Reviewers need fresh perspective (cold). Verifier needs plan context for goal-backward verification (AUDIT-03) and specification anchoring (AUDIT-04), but NOT executor opinions about what went well.

### 7. Sub-Agent Spawning — Context Assembly Functions

**Decision:** Create TypeScript context assembly functions in a new `src/context/` module:

- `context-profiles.ts` — Tier definitions and context section mappings
- `context-assembler.ts` — Assembly functions per agent role
- `result-envelope.ts` — Zod schema + parsing utility with fallback

**Compilation:** Build-time compilation into SKILL.md and agent .md files via `bun run build:all`. No runtime TypeScript execution.

**Separation principle:** `.claude/agents/*.md` = instructions (HOW to behave). Orchestrator assembles context (WHAT to work on) based on tier profiles. This matches how Claude Code's built-in subagent types already work.

### 8. Agent Identity vs Task Context — Clean Separation

**Decision:** Agent definitions (`.claude/agents/*.md`) contain behavioral instructions only. Task-specific context (plan content, state, memory recall, diffs) is assembled by the orchestrator at spawn time based on the agent's tier-mapped context profile.

**Rationale:** Agents are reusable across phases. Context is phase-specific. Mixing them couples agent behavior to specific workflows.

---

## Deferred Ideas

_(None raised during discussion — all topics stayed within Phase 16 scope)_

---

## Requirements Mapping

| Requirement                          | Decision          | Notes                                                            |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------- |
| CTXM-01 (Context isolation)          | Decisions 1, 6, 8 | Tier-mapped profiles + isolation depths                          |
| CTXM-02 (Budget allocation)          | Decisions 1, 2, 3 | Additive tiers + independent promotion + advisory output reserve |
| CTXM-03 (Result aggregation)         | Decisions 4, 5    | Universal envelope + keep-all conflict resolution                |
| CTXM-04 (Progressive disclosure)     | Decision 1        | Additive tiers = progressive by definition (T0→T3)               |
| CTXM-05 (Writer/reviewer separation) | Decision 6        | Cold (reviewers) + warm (verifier)                               |
| CTXM-06 (Task tool patterns)         | Decisions 7, 8    | Context assembly functions + agent/context separation            |

---

_Context gathered: 2026-02-11_
_Complexity: COMPLEX_
_Gray areas discussed: 4 (Context Budget, Result Aggregation, Writer/Reviewer Isolation, Spawning Patterns)_
_Decisions locked: 8_
