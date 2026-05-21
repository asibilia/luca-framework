---
id: "35-03"
title: "Skill & Agent Prompt Updates: Bridge Commands Replace STATE.md Reads/Writes"
phase: 35
wave: 3
depends_on: ["35-01", "35-02"]
tasks:
  - id: "T1"
    title: "Update autopilot skill to use bridge commands"
    description: "Update .claude/skills/autopilot/SKILL.md prompt text to replace STATE=$(cat .planning/STATE.md) with bridge CLI calls. Replace grep-based complexity reads with bun run src/state-machine/bridge.ts read-complexity. Replace STATE.md write instructions with bridge transition commands. Maintain STATE.md cat as fallback in comments."
    files: [".claude/skills/autopilot/SKILL.md"]
    verification: "Skill prompt references bridge.ts for all state reads and writes. No uncommented cat .planning/STATE.md for primary state access. Complexity reading uses bridge read-complexity. Phase completion uses bridge transition."
  - id: "T2"
    title: "Update phase-execute skill to use bridge commands"
    description: "Update .claude/skills/phase-execute/SKILL.md prompt text to replace grep 'Task Complexity:' .planning/STATE.md with bridge read-complexity. Replace STATE.md wave tracking writes with bridge transition events (PHASE_START, WAVE_COMPLETE, PHASE_COMPLETE). Update code review agent spawning to read complexity from bridge."
    files: [".claude/skills/phase-execute/SKILL.md"]
    verification: "Skill prompt uses bridge read-complexity instead of grep. Phase lifecycle uses bridge transition events. Wave tracking reads machine state. Code review complexity gating uses bridge output."
  - id: "T3"
    title: "Update phase-plan skill to use bridge commands"
    description: "Update .claude/skills/phase-plan/SKILL.md prompt text to replace cat .planning/STATE.md with bridge read-status. Replace grep-based complexity read with bridge read-complexity. Update plan registration to use bridge transition (PLAN_COMPLETE event)."
    files: [".claude/skills/phase-plan/SKILL.md"]
    verification: "Skill prompt uses bridge read-status and read-complexity. Plan completion sends PLAN_COMPLETE event via bridge. No uncommented STATE.md cat for primary state access."
  - id: "T4"
    title: "Update quick skill to use bridge commands"
    description: "Update .claude/skills/quick/SKILL.md prompt text to replace direct STATE.md creation and cat with bridge ensure-init and read-status. Replace manual STATE.md template writes with bridge snapshot. Maintain quick task table update as a direct STATE.md append (the machine does not track quick tasks yet)."
    files: [".claude/skills/quick/SKILL.md"]
    verification: "Quick skill uses bridge ensure-init instead of manual STATE.md creation. State reads use bridge. Quick task table append remains as direct STATE.md edit (documented as legacy pattern)."
  - id: "T5"
    title: "Update progress skill to use bridge commands"
    description: "Update .claude/skills/progress/SKILL.md prompt text to replace STATE.md reads with bridge read-status. Replace direct STATE.md parsing with structured bridge output for phase, complexity, and session info."
    files: [".claude/skills/progress/SKILL.md"]
    verification: "Progress skill reads all state via bridge read-status. Phase and complexity information comes from structured JSON, not grep parsing."
  - id: "T6"
    title: "Update phase-discuss skill to use bridge commands"
    description: "Update .claude/skills/phase-discuss/SKILL.md prompt text to replace grep 'Task Complexity:' STATE.md with bridge read-complexity for complexity gating."
    files: [".claude/skills/phase-discuss/SKILL.md"]
    verification: "Complexity read uses bridge read-complexity instead of STATE.md grep."
  - id: "T7"
    title: "Update lu-executor agent to use bridge commands"
    description: "Update .claude/agents/lu-executor.md prompt text to replace cat .planning/STATE.md with bridge read-status. Replace STATE.md update instructions with bridge transition commands for execution lifecycle events."
    files: [".claude/agents/lu-executor.md"]
    verification: "Agent prompt uses bridge read-status for state loading. Execution state updates use bridge transition. STATE.md is still referenced as human-readable artifact but not the primary read source."
  - id: "T8"
    title: "Update lu-cognition agent to use bridge commands"
    description: "Update .claude/agents/lu-cognition.md prompt text to replace grep 'Task Complexity:' STATE.md with bridge read-complexity. Update any STATE.md references to use bridge read-status."
    files: [".claude/agents/lu-cognition.md"]
    verification: "Complexity reading uses bridge read-complexity. State access uses bridge read-status."
  - id: "T9"
    title: "Update lu-roadmapper agent to use bridge commands"
    description: "Update .claude/agents/lu-roadmapper.md prompt text to replace STATE.md initialization instructions with bridge ensure-init and bridge transition (START event). Replace STATE.md write template with bridge snapshot."
    files: [".claude/agents/lu-roadmapper.md"]
    verification: "Roadmapper uses bridge ensure-init for state initialization. STATE.md generation uses bridge snapshot. STATE.md template in prompt updated to reference bridge-generated format."
  - id: "T10"
    title: "Create state machine integration reference for prompt authors"
    description: "Create .claude/rules/state-machine-bridge.md documenting the bridge CLI commands, their output formats, fallback behavior, and migration patterns from STATE.md reads/writes to bridge commands. This serves as the reference for future skill/agent prompt authors."
    files: [".claude/rules/state-machine-bridge.md"]
    verification: "Rule file documents all bridge subcommands with examples. Migration patterns show before/after for common STATE.md operations. Fallback behavior is documented for uninitialized state."
