---
title: "Architectural: Move orchestration side-effects from LLM-executed bash blocks to deterministic TS layer"
area: architecture
created: 2026-03-31
source: conversation
---

## Context

### The architectural problem

Luca's skill templates embed ~140 orchestration side-effect commands as bash code blocks that the LLM is supposed to execute. LLMs unreliably skip these -- especially in short/simple skills, skills where the LLM never enters "bash execution mode," or skills where the side-effect is a standalone block between prose steps. This is a fundamental architectural flaw: **non-negotiable orchestration logic depends on LLM compliance, which is inherently unreliable.**

This was originally the exact problem that motivated the move to callable sub-agents -- LLMs were skipping vital steps in skills. The same class of bug has now bled into the orchestration layer itself.

### What's at risk

| Side-effect type | Count | If skipped |
|---|---|---|
| State machine transitions (`luca-bridge transition`) | 26 | State machine stalls at wrong state, crash recovery breaks, downstream skills read stale state |
| Context-cli state writes (`bun context-cli write`) | 35+ | Crash recovery resumes from wrong step, phases re-execute incorrectly |
| Field writes (`luca-bridge set-field`) | 13 | Downstream agents misconfigured (wrong complexity, appetite, tracking refs) |
| Status bus writes (`write-status`/`clear-status`) | 73 | Statusline dead for affected workflows |
| Init/snapshot (`ensure-init`, `snapshot`) | 11 | State machine uninitialized, STATE.md stale |

41 of 67 skill templates contain at least one vulnerable side-effect.

### How it was discovered

The statusline not updating for `/milestone-gaps` and other workflows was the visible symptom. Investigation traced the cause: the bash code blocks containing `luca-bridge write-status` were being skipped by the LLM executing the skill. The same vulnerability applies to every orchestration command embedded in skill templates.

### The principle

**All orchestration side-effects must be owned by the deterministic TS layer (hooks, bridge, state machine) -- never by LLM prompt compliance.** The LLM's job is cognitive work (reasoning, code generation, decisions). The framework's job is lifecycle management (state transitions, observability, crash recovery checkpoints).

## Task

### Phase 1: Hook-based lifecycle events for Skill invocations

Add PreToolUse/PostToolUse hooks that fire deterministically on every Skill tool invocation. This immediately fixes the statusline and establishes the pattern for moving more side-effects out of templates.

- **PreToolUse hook**: Reads `tool_input.skill` from stdin, calls `writeStatusBus({ skill, stage: "ACTIVE" })` directly (not via bridge subprocess -- 75% faster per performance review)
- **PostToolUse hook** (async): Calls `clearStatusBus()` directly
- **Nesting support**: Depth counter/stack so inner skills (e.g., phase-execute invoked by lu) don't clear the outer skill's status. Push on PreToolUse, pop on PostToolUse, only clear at depth 0.
- **Sanitize skill name**: Validate with `/^[a-z0-9-]+$/` before writing (defense in depth)
- Register in `src/hooks/__helpers/hook-registry.ts`, scripts in `src/hooks/scripts/`
- Zero template changes needed -- works for all 67 skills automatically
- Fixes the statusline bug as a side-effect of the architectural improvement

### Phase 2: Remove redundant template side-effects (statusline)

- Remove all `write-status`/`clear-status` bash blocks from 27+ skill templates (now handled by hooks)
- Add build-time lint check (similar to `check-domain-boundaries.ts`) that fails if compiled skill output contains residual `write-status`/`clear-status` calls
- Update hook-skill-boundary rule to document the migration and hybrid state

### Phase 3a: Migrate deterministic side-effects

- Migrate parameterless side-effects from templates to hooks: `ensure-init`, `snapshot`, parameterless state transitions
- These are truly deterministic (always fire on specific lifecycle events) and fit the hook paradigm cleanly
- Each migration follows the same pattern: identify the lifecycle trigger, add a hook, remove the template bash block, add a lint guard

### Phase 3b: Evaluate conditional side-effects

- Parameterized transitions (`--event=X --data='{"complexity":"Y"}'`) depend on LLM reasoning output
- `set-field` with dynamic values depends on LLM decisions
- `context-cli write` with dynamic payloads depends on which step completed
- These cannot move to hooks without a new side-channel -- evaluate after Phase 3a ships
- Consider post-execution validation hooks that verify expected transitions fired (safety net rather than replacement)

### Independent: Bridge schema validation fix

- Add `StatusBusSchema.safeParse()` to bridge's `handleWriteStatus` (bridge.ts:1112-1120) -- currently missing schema validation, unlike `writeStatusBus()` which has it

## Notes

### Architectural decisions (from review team)

- **Keep bus file separate from state.json** -- different lifecycle models (ephemeral 60s-TTL observability vs durable workflow state). Do NOT converge them.
- **Do NOT add `active_skill`/`active_step` to WorkflowContext** -- the state machine tracks workflow state, not runtime observability. Mixing them creates write amplification and conceptual confusion.
- **Import `writeStatusBus()`/`clearStatusBus()` directly** in hook scripts instead of spawning `luca-bridge` subprocess. Avoids 40ms of wasted cold-start loading xstate/lodash/machine that write-status never uses.

### Review team consensus (4 specialist agents)

All 4 reviewers (architect, security, performance, DX) approved the approach:

- **Architect**: APPROVE WITH CHANGES -- tier-compliant, clean delegation pattern. Address nesting race. Keep bus and state.json separate.
- **Security**: APPROVE WITH MITIGATIONS -- safe with array-based spawn. Add skill name sanitization, schema validation in bridge, dedup guard.
- **Performance**: APPROVE WITH OPTIMIZATIONS -- bypass bridge CLI, use writeStatusBus directly (~32ms vs ~52ms). Fastest hooks in the registry.
- **DX**: APPROVE WITH CHANGES -- split Phase 3 into 3a/3b. Add debug logging, build-time drift check, update hook-skill-boundary rule.

### Key files

- Hook registry: `src/hooks/__helpers/hook-registry.ts`
- Hook I/O: `src/hooks/__helpers/hook-io.ts`
- Status bus: `src/shared/__helpers/status-bus.ts` (writeStatusBus/clearStatusBus)
- Bridge: `packages/luca-framework/src/state/bridge.ts` (handleWriteStatus needs schema fix)
- Statusline renderer: `src/hooks/scripts/statusline.ts`
- Hook-skill boundary rule: `src/rules/general/hook-skill-boundary.rule.ts`
- 5 existing pre-step hooks prove the Skill interception pattern works
