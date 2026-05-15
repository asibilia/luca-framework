# Research Capture — Risk

**Subagent**: researcher
**Perspective**: risk
**Timestamp**: 2026-05-15T17:10:00Z

## Findings

**Risk 1 — Pre-invoke recall in SUBAGENT_SHARED_PREFIX (HIGH severity):**
- MEMORY_TIER_DISCIPLINE: 1590 chars vs 1600 ceiling (10-char headroom — adding to that block FAILS test)
- No total prefix size test — adding to outer block hides bloat
- 9× token multiplier
- plan-reviewer + shadow-scanner have no MCP → dead-weight instruction
- Recommendation: add recall to OUTER block (not MEMORY_TIER_DISCIPLINE) + add a new size assertion

**Risk 2 — Hang-timeout (MEDIUM):**
- Zero wall-clock timeout infra. Only `maxSteps` guard
- No harness abort API → prose-only solution at orchestrator level (research.md)
- Premature kill risk on slow CI: needs sane floor (≥60s, ideally configurable)
- Pattern: agent must `Date.now()` check elapsed time, emit `outcome:'timeout'` on complete

**Risk 3 — Outcome enum (LOW — already done):**
- Schema already 6 values, shared-prefix already documents all 6
- Real gap: SKILL.md:122 flag condition `outcome in {crashed, killed}` missing `timeout`
- No parametric test iterating all 6 values

**Risk 4 — Model normalization (HIGH):**
- 🔴 SECURITY GAP: `model` field has NO CR/LF/tab regex guard
  - workflow-state.ts:339 — `model: z.string().max(64).nullable().optional()`
  - Inconsistent with `role` (line 326) + `correlationId` (line 332) which both have `/^[^\r\n\t]+$/`
  - Model values come from AI-parsed `<!-- usage: -->` output — injection risk → CWE-117 log injection in JSONL
- Mode-level model pin canonical; subagents have NO model field — Todo 4 "pin all 10 subagents" maps to **pinning the 10 modes** (already consistent, but execute.md:161 example is stale)
- 10-subagent pin interpretation: unclear — likely means parallel batch cap (research mode spawns 5; review spawns 4; max=10 hypothesis)

**Failure modes:**
1. CI break if recall added to MEMORY_TIER_DISCIPLINE (immediate)
2. Premature subagent kill on slow CI machines
3. Aggregator skill misses `timeout` outcomes in alert section
4. Model field log injection via crafted subagent output
5. Stale model ID in execute.md misleads future devs

**Test coverage gaps:**
- No total SUBAGENT_SHARED_PREFIX size assertion
- No CR/LF guard test for `model` field
- No parametric all-6-outcome test
- No test for subagent timeout outcome emission
- Aggregator skill model normalization logic untested (markdown skill, no executable tests)

**Security flags:**
- 🔴 `model` field missing newline guard — patch regardless of this PR
- 🟡 Speculative model IDs `4-6`/`4-7` if Anthropic deprecates aliases