---

# Plan 35-03: Skill & Agent Prompt Updates: Bridge Commands Replace STATE.md Reads/Writes

## Objective

Update all skill and agent prompt templates to use the state machine bridge CLI (`bun run src/state-machine/bridge.ts`) instead of directly reading/writing STATE.md. This is the primary integration work that replaces INTEG-01 (STATE.md reads) and INTEG-02 (STATE.md writes) across the codebase.

**Critical understanding:** Skills (`.claude/skills/`) and agents (`.claude/agents/`) are prompt text files (markdown), not executable TypeScript. They contain instructions that tell the AI how to behave. "Integrating the state machine" means updating the bash command snippets and instructional text within these prompts to reference the bridge CLI instead of `cat .planning/STATE.md` and `grep`.

This plan addresses **INTEG-01** (STATE.md reads via machine queries), **INTEG-02** (STATE.md writes via machine transitions), **INTEG-03** (autopilot phase loop), and **INTEG-04** (phase-execute wave tracking).

## Context

Read these files to understand the bridge API and current STATE.md usage patterns:

- @src/state-machine/bridge.ts -- (from PLAN-01) Bridge CLI with subcommands: read-field, read-complexity, read-phase, read-oversight, read-status, transition, snapshot, ensure-init
- @src/state-machine/snapshot.ts -- (from PLAN-01) STATE.md snapshot generator
- @src/state-machine/types.ts -- workflowEventSchema defining all valid events: START, PREFLIGHT_COMPLETE, ROUTE_COMPLETE, PLAN_COMPLETE, PHASE_START, PHASE_COMPLETE, PHASE_FAILED, HARNESS_COMPLETE, VERIFY_PASSED, VERIFY_FAILED, LEARN_COMPLETE, COMMIT_COMPLETE, SKIP, RESUME, ABORT, RESET
- @.claude/skills/autopilot/SKILL.md -- Autopilot skill (reads STATE.md at line 44, reads complexity, manages phase loop)
- @.claude/skills/phase-execute/SKILL.md -- Phase execute skill (reads complexity via grep at line 464, tracks waves, spawns agents by complexity)
- @.claude/skills/phase-plan/SKILL.md -- Phase plan skill (reads STATE.md at lines 201, 286, reads complexity for gating)
- @.claude/skills/quick/SKILL.md -- Quick task skill (creates STATE.md if missing, reads/writes STATE.md)
- @.claude/skills/progress/SKILL.md -- Progress skill (reads STATE.md for dashboard display)
- @.claude/skills/phase-discuss/SKILL.md -- Phase discuss skill (reads complexity from STATE.md at line 48)
- @.claude/agents/lu-executor.md -- Executor agent (reads STATE.md at line 97, updates STATE.md)
- @.claude/agents/lu-cognition.md -- Cognition agent (reads complexity from STATE.md at line 182)
- @.claude/agents/lu-roadmapper.md -- Roadmapper agent (initializes STATE.md, writes STATE.md structure)

## Migration Patterns

### Common replacements used across all tasks:

**Pattern 1: STATE.md read -> bridge read-status**

