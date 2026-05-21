# Context: 4-Todo PR

## Decisions (full-auto defaults, justified by research)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Recall directive placement | Outer SUBAGENT_SHARED_PREFIX block (after MEMORY_TIER_DISCIPLINE, before Luca Reminders) | MEMORY_TIER_DISCIPLINE at 1590/1600 — no headroom. Outer block has no size test (we'll add one). |
| Recall directive scope | Once per subagent start, hedged with "if MuninnDB tools available" | Plan-reviewer + shadow-scanner have no MCP. Hedging avoids dead-weight. |
| Hang-timeout mechanism | Prose-level orchestrator directive in research.md (Date.now elapsed-check + `outcome:'timeout'`) | HarnessSubagent has no timeoutMs API. No harness.abortSubagent. Prose is only path. |
| Hang-timeout floor | 60s hardcoded | Conservative; research subagents commonly 30-90s. Premature-kill risk acceptable. |
| Outcome enum scope | NO schema change (already 6 values). Only SKILL.md:122 flag list + parametric test | Todo description stale per research. |
| Model normalization scope | (a) execute.md:161 stale example fix (b) CR/LF guard on `model` field (c) NO model-routing.ts changes | Subagents have no `model:` field. Mode-level pin already consistent. Real gap is security. |
| Total prefix size guard | Add `SUBAGENT_SHARED_PREFIX.length < 4000` test | Catches future bloat. Current ~1710 leaves headroom. |
| Skip discussion subagent | YES | Full-auto, intent unambiguous, research already clarified all questions. |

## Scope Boundaries

**IN scope:**
- shared-prefix.ts pre-invoke recall section
- research.md hang-timeout prose directive
- skills/luca-telemetry-report/SKILL.md:122 flag-list expansion
- workflow-state.ts:339 `model` field CR/LF regex
- execute.md:161 stale model ID example fix
- 4 regression tests
- Changeset (minor)

**OUT of scope:**
- model-routing.ts version-pin overhaul (open question, defer)
- New MAX_PARALLEL_SUBAGENTS constant (no clear need)
- Per-tier timeout (60s blanket for now)
- HarnessSubagent timeoutMs upstream PR

## Constraints

- shared-prefix.ts inline prose only (no fenced blocks — agents treat as documentation)
- Directive prose ≤4 bullets to respect 9× multiplier
- All telemetry-touching tests run with mocked appendTelemetry
