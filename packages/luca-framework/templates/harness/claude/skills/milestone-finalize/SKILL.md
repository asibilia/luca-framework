# milestone-finalize

Commit, tag, and handle divergent mode advisory for the milestone-complete sub-skill chain.

## main

<main>
# milestone-finalize — Commit, Tag, and Divergent Mode

Create the final commit and git tag, then handle the divergent mode advisory.

## Context File Protocol

This sub-skill is part of the milestone-complete chain. It reads/writes the shared context file at `/tmp/milestone-complete-context.json`.

**Read:** Call `readMilestoneCompleteContext()` from `src/skills/__schemas/milestone-complete-context.schemas.ts`. If `success: false`, ABORT immediately.

**Write:** Call `writeMilestoneCompleteContext({ milestone_finalize: { ... } })` to populate the `milestone_finalize` section.

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
```

## Process

### Step 8: Commit and Tag

```bash
git add .
bun run commit --message="archive v{version} milestone" --type=chore --scope=milestone --no-push --skip-checks
git tag -a v{version} -m "[milestone summary]"
```

Ask about pushing tag.

### Step 8.5: Divergent Mode Advisory

#### Milestone Counter

Recall the convergent streak counter from MuninnDB:
```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "metric:convergent-streak")
```

If no counter exists, create it with count = 1. If counter exists, increment it.

#### Graduation Check

Before showing the nudge, check if divergent mode has graduated out:
```
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "metric:divergent-optin-rate")
```

If `sample_count >= 20` AND `rate < 0.10`: SKIP the nudge entirely.

#### Nudge (streak >= 8 AND not graduated out)

If `consecutive_milestones >= 8` AND graduation check passes:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 <%= branding.frameworkName %> > DIVERGENT MODE ADVISORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You've completed {N} consecutive milestones in convergent
(spec-driven) mode. Consider taking a divergent break:

  - Architecture sketching and exploration
  - Research reading and technology evaluation
  - Product exploration and shaping future work
  - Anything cognitively distinct from spec-driven development

Recommended duration: 1 calendar day (COMPLEX), 2 days (CRITICAL)
No acceptance criteria. No deliverables required.

[Y] Enter divergent mode  [N] Continue convergent work
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If developer opts IN (Y):**
- Reset convergent streak to 0
- Update divergent opt-in rate
- Set cooldown via bridge:
  ```bash
  luca-bridge set-field --field=cooldown_reason --value='"Divergent mode: {N} consecutive milestones completed"' 2>/dev/null || true
  luca-bridge transition --event=COOLDOWN_COMPLETE 2>/dev/null || true
  ```
- Display: "Entering divergent mode. When ready to return, start a new session."

**If developer opts OUT (N):**
- Update divergent opt-in rate
- Emit SKIP_COOLDOWN:
  ```bash
  luca-bridge transition --event=SKIP_COOLDOWN 2>/dev/null || true
  ```

#### No Nudge (streak < 8)

Silently emit SKIP_COOLDOWN and proceed.

### Step 9: Offer Next Steps

- `/milestone-new` -- start next milestone

### Step 9.5: Write to Context File

```typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({
  milestone_finalize: {
    committed: true,
    tagged: true,
    tag_name: "v{version}",
    divergent_mode_entered: userOptedIn,
  },
});
```

## Output

On success, the context file `milestone_finalize` section will contain:

```json
{
  "committed": true,
  "tagged": true,
  "tag_name": "v8.5.0",
  "divergent_mode_entered": false
}
```

## Error Handling

- **Git commit failure:** Log error, set `committed: false`, try to continue with tag.
- **Git tag failure:** Log error, set `tagged: false`, continue to divergent mode advisory.
- **MuninnDB recall failure (convergent streak):** Default to streak = 0, skip nudge.
- **Context file read failure:** ABORT immediately.

## Constraints

- This is the final sub-skill in the chain
- Contains interactive elements (push tag, divergent mode)
- Uses bridge CLI for state transitions (COOLDOWN_COMPLETE / SKIP_COOLDOWN)
- Uses REPO_VAULT for convergent streak and opt-in rate metrics
</main>