```bash
# BEFORE:
STATE=$(cat .planning/STATE.md 2>/dev/null || echo "")

# AFTER:
STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
```

**Pattern 2: Complexity grep -> bridge read-complexity**

```bash
# BEFORE:
COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}')

# AFTER:
COMPLEXITY=$(bun run src/state-machine/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "TRIVIAL")
```

**Pattern 3: STATE.md write -> bridge transition**

```bash
# BEFORE:
# Update STATE.md with phase completion info
# (manual markdown editing instructions)

# AFTER:
bun run src/state-machine/bridge.ts transition --event=PHASE_COMPLETE --data='{"phase_id":35,"summary":"Integration complete"}'
```

**Pattern 4: STATE.md initialization -> bridge ensure-init**

```bash
# BEFORE:
if [ ! -f .planning/STATE.md ]; then
  cat > .planning/STATE.md << 'EOF'
  # Project State
  ...
  EOF
fi

# AFTER:
bun run src/state-machine/bridge.ts ensure-init
```

**Pattern 5: Phase/wave tracking -> bridge read-phase**

```bash
# BEFORE:
# Parse current phase from STATE.md
PHASE=$(grep "Current Phase:" .planning/STATE.md | awk '{print $NF}')

# AFTER:
PHASE_INFO=$(bun run src/state-machine/bridge.ts read-phase 2>/dev/null || echo '{"phase":null}')
PHASE=$(echo "$PHASE_INFO" | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.phase ?? 'null')" 2>/dev/null)
```

## Tasks

### T1: Update autopilot skill to use bridge commands

**Goal:** Migrate the autopilot skill's STATE.md access patterns to use bridge commands. The autopilot is the highest-value integration because it orchestrates the full workflow loop and reads/writes STATE.md most frequently.

**Files:** `.claude/skills/autopilot/SKILL.md`

**Changes required:**

1. **Step 0a: Configuration & Pre-Flight** (around line 44)

   Replace:

   ```bash
   STATE=$(cat .planning/STATE.md 2>/dev/null || echo "")
   ```

   With:

   ```bash
   # Primary: Read state from state machine (typed, validated)
   STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   # Fallback: Read STATE.md directly (backward compatibility)
   STATE_MD=$(cat .planning/STATE.md 2>/dev/null || echo "")
   ```

2. **GitHub Issue check** (around line 264)

   Replace:

   ```
   Read STATE.md and check for an existing `GitHub Issue:` line
   ```

   With:

   ```
   Read state from bridge: `bun run src/state-machine/bridge.ts read-field --field=github_issue`
   If the response `value` is non-null, a GitHub issue is already linked.
   Fallback: Read STATE.md and check for an existing `GitHub Issue:` line.
   ```

3. **STATE.md updates** (around line 288)

   Replace the instruction:

   ```
   7. Update STATE.md with:
   ```

   With:

   ````
   7. Update state via bridge:
   ```bash
   bun run src/state-machine/bridge.ts transition --event=START --data='{"ticket_id":"PROJ-1234"}'
   ````

   This updates state.json AND regenerates STATE.md automatically.

   ```

   ```

4. **Complexity write** (around line 413)

   Replace:

   ```
   Write complexity to STATE.md.
   ```

   With:

   ````
   Write complexity via state machine:
   ```bash
   bun run src/state-machine/bridge.ts transition --event=ROUTE_COMPLETE --data='{"complexity":"COMPLEX"}'
   ````

   ```

   ```

5. **Phase completion check** (around line 470)

   Replace:

   ```
   Parse the phase-execute outcome from STATE.md
   ```

   With:

   ````
   Read phase execution outcome from state machine:
   ```bash
   PHASE_STATUS=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null)
   ````

   Parse the `state` field for current workflow position.

   ```

   ```

6. **Session results update** (around line 746)

   Replace:

   ```
   1. Update STATE.md with autopilot session results
   ```

   With:

   ````
   1. Finalize state via bridge:
   ```bash
   bun run src/state-machine/bridge.ts transition --event=COMMIT_COMPLETE --data='{"commit_hash":"abc123"}'
   bun run src/state-machine/bridge.ts snapshot
   ````

   STATE.md is auto-regenerated.

   ```

   ```

**Dual-path approach:** For this first migration, keep both the bridge command (primary) and the STATE.md fallback (commented, for reference). This allows rollback if issues arise.

**Acceptance Criteria:**

