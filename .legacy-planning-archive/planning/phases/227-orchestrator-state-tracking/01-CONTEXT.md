# Phase 227 — Orchestrator State Tracking: Context

## Audit Findings

### State Write Coverage

| Orchestrator | Init Helper | State Writes | `as any` | "NEVER inline" |
|--------------|-------------|-------------|----------|-----------------|
| lu | Typed | All 5 | None | Explicit |
| phase-execute | Typed | All 7 | ALL 8 use `as any` | Missing |
| verify | Manual I/O | All 6 | Manual | Missing |
| milestone-complete | Typed | All 5 | ALL 5 use `as any` | Explicit |
| pr-address | Typed | **NONE** | N/A | Explicit |
| lu-phase-loop | Typed | **NONE** | N/A | Explicit |

### Critical Gaps

1. **pr-address** has ZERO `current_state` write instructions — hooks can never validate ordering
2. **lu-phase-loop** has ZERO `current_state` write instructions during phase loop
3. **phase-execute** and **milestone-complete** use `as any` on ALL state writes, bypassing type safety
4. **verify** uses manual file I/O instead of typed helpers
5. **phase-execute** and **verify** lack "NEVER inline" constraints

## Decisions

### 1. Add `current_state` to Zod schemas [auto-resolved]

**Decision:** Add `current_state: z.string().optional()` to all 5 context schemas. This eliminates the need for `as any` casts while keeping backward compatibility (field is optional).

### 2. Add state write instructions to pr-address and lu-phase-loop [auto-resolved]

**Decision:** Add explicit `current_state` write instructions after every Skill() call in both specs.

### 3. Migrate verify to typed helpers [auto-resolved]

**Decision:** Replace manual file I/O in verify.skill.ts with `writeVerifyContext()` calls.

### 4. Add "NEVER inline" to all orchestrators [auto-resolved]

**Decision:** Add explicit constraint to phase-execute and verify specs, matching the pattern in lu and milestone-complete.

## Scope Boundary

- Fix state tracking in SKILL.md specs (source of truth for LLM behavior)
- Add current_state to Zod schemas (eliminates as any)
- Do NOT modify hook logic or state machine definitions
