# Risk Register

Comprehensive failure mode analysis for the skill-to-agent migration. Risks grouped by category with likelihood, impact, root cause, detection, and mitigation.

---

## Group 1: Agent() Mechanics

### RISK-A1: Sub-Agent Silent Crash / Hang

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | HIGH                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Impact              | HIGH                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Root Cause          | Confirmed Claude Code bugs: sub-agents can crash, hang, or freeze silently with no error returned. Issues [#33014](https://github.com/anthropics/claude-code/issues/33014) (execution stops without error), [#27649](https://github.com/anthropics/claude-code/issues/27649) (silent freeze on complex tasks), [#4744](https://github.com/anthropics/claude-code/issues/4744) (persistent hanging). Orchestrator receives no signal to distinguish success-with-empty-output from crash. |
| Detection           | Parse Agent() return for STATUS line. Empty/missing STATUS = potential crash. Context file state unchanged after return = failure.                                                                                                                                                                                                                                                                                                                                                       |
| Mitigation          | (1) Require all prompts to produce `STATUS: success/failure` output contract. (2) After each return, verify expected context file state was written. (3) Treat missing output as failure with max 1 retry.                                                                                                                                                                                                                                                                               |
| In architecture.md? | Partially — output contract exists but confirmed platform bugs not referenced.                                                                                                                                                                                                                                                                                                                                                                                                           |

### RISK-A2: Sub-Agent Context Exhaustion

|                     |                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | MEDIUM                                                                                                                                                                                                                                                                          |
| Impact              | HIGH                                                                                                                                                                                                                                                                            |
| Root Cause          | Issue [#18240](https://github.com/anthropics/claude-code/issues/18240) documents sub-agents exceeding token limits (148% of 200K context), causing premature termination. Heavy agents (execute-waves with many files) could exhaust context before completing output contract. |
| Detection           | Agent() returns text without STATUS/RESULT markers, or truncated result.                                                                                                                                                                                                        |
| Mitigation          | (1) Keep Agent() prompts small — use file references and MuninnDB recall. (2) Monitor result length. (3) For heaviest agents, split work into smaller units.                                                                                                                    |
| In architecture.md? | **NO** — discusses orchestrator context pressure but not individual sub-agent limits.                                                                                                                                                                                           |

### RISK-A3: Sub-Agent Process Orphaning

|                     |                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | MEDIUM                                                                                                                                                                                                                             |
| Impact              | MEDIUM                                                                                                                                                                                                                             |
| Root Cause          | Issue [#19045](https://github.com/anthropics/claude-code/issues/19045) confirms sub-agent processes are NOT terminated when parent session ends. With 7-10 Agent() calls per phase, orphaned processes accumulate and consume RAM. |
| Detection           | System slowdown. `ps aux \| grep claude` shows orphans. `/cleanup` skill detects these.                                                                                                                                            |
| Mitigation          | (1) Existing `/cleanup` skill handles orphaned processes. (2) Add cleanup to orchestrator error recovery.                                                                                                                          |
| In architecture.md? | **NO** — focuses on pipeline flow, not process lifecycle.                                                                                                                                                                          |

### RISK-A4: Silent MCP Tool Failure in Sub-Agents

|                     |                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | LOW (may be fixed)                                                                                                                                                                                                                                                  |
| Impact              | HIGH                                                                                                                                                                                                                                                                |
| Root Cause          | Issue [#13890](https://github.com/anthropics/claude-code/issues/13890) documents sub-agents silently failing to write files and call MCP tools — sub-agent believes operation succeeded but nothing happens. If this recurs, all MuninnDB operations silently fail. |
| Detection           | After Agent() return, verify expected side effects (context file updated, MuninnDB entries exist).                                                                                                                                                                  |
| Mitigation          | (1) Post-agent validation of side effects. (2) Include file-based fallback in prompts. (3) Pin to known-good Claude Code version.                                                                                                                                   |
| In architecture.md? | **NO** — MuninnDB doc mentions unavailability but not silent success-without-effect.                                                                                                                                                                                |

### RISK-A5: LLM Loop Counter Drift

|                     |                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | HIGH                                                                                                                                                                                                                                                                                                                   |
| Impact              | MEDIUM                                                                                                                                                                                                                                                                                                                 |
| Root Cause          | After migration, lu orchestrator maintains a `FOR each phase` loop inline. Each iteration = 5-7 Agent() calls + context reads + state transitions. LLMs are unreliable at maintaining loop state across long sequences. By iteration 3-4, the orchestrator may forget the counter, skip/repeat phases, or break early. |
| Detection           | ROADMAP.md shows phases complete out of order. Session summary shows fewer phases than expected.                                                                                                                                                                                                                       |
| Mitigation          | (1) Write iteration index + remaining phases to context file after each loop. (2) Re-read context file at iteration start. (3) Add STOP-CHECK markers between iterations. (4) Bound loop to max 5 iterations (existing MAX_PHASES config).                                                                             |
| In architecture.md? | Partially — mentioned in existing pitfalls doc but without mitigation.                                                                                                                                                                                                                                                 |

---

## Group 2: State / Context Corruption

### RISK-S1: Agent Crashes After Context Write, Before STATUS Return

|                     |                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Likelihood          | MEDIUM                                                                                                                                                                                                             |
| Impact              | HIGH                                                                                                                                                                                                               |
| Root Cause          | Sub-agent writes to context file then crashes before returning STATUS. Context file shows step complete, but orchestrator treats call as failed. On retry, enforcement hook blocks because state already advanced. |
| Detection           | Agent() returns empty, but context file `current_state` advanced past expected pre-step state.                                                                                                                     |
| Mitigation          | (1) On retry, re-read context file — if state already advanced, treat as succeeded (idempotent recovery). (2) Clarify whether sub-agents or only the orchestrator write context files.                             |
| In architecture.md? | **NO** — architecture describes orchestrator-only writes but MuninnDB doc shows agents writing during execution. Timing unclear.                                                                                   |

### RISK-S2: Parallel Agent() Calls Corrupt Shared Context File

|                     |                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | MEDIUM                                                                                                                                      |
| Impact              | HIGH                                                                                                                                        |
| Root Cause          | Concurrent deep merges without locking are unsafe. `context-cli.ts` uses `Bun.file()` + `JSON.parse()` + `Bun.write()` which is NOT atomic. |
| Detection           | Context file contains partial JSON or contradictory state.                                                                                  |
| Mitigation          | (1) Per-phase namespaced context files. (2) Only orchestrator writes shared file. (3) Atomic write via temp-file-rename.                    |
| In architecture.md? | Yes — per-phase namespacing mentioned.                                                                                                      |

### RISK-S3: Orchestrator Crash Loses All Progress

|                     |                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | LOW                                                                                                                                                                                   |
| Impact              | HIGH                                                                                                                                                                                  |
| Root Cause          | Orchestrator crash between Agent() calls. On session resume, `/lu` creates new context file via `context-cli.ts init lu`, overwriting previous state. All progress lost.              |
| Detection           | User observes `/lu` starts from scratch after crash.                                                                                                                                  |
| Mitigation          | (1) Before `init`, check if context file already exists — offer resume. (2) Extend `luca-bridge suspend/resume-phase` for crash recovery. (3) Leverage `pre-compact-checkpoint` hook. |
| In architecture.md? | **NO** — describes code rollback but not crash recovery.                                                                                                                              |

---

## Group 3: MuninnDB Failure Modes

### RISK-M1: Slow Recall Blocks Agent Startup

|                     |                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | MEDIUM                                                                                                                            |
| Impact              | MEDIUM                                                                                                                            |
| Root Cause          | Each Agent() makes 3 recall operations at startup. At >5s per recall, 7-10 Agent() calls add 2-3 minutes of pure recall overhead. |
| Mitigation          | (1) Timeout instructions in prompts. (2) At TRIVIAL/SIMPLE, limit to 1 recall. (3) Consider pre-fetching in orchestrator.         |
| In architecture.md? | Partially — recall depth gating exists but latency not addressed.                                                                 |

### RISK-M2: Stale Session Entries from Crashed Previous Session

|                     |                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | MEDIUM                                                                                                                                                           |
| Impact              | MEDIUM                                                                                                                                                           |
| Root Cause          | Previous session crashed before cleanup (`muninn_forget session:*`). Stale entries remain and are recalled by next session's agents.                             |
| Mitigation          | (1) At session init, query + purge existing `session:*` entries. (2) Include session ID in entries for filtering. (3) Use `since` timestamp parameter on recall. |
| In architecture.md? | Mentioned as edge case without implementation details.                                                                                                           |

### RISK-M3: Sub-Agent Writes to Wrong Vault

|                     |                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | LOW                                                                                                                                                     |
| Impact              | MEDIUM                                                                                                                                                  |
| Root Cause          | Sub-agents must resolve vault from config. If Agent() prompt omits vault name, agent defaults to `"default"`, misrouting project-specific session data. |
| Mitigation          | (1) Include vault name explicitly in every Agent() prompt (already in architecture). (2) vault-routing-guard prompt hook provides enforcement.          |
| In architecture.md? | Yes — vault name in template.                                                                                                                           |

---

## Group 4: Enforcement / Hook Gaps

### RISK-E1: Hooks Blind to Agent() During Transition

|                     |                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Likelihood          | HIGH                                                                                                                                                          |
| Impact              | HIGH                                                                                                                                                          |
| Root Cause          | All 6 pre-step hooks match `tool_filter: "Skill"` only. If hook infrastructure not updated before first migration, Agent() calls bypass enforcement entirely. |
| Mitigation          | Deploy hook changes as Phase 0 before any orchestrator migration. Changes are additive (`"Skill                                                               | Agent"` matches both). |
| In architecture.md? | Yes — covered extensively.                                                                                                                                    |

### RISK-E2: LLM Uses Non-Standard Agent Name to Bypass Enforcement

|                     |                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | LOW                                                                                                                          |
| Impact              | MEDIUM                                                                                                                       |
| Root Cause          | If LLM calls Agent() with different `name` than expected, hook doesn't recognize it. Exact set lookup has no fuzzy matching. |
| Mitigation          | (1) Standardize names in prompts. (2) Add catch-all rule: unrecognized Agent() logs warning.                                 |
| In architecture.md? | Partially — `tool_input` open question addressed but naming mismatch risk not explicit.                                      |

### RISK-E3: Mixed Skill/Agent During Transition Period

|                     |                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | HIGH (during migration)                                                                                                                                                                         |
| Impact              | MEDIUM                                                                                                                                                                                          |
| Root Cause          | Some orchestrators use Skill(), others use Agent(). Hook changes are additive so both work. But rolling back hook infrastructure while some orchestrators are migrated would break enforcement. |
| Mitigation          | Hook infrastructure changes are permanent and additive — never roll them back independently.                                                                                                    |
| In architecture.md? | Partially — rollback doesn't address hook/orchestrator interaction.                                                                                                                             |

### RISK-E4: Hooks Cannot Detect MISSING Agent() Calls

|                     |                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | MEDIUM                                                                                                                      |
| Impact              | MEDIUM                                                                                                                      |
| Root Cause          | Pre-step hooks fire on tool ATTEMPTS. If LLM skips an Agent() call entirely, no hook fires. Gap detection is advisory only. |
| Mitigation          | Consider making gap detection blocking (fail-closed) for required sections.                                                 |
| In architecture.md? | Yes — noted that neither Skill() nor Agent() can prevent omission.                                                          |

---

## Group 5: Migration Process

### RISK-P1: lu SKILL.md Exceeds Quality Degradation Threshold

|                     |                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | HIGH                                                                                                                                                                                                                  |
| Impact              | HIGH                                                                                                                                                                                                                  |
| Root Cause          | lu-phase-loop.skill.ts is 708 lines. Inlining 4 sub-skills produces ~1,400+ lines. Likely exceeds 800 lines / 8,000 tokens.                                                                                           |
| Mitigation          | (1) Don't inline all logic — extract prompt templates to lazy-loaded files. (2) Move reference tables to `@file` references. (3) Target orchestrator SKILL.md under 600 lines. (4) Measure token count before deploy. |
| In architecture.md? | Yes — covered extensively.                                                                                                                                                                                            |

### RISK-P2: Shared Infrastructure Rollback Creates Cross-Orchestrator Breakage

|                     |                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Likelihood          | LOW                                                                                                                          |
| Impact              | HIGH                                                                                                                         |
| Root Cause          | Hook infrastructure is shared. Rolling back infrastructure while some orchestrators are migrated breaks those orchestrators. |
| Mitigation          | Infrastructure changes are additive — document as "never roll back independently."                                           |
| In architecture.md? | **NO** — per-orchestrator rollback doesn't address shared infrastructure.                                                    |

### RISK-P3: build:all Crashes During Migration Work

|                     |                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Likelihood          | HIGH                                                                                                            |
| Impact              | HIGH                                                                                                            |
| Root Cause          | Per MEMORY.md: `bun run build:all` crashes Claude Code sessions. Every orchestrator migration requires rebuild. |
| Mitigation          | Each migration = mandatory session interruption. Document explicitly.                                           |
| In architecture.md? | Mentioned in rollback strategy.                                                                                 |

---

## Risks NOT in Existing Documentation

| Risk                            | Why It Matters                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| RISK-A2 (context exhaustion)    | Heavy sub-agents can silently truncate. Platform bug [#18240](https://github.com/anthropics/claude-code/issues/18240).    |
| RISK-A3 (process orphaning)     | Agent processes outlive parent. Platform bug [#19045](https://github.com/anthropics/claude-code/issues/19045).            |
| RISK-A4 (silent MCP failure)    | MuninnDB writes may silently no-op. Platform regression [#13890](https://github.com/anthropics/claude-code/issues/13890). |
| RISK-S1 (crash after write)     | Context file / STATUS return timing undefined.                                                                            |
| RISK-S3 (crash recovery)        | No resume-from-checkpoint for orchestrator crashes.                                                                       |
| RISK-P2 (shared infra rollback) | Hook changes can't be rolled back independently.                                                                          |

---

## Sources

- Claude Code issue tracker: #33014, #27649, #4744, #18240, #19045, #13890, #17540, #16861
- `src/hooks/__helpers/enforcement-hook-factory.ts` — Line 173
- `src/skills/__schemas/context-cli.ts` — Non-atomic writes
- `.planning/research/04-pitfalls-and-risks.md` — Existing 15-risk assessment
- `.planning/research/hook-agent-compatibility-verification.md` — Hook compatibility findings