- Autopilot prompt references bridge.ts for all state reads
- STATE.md writes replaced with bridge transition events
- Complexity reads use `read-complexity` subcommand
- Phase loop uses bridge `read-status` for state checks
- Fallback STATE.md references kept as comments for safety
- No functional behavior change to the autopilot workflow

### T2: Update phase-execute skill to use bridge commands

**Goal:** Migrate phase-execute's STATE.md access to bridge commands. This skill has the most grep-based STATE.md reads (complexity, phase tracking) and is the primary consumer of INTEG-04 (wave tracking).

**Files:** `.claude/skills/phase-execute/SKILL.md`

**Changes required:**

1. **Context loading** (around line 47, T2 context tier)

   Update the context tier description to note that STATE.md is now machine-generated:

   ```
   | T2 | + state machine context (via bridge read-status) + selective MEMORY.md + WORKING.md |
   ```

2. **GitHub Issue check** (around line 212)

   Replace STATE.md check with:

   ````
   Read GitHub issue from bridge:
   ```bash
   GH_ISSUE=$(bun run src/state-machine/bridge.ts read-field --field=github_issue 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.value ?? '')" 2>/dev/null)
   ````

   ```

   ```

3. **STATE.md update instruction** (around line 240)

   Replace:

   ```
   5. Update STATE.md
   ```

   With:

   ````
   5. Update state via bridge:
   ```bash
   bun run src/state-machine/bridge.ts transition --event=PHASE_START --data='{"phase_id":35}'
   ````

   ```

   ```

4. **STATE.md content read** (around line 290)

   Replace:

   ```bash
   STATE_CONTENT=$(cat .planning/STATE.md)
   ```

   With:

   ```bash
   STATE_CONTENT=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   ```

5. **Complexity grep** (around line 463-464)

   Replace:

   ```bash
   # Read complexity level from STATE.md
   COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}')
   ```

   With:

   ```bash
   # Read complexity level from state machine
   COMPLEXITY=$(bun run src/state-machine/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "TRIVIAL")
   ```

6. **Second STATE.md read** (around line 722)

   Replace:

   ```bash
   STATE_CONTENT=$(cat .planning/STATE.md)
   ```

   With:

   ```bash
   STATE_CONTENT=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   ```

7. **Code review complexity gating** (around line 987)

   Replace:

   ```
   **Spawn based on complexity level** (read from STATE.md `Task Complexity:` field):
   ```

   With:

   ````
   **Spawn based on complexity level** (read from state machine):
   ```bash
   COMPLEXITY=$(bun run src/state-machine/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "TRIVIAL")
   ````

   ```

   ```

8. **Wave tracking** (throughout execution flow)

   **Important:** The phase actor child machine handles wave tracking internally. The top-level workflow machine does NOT have a `WAVE_COMPLETE` event — that event belongs to the phase actor. The bridge CLI operates on the top-level machine only.

   For wave tracking, use `read-phase` to check current wave state, and only send `PHASE_COMPLETE` once ALL waves are done:

   ```bash
   # Check current wave progress during execution:
   WAVE_INFO=$(bun run src/state-machine/bridge.ts read-phase 2>/dev/null || echo '{"phase":null,"plan_ids":[],"wave_count":0}')

   # After ALL waves complete (not per-wave), signal phase completion:
   bun run src/state-machine/bridge.ts transition --event=PHASE_COMPLETE --data='{"phase_id":35,"summary":"All waves complete"}'
   ```

   Do NOT send `PHASE_COMPLETE` after each individual wave — that would prematurely end the phase execution state.

9. **Phase completion checklist** (around line 1439)

   Replace:

   ```
   - [ ] STATE.md reflects phase completion
   ```

   With:

   ```
   - [ ] State machine reflects phase completion (`bun run src/state-machine/bridge.ts read-status` shows correct state)
   - [ ] STATE.md snapshot is current (auto-generated by bridge)
   ```

**Acceptance Criteria:**

- All complexity reads use bridge `read-complexity`
- Phase lifecycle events (START, COMPLETE, FAILED) sent via bridge transition
- Wave tracking uses bridge events
- Code review complexity gating uses bridge output
- No uncommented `grep "Task Complexity:" .planning/STATE.md`
- STATE.md references updated to note it is machine-generated

### T3: Update phase-plan skill to use bridge commands

**Goal:** Migrate phase-plan's STATE.md reads to bridge commands. Phase-plan reads STATE.md for complexity gating and state context.

**Files:** `.claude/skills/phase-plan/SKILL.md`

**Changes required:**

1. **Complexity read for gating** (around line 187)

   Replace:

   ```
   Read complexity from STATE.md `Task Complexity:` field.
   ```

   With:

   ````
   Read complexity from state machine:
   ```bash
   COMPLEXITY=$(bun run src/state-machine/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "TRIVIAL")
   ````

   If TRIVIAL or SIMPLE, skip to step 6 (equivalent to --skip-research).

   ```

   ```

