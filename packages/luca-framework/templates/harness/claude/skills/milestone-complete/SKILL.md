# milestone-complete

Archive a completed milestone by orchestrating sub-skills: milestone-learn, milestone-prune, milestone-shadow-gate, milestone-archive, milestone-finalize.

## main

<main>
# milestone-complete — Thin Orchestrator

Archive a completed milestone through a coordinated sub-skill chain. This skill is a **thin orchestrator** — it delegates ALL work to sub-skills via Skill() calls, reads context between steps, and transitions state.

## Zero-Inline-Logic Constraint

This orchestrator MUST contain ONLY:
- **Skill() calls** to the 5 sub-skills
- **Context file reads** via `readMilestoneCompleteContext()` to check conditions between steps
- **State writes** via `writeMilestoneCompleteContext({ current_state: "..." })` after each transition
- **Arg parsing** and config reads (shadow_debt.enabled check)

This orchestrator MUST NOT contain:
- MuninnDB calls (those belong in milestone-learn and milestone-prune)
- `Task()` spawns (those belong in milestone-shadow-gate)
- `gh api` calls (those belong in milestone-archive)
- `git tag` or `git commit` (those belong in milestone-finalize)
- Any business logic beyond reading context and choosing the next Skill() call

## Arguments

`<version>` (e.g., "8.5.0", "9.0")

## State Machine

This orchestrator drives the `milestoneCompleteStateMachine` defined in
`src/skills/__schemas/states/milestone-complete.states.ts`. States flow:

```
idle -> learned -> pruned -> scanned -> archived -> finalized
```

Terminal states: `finalized` (success) or `failed` (error).

Conditional path uses explicit SKIP event (fail-closed):
- `SKIP_SCAN`: Shadow debt scanning is disabled in config (orchestrator decides)

## CRITICAL: current_state Tracking

After EVERY state transition, the orchestrator MUST write `current_state` to the context file:

```typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({ current_state: "learned" } as any);
```

The pre-step enforcement hook (`pre-step-milestone-complete`) reads this field to validate that sub-skills are called in the correct order. If `current_state` is not written, the hook defaults to "idle" and blocks all non-initial sub-skills.

## Orchestrator Flow

### Step 0: Parse Args and Initialize Context

Parse the milestone version from Skill() args.

Initialize the context file at `/tmp/milestone-complete-context.json`:

```typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({});
// This creates the file with context_version: 1
```

Read shadow debt config for the SKIP_SCAN decision:

```bash
SHADOW_ENABLED=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.enabled ?? true)" 2>/dev/null || echo "true")
```

State: `idle`

### Step 1: Learning Extraction

```
Skill("milestone-learn")
```

On success: state becomes `learned`
On failure: send ABORT -> state becomes `failed` (required sub-skill)

**Write state:**
```typescript
await writeMilestoneCompleteContext({ current_state: "learned" } as any);
```

### Step 2: Stale Memory Pruning

```
Skill("milestone-prune")
```

On success: state becomes `pruned`
On failure: send ABORT -> state becomes `failed` (required sub-skill)

**Write state:**
```typescript
await writeMilestoneCompleteContext({ current_state: "pruned" } as any);
```

### Step 3: Shadow Debt Gate (Conditional)

Check the config value parsed in Step 0:

**If shadow scanning is ENABLED:**

```
Skill("milestone-shadow-gate")
```

On success: state becomes `scanned` (via SCAN_COMPLETE)
On failure: state becomes `scanned` (via SKIP_SCAN — shadow gate is optional)

**If shadow scanning is DISABLED:**

Send `SKIP_SCAN` explicitly -> state becomes `scanned` (fail-closed: always send a transition event)

**Write state (in both cases):**
```typescript
await writeMilestoneCompleteContext({ current_state: "scanned" } as any);
```

### Step 4: Archive Milestone

```
Skill("milestone-archive")
```

On success: state becomes `archived`
On failure: send ABORT -> state becomes `failed` (required sub-skill)

**Write state:**
```typescript
await writeMilestoneCompleteContext({ current_state: "archived" } as any);
```

### Step 5: Finalize (Commit + Tag + Divergent Mode)

```
Skill("milestone-finalize")
```

On success: state becomes `finalized`
On failure: send ABORT -> state becomes `failed` (required sub-skill)

**Write state:**
```typescript
await writeMilestoneCompleteContext({ current_state: "finalized" } as any);
```

## Error Handling

**Required sub-skills** (milestone-learn, milestone-prune, milestone-archive, milestone-finalize):
- On failure -> send ABORT -> terminal `failed` state
- The workflow halts; no further Skill() calls

**Optional sub-skills** (milestone-shadow-gate):
- On failure -> log warning, send SKIP_SCAN -> continue to next state
- Shadow scanning failure does not block milestone completion

## Success Criteria

- [ ] All learnings extracted (milestone-learn)
- [ ] Stale memories pruned (milestone-prune)
- [ ] Shadow debt scanned OR explicitly skipped (milestone-shadow-gate or SKIP_SCAN)
- [ ] Milestone archived with stats and retrospective (milestone-archive)
- [ ] Git tagged and committed (milestone-finalize)
- [ ] State machine reaches `finalized` (success) or `failed` (error) terminal state
- [ ] `current_state` written after every state transition

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Ready for next milestone | Start new milestone | `/milestone-new` |
| Want to review completion | Check progress | `/progress` |
| Need to create PR | Create pull request | Run `gh pr create` |

**Primary:** `/milestone-new` -- Start the next milestone cycle
</main>