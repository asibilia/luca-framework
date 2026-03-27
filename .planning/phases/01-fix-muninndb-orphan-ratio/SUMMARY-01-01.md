# SUMMARY: Phase 01 Plan 01 — Fix MuninnDB Orphan Ratio

## Status: COMPLETE

## Objective

Stop MuninnDB engrams from being created as orphans (no links) at both call sites where memories are written: lu-learner (write_memory step) and workflow-save (Step 5).

## Tasks Executed

### Task 1 — Insert `link_memories` step into lu-learner

**Commit:** `7534a10d`
**File:** `src/agents/general/lu-learner.agent.ts`

Inserted a new `<step name="link_memories">` block between `write_memory` (line 445) and `clear_working` in the execution flow. The step:

- Instructs the LLM to capture the ID returned by each `muninn_remember` call, with a self-healing fallback via `muninn_recall` if the ID was not captured
- Requires recalling 2-3 semantically related existing memories per new engram
- Requires calling `muninn_link` with `relates_to` for related memories
- Requires calling `muninn_link` with `learned_from` for the producing phase or session memory
- Asserts a minimum of 1 link per new engram — zero links is declared an explicit failure condition
- Provides an `is_part_of` fallback to the session memory to guarantee the minimum is always achievable
- Blocks progression to `clear_working` until all engrams have at least 1 link

**Verification:**

- `<step name="link_memories">` appears between `</step>` (write_memory) and `<step name="clear_working">` ✓
- Step references `muninn_recall` for ID recovery fallback ✓
- Step references `muninn_link` for linking ✓
- Step includes minimum-link assertion ("An engram with zero links after this step is a failure") ✓
- Step includes `learned_from` relation for phase/session linking ✓
- No other steps modified or removed ✓

### Task 2 — Insert hard gate into workflow-save Step 5

**Commit:** `71b63930`
**File:** `src/skills/general/workflow-save.skill.ts`

Inserted a `**HARD GATE**` paragraph inside `### Step 5: Link related memories`, after the linking priorities list and before `### Step 6: Confirm`. The gate:

- Uses imperative blocking language: "Do NOT proceed to Step 6 until..."
- Specifies a concrete threshold: N links where N equals the number of memories stored in Step 4
- Includes a minimum-viable fallback: link each memory to the session memory via `is_part_of`
- Uses bold/prominent formatting (`**HARD GATE**`) so it cannot be read as optional

**Verification:**

- `**HARD GATE**` paragraph appears inside Step 5, between linking priorities list and `### Step 6:` heading ✓
- Gate specifies N as "the number of memories stored in Step 4" (not hardcoded) ✓
- Fallback `is_part_of` path is included ✓
- Step 6 heading and content unchanged ✓
- No other steps modified ✓

## Deviations

None.

## Files Modified

- `src/agents/general/lu-learner.agent.ts` — +40 lines (new `link_memories` step)
- `src/skills/general/workflow-save.skill.ts` — +2 lines (hard gate paragraph)

## Note for User

`bun run build:all` must be run manually to regenerate `.claude/`, `.cursor/`, and `.pi/` output from the modified source files. Do not run it inside this Claude Code session.