2. **STATE.md content reads** (around lines 201, 286)

   Replace:

   ```bash
   STATE_CONTENT=$(cat .planning/STATE.md)
   ```

   With:

   ```bash
   STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   ```

3. **Plan completion** (after plan creation)

   Add bridge transition for plan registration:

   ```bash
   # Register plan completion in state machine
   bun run src/state-machine/bridge.ts transition --event=PLAN_COMPLETE --data='{"plan_id":"35-01"}'
   ```

4. **Context references** (around line 265)

   Replace:

   ```
   - STATE.md, ROADMAP.md
   ```

   With:

   ```
   - State machine (via `bun run src/state-machine/bridge.ts read-status`), ROADMAP.md
   ```

**Acceptance Criteria:**

- Complexity reads use bridge `read-complexity`
- State context reads use bridge `read-status`
- Plan completion sends PLAN_COMPLETE event via bridge
- No uncommented `cat .planning/STATE.md` for primary reads

### T4: Update quick skill to use bridge commands

**Goal:** Migrate the quick task skill's STATE.md creation and reads to bridge commands. The quick skill is unique because it creates STATE.md if missing and appends to a "Quick Tasks Completed" table.

**Files:** `.claude/skills/quick/SKILL.md`

**Changes required:**

1. **STATE.md creation** (around lines 67-106)

   Replace the manual STATE.md creation blocks:

   ```bash
   cat > .planning/STATE.md << 'EOF'
   # Project State
   ...
   EOF
   ```

   With:

   ```bash
   # Initialize state machine (creates both state.json and STATE.md)
   bun run src/state-machine/bridge.ts ensure-init
   ```

2. **STATE.md existence check** (around lines 87-88)

   Replace:

   ```bash
   if [ ! -f .planning/STATE.md ]; then
   ```

   With:

   ```bash
   # Ensure state machine is initialized (idempotent)
   bun run src/state-machine/bridge.ts ensure-init 2>/dev/null || true
   ```

3. **STATE.md content read** (around line 154)

   Replace:

   ```bash
   STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
   ```

   With:

   ```bash
   STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   ```

4. **Quick task table update** (Step 7, around line 253)

   The "Quick Tasks Completed" table in STATE.md is a feature NOT tracked by the state machine. For now, keep the direct STATE.md append for this table. Add a comment explaining this is a legacy pattern:

   ```bash
   # NOTE: Quick task table is appended directly to STATE.md because
   # the state machine does not track individual quick tasks.
   # This is a legacy pattern that will be addressed in a future phase.
   # After appending, regenerate the rest of STATE.md from machine state:
   bun run src/state-machine/bridge.ts snapshot 2>/dev/null || true
   ```

   The snapshot command will overwrite the machine-managed sections but the quick task table (which is at the bottom of STATE.md) needs to be preserved. Document this as a known limitation.

5. **Checklist update** (around line 286-293)

   Replace:

   ```
   - [ ] STATE.md exists (auto-created if needed)
   ```

   With:

   ```
   - [ ] State machine initialized (state.json exists)
   - [ ] STATE.md exists and reflects machine state
   ```

**Acceptance Criteria:**

- STATE.md creation uses bridge `ensure-init` instead of manual heredoc
- State reads use bridge `read-status`
- Quick task table remains as direct STATE.md append (documented as legacy)
- Snapshot regeneration called after quick task to update machine-managed sections

### T5: Update progress skill to use bridge commands

**Goal:** Migrate the progress skill to read all state information from the bridge. The progress skill is a read-only consumer of STATE.md -- it displays a dashboard of current project state.

**Files:** `.claude/skills/progress/SKILL.md`

**Changes required:**

