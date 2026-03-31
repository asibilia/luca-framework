# Milestone Audit — v8.6.0 Scout Article Intelligence + v8.6.1 Deterministic Hooks

**Audited:** 2026-03-31
**Branch:** 120--build-target-migration
**Phases:** 241-252 (12 phases across 2 milestones)
**Files changed:** 64 TypeScript files
**Debate round:** Skipped (complexity TRIVIAL, below COMPLEX gate)

## Requirements Coverage

### v8.6.0 — Scout Article Intelligence

| Phase | Goal                           | Status   |
| ----- | ------------------------------ | -------- |
| 241   | Scout Foundation               | COMPLETE |
| 242   | Per-Article Pipeline           | COMPLETE |
| 243   | Cross-Cutting Batch            | COMPLETE |
| 244   | UX + Docs                      | COMPLETE |
| 245   | Fix deepFreeze Zod v4 Crash    | COMPLETE |
| 246   | Statusline Rework + Status Bus | COMPLETE |

### v8.6.1 — Audit Gap Closure + Deterministic Hooks

| Phase | Goal                           | Status   |
| ----- | ------------------------------ | -------- |
| 247   | Bridge Status Bus Hardening    | COMPLETE |
| 248   | Shared + Renderer Cleanup      | COMPLETE |
| 249   | Deterministic Skill Lifecycle  | COMPLETE |
| 250   | Redundant Side-Effect Removal  | COMPLETE |
| 251   | Deterministic Agent Transition | COMPLETE |
| 252   | v8.6.1 Audit Cleanup           | COMPLETE |

**Score: 12/12 phases complete**

## Integration Check

**Status: PASSED (14/14)**

1. Scout state machine schemas exported via barrel, consumed by scout-index.ts
2. All 9 scout skills registered in build-skill-registry.ts with matching templates
3. Scout orchestrator pipeline matches SCOUT_TRANSITIONS DAG exactly
4. Scout index updater imports from shared barrel correctly
5. Status bus schemas exported, consumed by status-bus.ts and statusline.ts
6. Status bus helpers (write/read/clear) connected to all consumer hooks
7. Statusline renderer reads bus via readStatusBus, maps fields correctly
8. skill-status-enter registered as PreToolUse on Skill, writes bus
9. skill-status-exit registered as PostToolUse on Skill (intentional no-op, staleness timeout)
10. Template bash block removal verified: 0 residual write-status/clear-status/snapshot calls
11. agent-transition-sync registered as PostToolUse on Agent, 5 orchestrator mappings
12. agent-status-sync registered as PreToolUse on Agent, step progression mapping
13. lu.skill.ts transition removal verified: retained only ROUTE_COMPLETE, SKIP, COMMIT_COMPLETE
14. deepFreeze Zod v4 fix exported via shared barrel

**Domain boundary compliance:** Clean. All 4 tiers verified. No TypeScript-level violations.
**Build output:** 67/67 skills match 1:1 between source and templates.

## Code Quality Findings

### HIGH (1)

| ID   | Finding                                                       | File                                           | Reviewer  |
| ---- | ------------------------------------------------------------- | ---------------------------------------------- | --------- |
| A-H1 | T3→T2 filesystem coupling via Bun.spawnSync to context-cli.ts | src/hooks/scripts/agent-transition-sync.ts:396 | architect |

**Detail:** Hook (T3) constructs a path to `src/skills/__schemas/context-cli.ts` and shells out to it, creating a runtime dependency from T3 to T2. Passes the automated `check-domain-boundaries.ts` checker (not a TS import) but contradicts downward-only tier rule. Already documented with a STRUCTURAL NOTE.

**Recommendation:** Route context writes through luca-bridge or move context-cli to a tier-neutral location (scripts/ or shared/).

### MEDIUM (9)

| ID      | Finding                                          | File(s)                                                       | Reviewer    |
| ------- | ------------------------------------------------ | ------------------------------------------------------------- | ----------- |
| DX-M1   | require('fs').readFileSync in async context      | scripts/check-drift.ts:39                                     | dx-advocate |
| DX-M2   | node:fs/promises imports for rename/unlink       | src/shared/\_\_helpers/status-bus.ts:1                        | dx-advocate |
| DX-M3   | node:fs realpathSync without exception doc       | src/hooks/scripts/statusline.ts:13                            | dx-advocate |
| DRY-M1  | Branding resolution duplicated                   | scripts/check-drift.ts vs scripts/build-deploy.ts             | simplifier  |
| DRY-M2  | Vault resolution bash snippet in 13+ templates   | src/skills/general/\*.skill.ts                                | simplifier  |
| DRY-M3  | VAULT_GUARD_PROMPT in two locations              | scripts/build-utils.ts:161 vs hook-registry.ts:227            | simplifier  |
| ARCH-M1 | Direct \_\_helpers/ imports bypass barrel        | skill-status-enter.ts, agent-status-sync.ts, agent-prompts.ts | architect   |
| SEC-M1  | /tmp context files predictable on shared systems | src/hooks/scripts/agent-transition-sync.ts:104                | security    |
| SEC-M2  | Agent name missing regex validation              | src/hooks/scripts/agent-status-sync.ts:119                    | security    |

### LOW (22)

