# Context — Prompt Engineering Hardening & Context Window Architecture Milestone

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **Phasing strategy** | 5 focused phases matching sprint dependency graph | Research identified a hard dependency chain: Sprint 1-2 (prompt eng) → Sprint 3 (shared prefix) → Sprint 4 (mid-conv injection) → Sprint 5 (context architecture). Mega-phase risks cascade failures. 5 phases enable incremental verification and rollback. |
| 2 | **Shared prefix injection point** | Central injection in `index.ts` at subagent registration time (lines 614-624) | Cleaner: one code change vs. 9 file edits. The prefix IS mode-agnostic (behavioral constraints apply to all subagents equally). Per-file import is more verbose and creates 9 maintenance points. Central injection follows the existing `HARD_CONSTRAINTS` pattern for mode agents. |
| 3 | **HARD_CONSTRAINTS dual-injection heading** | Front-injected copy uses `## Core Operating Rules` heading; back-injected keeps `## Hard Constraints (all modes)` | Research identified heading collision as a guaranteed bug if same heading used twice. Different headings exploit primacy (Core Operating Rules, first thing the model sees) and recency (Hard Constraints, last thing) without structural ambiguity. |
| 4 | **Recency reminder placement** | Integrated into `getAgentConstraints()` as the absolute last content | Research showed appending reminders AFTER constraints pushes stop-directives from terminal position. By making reminders part of `getAgentConstraints()`, they're guaranteed to be the absolute last content in every mode's instructions. The lazy singleton must be replaced with a per-call function to support dynamic reminders. |
| 5 | **Conditional MCP loading granularity** | Mode-level only (Phase 1); defer subagent-level to future milestone | Mode-level conditional loading is the 80/20 play — saves ~15K tokens for the 7 lightweight modes (fast, build, plan, triage, research, architect, review). Subagent MCP injection at startup (index.ts:664-675) is a separate code path with different timing constraints; mixing both risks subtle bugs. |
| 6 | **Context architecture items (Sprint 5) scope** | Implement token budget monitor + conditional MCP loading this milestone. Defer cache boundary and progressive compaction to future milestone pending Mastra API investigation. | Token budget monitoring (character heuristic) and conditional MCP loading have zero Mastra API dependencies — they're pure TypeScript. Cache boundary requires unknown Mastra array-prompt support. Progressive compaction requires tool result interception. Deferring uncertain items avoids blocking the deliverable milestone. |
| 7 | **Testing strategy** | No prerequisite test phase; add minimal smoke validation in PLAN.md verification criteria | Zero test coverage is a real risk, but adding a test framework is a separate concern that would expand scope beyond the 18 todos. Verification criteria in the plan will specify manual pipeline validation checks after each phase. The backlog already has a "add snapshot tests" todo from research. |
| 8 | **Token budget ceiling** | Accept +4,500 tokens with MuninnDB present; net savings of -10,500 tokens without MuninnDB | The 4,500 token overhead is acceptable given: (a) conditional MCP loading saves 15K+ when MuninnDB absent, (b) OM thresholds at 50K/60K provide ample headroom, (c) the behavioral improvements (anti-sycophancy, quantified constraints) justify the overhead in output quality. |
| 9 | **`getAgentConstraints()` refactor** | Replace lazy singleton with per-call function | The lazy cache (`_agentConstraints`) prevents dynamic content injection. Mid-conversation reminders and dual-injection require per-call evaluation. The `loadAlwaysApplyRules()` call is cheap (reads from an already-installed local directory). Performance impact is negligible — `readFileSync` on local `.mastracode/rules/` is sub-millisecond. |
| 10 | **4th HARD_CONSTRAINT ("no prose between tool calls")** | Include in Sprint 1 alongside dual-injection | This constraint is the most commonly violated anti-pattern across all modes. Adding it alongside the existing 3 constraints keeps the total under the 200-token budget. The "because" clause makes it teachable. |
| 11 | **Quantified directive values** | Use research-provided values as starting point, validated against BUDGET_MATRIX | Research provided specific quantified replacements for each qualitative directive. Cross-reference against `BUDGET_MATRIX` in `luca-store.ts` to avoid conflicts (e.g., don't say "max 3 attempts" in prompt if matrix allows 4 for COMPLEX/quality). |
| 12 | **Attention curve restructuring approach** | Move HARD_CONSTRAINTS summary to primacy zone (first 3-5 lines) of each .md file + add recency footer | Research shows U-shaped attention: first and last ~200 tokens get equal attention. Front-load a brief constraint summary in the ## Role section. Keep full constraints appended via `getAgentConstraints()`. Recency footer in `getAgentConstraints()` reinforces critical rules. |
| 13 | **Effective scope for this milestone** | 16 of 18 todos (defer cache boundary and progressive compaction) | Deferred items depend on unknown Mastra API capabilities. 16 remaining items are fully implementable with current framework. Creates a clean deliverable milestone. |

## Constraints

- All changes are internal to `packages/luca-mastracode` — no cross-package modifications
- Instruction `.md` changes are hot-reloadable; subagent `.ts` changes require type-check
- The `shadow-scanner.ts` has fan-in 2 — exported utility functions must remain stable
- `HARD_CONSTRAINTS` total must stay under 200 tokens (including new 4th constraint)
- Quantified limits must not conflict with BUDGET_MATRIX programmatic limits
- The `_agentConstraints` lazy cache must be replaced before mid-conversation injection can work

## Scope Boundaries

**In scope (16 items):**
1. Anti-sycophancy quality gate (reviewer subagent)
2. Self-distrust mandates (all subagents)
3. Attention curve exploitation (10 instruction files)
4. HARD_CONSTRAINTS dual-injection + "because" clauses + 4th constraint
5. Tool description behavioral enrichment (10 tools)
6. Subagent instruction upgrades (9 subagents)
7. Template compression (instruction files)
8. Quantified directives (9 instruction files)
9. Shared subagent instruction prefix
10. Conditional MCP loading per mode
11. Mid-conversation injection infrastructure (context refresher)
12. Token budget monitoring
13. Bidirectional tool constraints
14. Cross-tool coordination directives
15. luca-reminder convention
16. Instruction file restructuring for attention curves

**Deferred to future milestone (2 items):**
- Cache boundary in prompt assembly (blocked on Mastra API investigation)
- Progressive context compaction pipeline (blocked on Mastra tool result interception)

## Priority Ordering
1. **Highest**: HARD_CONSTRAINTS dual-injection + "because" clauses (affects all modes, foundation for other changes)
2. **High**: Attention curve restructuring + quantified directives (touches all instruction files, do together)
3. **High**: Shared subagent prefix + anti-sycophancy + self-distrust (touches all subagent files, do together)
4. **Medium**: Conditional MCP loading + token budget monitor (new infrastructure)
5. **Medium**: Mid-conversation injection (depends on #1-3 being stable)
6. **Lower**: Tool description enrichment (independent, can parallelize)