1. **Missing STATE.md check** (around line 34)

   Replace:

   ```
   If missing STATE.md: suggest `/project-new`.
   ```

   With:

   ````
   Check state initialization:
   ```bash
   STATE_JSON=$(bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
   ````

   If `initialized` is false: suggest `/project-new` or `/lu`.

   ```

   ```

2. **STATE.md read instruction** (around line 41)

   Replace:

   ```
   - Read `.planning/STATE.md` for living memory (position, decisions, issues)
   ```

   With:

   ```
   - Read state from bridge: `bun run src/state-machine/bridge.ts read-status`
   - The JSON output contains: state, complexity, phase, oversight, session_id, and more
   ```

3. **Dashboard data extraction** (around line 54)

   Replace:

   ```
   - From STATE.md: git context (ticket, issue, branch), current phase, plan number, status, task complexity
   ```

   With:

   ````
   - From state machine:
     ```bash
     STATE_JSON=$(bun run src/state-machine/bridge.ts read-status)
     PHASE_JSON=$(bun run src/state-machine/bridge.ts read-phase)
   ````

   - Extract: state (workflow position), complexity, phase, plan_ids, oversight, session_id

   ```

   ```

4. **Decision display** (around line 115)

   Replace:

   ```
   - [decision 1 from STATE.md]
   ```

   With:

   ```
   - [decisions tracked in MEMORY.md and WORKING.md, not in state machine]
   ```

5. **Blockers display** (around line 119)

   Replace:

   ```
   - [any blockers or concerns from STATE.md]
   ```

   With:

   ```
   - [check state machine `last_error` field via `bun run src/state-machine/bridge.ts read-field --field=last_error`]
   ```

**Acceptance Criteria:**

- All state reads use bridge commands
- Dashboard data comes from structured JSON instead of markdown parsing
- Missing state handled via bridge `initialized` field
- Progress display shows accurate machine state

### T6: Update phase-discuss skill to use bridge commands

**Goal:** Replace the single STATE.md grep in the phase-discuss skill with a bridge command. This is a minimal change because phase-discuss only reads complexity for gating.

**Files:** `.claude/skills/phase-discuss/SKILL.md`

**Changes required:**

1. **Complexity read** (around line 48)

   Replace:

   ```
   Read complexity from STATE.md `Task Complexity:` field before starting discussion.
   ```

   With:

   ````
   Read complexity from state machine before starting discussion:
   ```bash
   COMPLEXITY=$(bun run src/state-machine/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "TRIVIAL")
   ````

   Use this complexity level for discussion gating decisions.

   ```

   ```

**Acceptance Criteria:**

- Complexity read uses bridge `read-complexity`
- Fallback to "TRIVIAL" if bridge unavailable
- No other changes to the skill prompt

### T7: Update lu-executor agent to use bridge commands

**Goal:** Migrate the executor agent's STATE.md reads and writes to bridge commands. The executor is the primary implementation agent -- it reads state before execution and writes state after task completion.

**Files:** `.claude/agents/lu-executor.md`

**Changes required:**

1. **Load project state step** (around lines 93-100)

   Replace:

   ````xml
   <step name="load_project_state" priority="first">
   Before any operation, read project state:

   ```bash
   cat .planning/STATE.md 2>/dev/null
   ````

   ````
   With:
   ```xml
   <step name="load_project_state" priority="first">
   Before any operation, read project state from the state machine:

   ```bash
   bun run src/state-machine/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}'
   ````

   This returns structured JSON with: state, complexity, phase, oversight, session_id, and more.
   Fallback: If the bridge is unavailable, read STATE.md directly:

   ```bash
   cat .planning/STATE.md 2>/dev/null
   ```

   ```

   ```

2. **STATE.md update instruction** (around line 27)

   Replace:

   ```
   Your job: Execute the plan completely, commit each task, create SUMMARY.md, update STATE.md.
   ```

   With:

   ```
   Your job: Execute the plan completely, commit each task, create SUMMARY.md, update state via bridge transitions.
   ```

3. **State missing warning** (around line 110)

   Replace:

   ```
   STATE.md missing but planning artifacts exist.
   ```

   With:

   ```
   State machine not initialized but planning artifacts exist. Run `bun run src/state-machine/bridge.ts ensure-init` to initialize, or fall back to STATE.md.
   ```

**Acceptance Criteria:**

- Primary state read uses bridge `read-status`
- STATE.md fallback preserved for robustness
- Execution state updates reference bridge transitions
- Agent description updated to reference bridge