| ID      | Finding                                                      | File                                             | Reviewer    |
| ------- | ------------------------------------------------------------ | ------------------------------------------------ | ----------- |
| DX-L1   | Statusline stdin fields lack Zod schema                      | statusline.ts:297                                | dx-advocate |
| DX-L2   | Context-metrics.json written without schema                  | statusline.ts:343                                | dx-advocate |
| DX-L3   | session-start.ts heavy node:fs sync APIs                     | session-start.ts                                 | dx-advocate |
| DX-L4   | deploy-helpers.ts node:fs for file copies                    | deploy-helpers.ts:30                             | dx-advocate |
| DX-L5   | deploy-global.ts extensive node:fs sync APIs                 | deploy-global.ts:36                              | dx-advocate |
| DX-L6   | agent-status-sync.ts existsSync from node:fs                 | agent-status-sync.ts:16                          | dx-advocate |
| DX-L7   | StatusBusSchema stage enum mixes SCREAMING and lowercase     | status-bus.schemas.ts:14                         | dx-advocate |
| DX-L8   | Dynamic import inside function body                          | build-all.ts:187, build-compile.ts:192           | dx-advocate |
| DRY-L1  | targeted-recompile.ts re-implements entity compilation loops | targeted-recompile.ts:78                         | simplifier  |
| DRY-L2  | Hook scripts duplicate tool_input extraction pattern         | 3 hook scripts                                   | simplifier  |
| DRY-L3  | Deprecated hookRegistry still exported                       | hook-registry.ts:267                             | simplifier  |
| DRY-L4  | ORCHESTRATOR_MAPPINGS verbose effect objects                 | agent-transition-sync.ts:101                     | simplifier  |
| DRY-L5  | build-all.ts verbose plugin counting                         | build-all.ts:195                                 | simplifier  |
| DRY-L6  | deploy-global.ts duplicated pre-flight logic                 | deploy-global.ts:126                             | simplifier  |
| DRY-L7  | check-drift.ts uses require() alongside available imports    | check-drift.ts:39                                | simplifier  |
| ARCH-L1 | Inline schema in hook script vs \_\_schemas/                 | statusline.ts:24                                 | architect   |
| ARCH-L2 | Dual prefix mapping drift risk                               | agent-status-sync.ts vs agent-transition-sync.ts | architect   |
| SEC-L1  | CLAUDE_ENV_FILE path not validated                           | session-start.ts:384                             | security    |
| SEC-L2  | Status bus busPath not prefix-validated                      | status-bus.ts:46                                 | security    |
| SEC-L3  | tmpPath predictable (symlink risk, minimal)                  | status-bus.ts:47                                 | security    |
| SEC-L4  | deepFreeze getter skip means partial immutability            | deep-freeze.ts:20                                | security    |
| SEC-L5  | readStdinJson uses JSON.parse not sanitizeJsonParse          | hook-io.ts:63                                    | security    |

## Security Positive Patterns

The following security practices are well-implemented:

- sanitizeJsonParse for prototype pollution protection in bridge.ts, context-cli.ts, session-start.ts
- sanitizeForTemplate strips backticks, `${...}`, bidi chars in agent prompts
- Zod schema validation at all critical boundaries
- SETTABLE_FIELDS allowlist in bridge.ts
- SKILL_NAME_RE regex validation in skill-status-enter.ts
- Path traversal defense in statusline.ts (realpathSync + prefix check)
- Atomic file writes (tmp + rename) in status-bus.ts and context-helpers.ts
- Guard file permissions 0o600 in hook-io.ts
- All Bun.spawnSync calls use array-form argv (no shell injection)
- Fail-closed hook behavior (exit 0 on error)

## Tech Debt

### Cross-Phase Themes

1. **Bun-first compliance gap** — The most recurring pattern: continued use of `node:fs` synchronous APIs in hooks, scripts, and packages where Bun equivalents exist (DX-M1, DX-M2, DX-L3-L6)
2. **Prompt template DRY** — Vault resolution bash snippet duplicated in 13+ skill templates. Known limitation of prompt-as-string architecture (DRY-M2)
3. **Deprecated hookRegistry** — Legacy format still exported alongside canonicalHookRegistry (DRY-L3)
4. **T3→T2 coupling** — agent-transition-sync filesystem dependency on context-cli.ts (A-H1)

## Gap Closure Plan

### Planned — Phase 253: Convention Alignment & Validation Hardening

Addresses: ARCH-M1, SEC-M2, DX-M1, DX-M3, DX-L7, SEC-L5, DRY-L2

### Planned — Phase 254: Build Script DRY Consolidation

Addresses: DRY-M1, DRY-M3, DRY-L1, DRY-L3, DRY-L5, DX-L8

### Deferred (not planned, documented)

| Finding                                                                | Reason                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A-H1 (T3→T2 coupling)                                                  | Needs architectural decision: route through bridge or move context-cli. Documented with STRUCTURAL NOTE. |
| DRY-M2 (vault resolution in 13+ templates)                             | Architectural limitation of prompt-as-string. Needs design spike for build-time template variables.      |
| DX-M2 (status-bus node:fs rename)                                      | No Bun equivalent for atomic rename. Acceptable exception.                                               |
| SEC-M1 (/tmp predictable files)                                        | Already documented in Phase 252 (SEC-002). Per-user prefix is bigger scope.                              |
| Remaining LOWs (DX-L1-L6, SEC-L1-L4, DRY-L4, DRY-L6, ARCH-L1, ARCH-L2) | Minor cleanup, not worth dedicated phase work.                                                           |

## Verdict

**ISSUES FOUND — GAPS PLANNED.** 12/12 phases complete. Integration PASSED (14/14). 1 HIGH, 9 MEDIUM, 22 LOW findings.

13 findings addressed in Phases 253-254. 5 items deferred with rationale. Remaining LOWs tracked but not scheduled.
