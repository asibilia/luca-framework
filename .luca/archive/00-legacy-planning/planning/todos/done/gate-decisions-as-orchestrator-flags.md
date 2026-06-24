---
title: "Move gate decisions from sub-skill prompts to orchestrator flags"
area: skills
created: 2026-03-17
source: conversation
priority: P2
---

## Context

Gate checks (premortem, process_data, and potentially others) are currently embedded as bash pseudo-code inside sub-skill prompt text. The LLM is supposed to "execute" these checks conceptually, but in practice it makes ad-hoc skip decisions based on its own reasoning (e.g., "full-auto + bugfix = skip premortem") instead of running the prescribed gate logic. This was observed with the premortem gate being skipped every time despite `gates.premortem: true` in config.

The lu orchestrator already has this pattern working for `--skip-backlog` and `--no-swarm` — the orchestrator resolves the decision and passes an explicit flag to the sub-skill. Gate checks just weren't wired the same way.

## Problem

- Gate checks in sub-skill prompts are advisory, not deterministic
- The lu skill's anti-skip constraints (lines 30-34) don't transfer to sub-skills invoked via `Skill()`
- The LLM rationalizes skips using context clues (oversight level, phase type) that are NOT documented skip conditions
- This affects any gated step in any sub-skill, not just premortem

## Task

### Level 1 — Orchestrator flag plumbing (primary fix)

1. **lu.skill.ts**: Before invoking `phase-discuss`, resolve all relevant gates and pass as explicit flags:

   ```
   Skill(skill: "phase-discuss", args: "{phase_number} --run-premortem")
   ```

   or `--skip-premortem` if gate is disabled. Same pattern as `--skip-backlog`.

2. **lu.skill.ts**: Before invoking `phase-execute`, resolve the process_data gate and pass as flag:

   ```
   Skill(skill: "phase-execute", args: "{phase_number} --run-process-data")
   ```

3. **phase-discuss.skill.ts**: Replace the bridge gate-check bash block with a simple flag check:
   - `--run-premortem` → run premortem (self-tuning auto-skip still applies as secondary check)
   - `--skip-premortem` → skip, no further evaluation
   - No flag → default to skip (fail-closed for gated steps)

4. **phase-execute.skill.ts**: Same pattern for `--run-process-data` / `--skip-process-data`

5. **Audit all sub-skills** for other gate checks embedded as pseudo-code and apply the same pattern

### Level 2 — Global rule reinforcement (defense in depth)

6. **Add a rule** (e.g., `.claude/rules/gate-enforcement.md`) that applies to all skills:
   - "Gate decisions are resolved by the orchestrator and passed as explicit flags"
   - "Sub-skills MUST NOT make ad-hoc skip decisions based on oversight level, phase type, complexity, or any other contextual reasoning"
   - "If a flag is absent for a gated step, the step is SKIPPED (fail-closed)"

### Affected files

- `src/skills/luca/lu.skill.ts` — add gate resolution + flag passing before Skill() calls
- `src/skills/general/phase-discuss.skill.ts` — replace bash gate-check with flag check
- `src/skills/general/phase-execute.skill.ts` — replace grep-based process_data check with flag check
- `src/rules/` (new) — gate enforcement rule

## Notes

- The bridge `gate-check` command itself works correctly (`luca-bridge gate-check --gate=premortem` returns `{"enabled":true}`)
- The problem is purely that the LLM never actually runs the check — it substitutes its own judgment
- This is a general class of prompt-compliance issue: bash pseudo-code in prompts is treated as advisory
- The self-tuning auto-skip for premortem (signal rate < 10% over 20+ samples) should remain as a secondary check inside phase-discuss, gated behind `--run-premortem`
- Consider whether the lu orchestrator's gate resolution should use the bridge CLI or read config directly (bridge is more authoritative since it checks machine state)