### T8: Update lu-cognition agent to use bridge commands

**Goal:** Migrate the cognition agent's STATE.md complexity read to bridge command. The cognition agent reads complexity to calibrate cognitive pre-flight depth.

**Files:** `.claude/agents/lu-cognition.md`

**Changes required:**

1. **Complexity override from STATE.md** (around line 86)

   Replace:

   ```
   **If complexity override is provided (from --complexity flag or STATE.md):**
   ```

   With:

   ```
   **If complexity override is provided (from --complexity flag or state machine):**
   ```

2. **Complexity read** (around line 180-182)

   Replace:

   ```
   3. **Read current complexity from STATE.md:**

      grep "Task Complexity:" .planning/STATE.md
   ```

   With:

   ````
   3. **Read current complexity from state machine:**

      ```bash
      bun run src/state-machine/bridge.ts read-complexity 2>/dev/null || echo '{"complexity":"TRIVIAL"}'
   ````

   Fallback: `grep "Task Complexity:" .planning/STATE.md`

   ```

   ```

**Acceptance Criteria:**

- Complexity read uses bridge `read-complexity` as primary method
- STATE.md grep preserved as documented fallback
- No other changes to the cognition agent

### T9: Update lu-roadmapper agent to use bridge commands

**Goal:** Migrate the roadmapper agent's STATE.md initialization and write patterns to bridge commands. The roadmapper creates the initial STATE.md during project setup.

**Files:** `.claude/agents/lu-roadmapper.md`

**Changes required:**

1. **Core responsibilities** (around line 34)

   Replace:

   ```
   - Initialize STATE.md (project memory)
   ```

   With:

   ```
   - Initialize state machine via bridge (creates both state.json and STATE.md)
   ```

2. **STATE.md structure section** (around line 324-326)

   Replace:

   ```
   ## STATE.md Structure

   Use template from `./.cursor/luca/templates/state.md`.
   ```

   With:

   ````
   ## State Machine Initialization

   Initialize the state machine via bridge CLI. STATE.md is auto-generated:
   ```bash
   bun run src/state-machine/bridge.ts ensure-init
   bun run src/state-machine/bridge.ts transition --event=START --data='{"ticket_id":"PROJ-1234"}'
   bun run src/state-machine/bridge.ts snapshot
   ````

   The bridge generates a STATE.md that follows the standard format.
   Fallback: Use template from `./.cursor/luca/templates/state.md` if bridge is unavailable.

   ```

   ```

3. **Write STATE.md instruction** (around line 454)

   Replace:

   ```
   2. **Write STATE.md** using output format
   ```

   With:

   ````
   2. **Initialize state machine** via bridge, then generate STATE.md snapshot:
   ```bash
   bun run src/state-machine/bridge.ts ensure-init --force
   bun run src/state-machine/bridge.ts snapshot
   ````

   ```

   ```

4. **Output file list** (around line 486)

   Replace:

   ```
   - .planning/STATE.md
   ```

   With:

   ```
   - .planning/state.json (state machine, source of truth)
   - .planning/STATE.md (human-readable snapshot, auto-generated)
   ```

5. **Verification** (around line 516)

   Replace:

   ```
   - `cat .planning/STATE.md`
   ```

   With:

   ```
   - `bun run src/state-machine/bridge.ts read-status`
   - `cat .planning/STATE.md` (verify snapshot is current)
   ```

6. **Checklist** (around line 632)

   Replace:

   ```
   - [ ] STATE.md structure complete
   ```

   With:

   ```
   - [ ] State machine initialized (state.json exists)
   - [ ] STATE.md snapshot generated and current
   ```

**Acceptance Criteria:**

- STATE.md initialization uses bridge `ensure-init`
- STATE.md generation uses bridge `snapshot`
- Output file list includes both state.json and STATE.md
- Template fallback documented for when bridge is unavailable

### T10: Create state machine integration reference for prompt authors

**Goal:** Document the bridge CLI commands, their output formats, and migration patterns in a Cursor/Claude rule file. This serves as the canonical reference for anyone authoring or updating skill/agent prompts.

**Files:** `.claude/rules/state-machine-bridge.md`

**Implementation:**

Create a rule file with the following structure:

```markdown
# State Machine Bridge CLI for prompt authors

## rule

# State Machine Bridge Commands

**CRITICAL**: Skills and agents should use the state machine bridge CLI
(`bun run src/state-machine/bridge.ts`) instead of directly reading/writing
STATE.md. STATE.md is auto-generated from the state machine for backward
compatibility.

## Available Commands

### Read Commands (Idempotent, No Side Effects)

| Command                     | Output                                                             | Fallback                     |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `read-status`               | `{ initialized, state, complexity, phase, oversight, session_id }` | `{ initialized: false }`     |
| `read-complexity`           | `{ complexity: "COMPLEX" }`                                        | `{ complexity: "TRIVIAL" }`  |
| `read-phase`                | `{ phase, plan_ids, wave_count }`                                  | `{ phase: null }`            |
| `read-oversight`            | `{ oversight: "milestone" }`                                       | `{ oversight: "milestone" }` |
| `read-field --field=<path>` | `{ field, value }`                                                 | Error (exit 2)               |

### Write Commands (Mutate State)

| Command                                     | Effect                                   |
| ------------------------------------------- | ---------------------------------------- |
| `transition --event=<TYPE> [--data=<json>]` | Send event, persist, regenerate STATE.md |
| `snapshot [--output=<path>]`                | Regenerate STATE.md from current state   |
| `ensure-init [--force]`                     | Initialize state machine (idempotent)    |

### Common Events

| Event           | When to Send             | Data                    |
| --------------- | ------------------------ | ----------------------- |
| START           | Session begins           | `{ ticket_id }`         |
| ROUTE_COMPLETE  | Complexity classified    | `{ complexity }`        |
| PLAN_COMPLETE   | Plan created             | `{ plan_id }`           |
| PHASE_START     | Phase execution begins   | `{ phase_id }`          |
| PHASE_COMPLETE  | Phase execution succeeds | `{ phase_id, summary }` |
| PHASE_FAILED    | Phase execution fails    | `{ phase_id, error }`   |
| VERIFY_PASSED   | Verification succeeds    | `{}`                    |
| COMMIT_COMPLETE | Git commit done          | `{ commit_hash }`       |

## Migration Patterns

[Include the 5 migration patterns from the Context section above]

## Backward Compatibility

STATE.md is automatically regenerated from the state machine in three ways:

1. After every `transition` command
2. By the snapshot-sync PostToolUse hook (throttled, every 120s)
3. By the pre-commit gate (before every commit)

Skills/agents that still read STATE.md directly will see correct data.
New code should prefer bridge commands for typed, validated access.

## Error Handling

All bridge commands handle the "state not initialized" case gracefully:

- Read commands return sensible fallbacks (TRIVIAL, milestone, null)
- Write commands error with exit code 2 (caller must ensure-init first)
- Always use `2>/dev/null || echo '<fallback>'` in prompt bash snippets
```

**Acceptance Criteria:**

- Rule file documents all bridge subcommands with examples
- Output format for each command is specified
- Migration patterns show before/after for all 5 common patterns
- Fallback behavior documented for uninitialized state
- Event table lists common events with their data payloads
- Backward compatibility mechanism explained

## Success Criteria

1. All 6 skill prompts updated to reference bridge commands
2. All 3 agent prompts updated to reference bridge commands
3. Integration reference rule created with complete documentation
4. No skill/agent prompt has uncommented `cat .planning/STATE.md` for primary state access
5. All complexity reads use `read-complexity` instead of grep
6. All state writes use `transition` events
7. Fallback patterns documented in case bridge is unavailable
8. Existing workflow behavior is unchanged (prompts produce same results)
9. Quick task table legacy pattern documented as known limitation
10. All test files still pass (`bun test`)

## Verification

**Automated checks:**

- `bun run build:all` -- regenerate all outputs (skills, agents, rules, hooks) from source
- `bun run check:drift` -- verify no drift between source and built outputs
- `bun test` -- full test suite passes (no regressions from prompt changes)

**Manual verification:**

- Read each updated skill prompt and confirm bridge commands are syntactically correct
- Verify fallback patterns are present for each bridge call
- Run `/progress` and confirm it reads state from bridge successfully
- Run `/quick` and confirm state initialization uses bridge
- Verify `.claude/rules/state-machine-bridge.md` is complete and accurate
- Cross-reference bridge subcommand documentation with actual bridge.ts implementation
- Confirm migration pattern examples are copy-pasteable and produce valid output
