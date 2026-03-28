# milestone-shadow-gate

Run pre-archive shadow debt scan for the milestone-complete sub-skill chain.

## main

<main>
# milestone-shadow-gate — Pre-Archive Shadow Debt Gate

Run a full shadow scan before milestone archival. This step catches debris accumulated across all phases in the milestone.

## Context File Protocol

This sub-skill is part of the milestone-complete chain. It reads/writes the shared context file at `/tmp/milestone-complete-context.json`.

**Read:** Call `readMilestoneCompleteContext()` from `src/skills/__schemas/milestone-complete-context.schemas.ts`. If `success: false`, ABORT immediately.

**Write:** Call `writeMilestoneCompleteContext({ milestone_shadow_gate: { ... } })` to populate the `milestone_shadow_gate` section.

## Vault Resolution

```bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
```

## Process

### Step 1: Check Shadow Config

Read shadow debt configuration:

```bash
SHADOW_ENABLED=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.enabled ?? true)" 2>/dev/null || echo "true")
BLOCK_ON_CRITICAL=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.block_milestone_on_critical ?? true)" 2>/dev/null || echo "true")
```

Note: If this sub-skill is being called, the orchestrator has already determined that shadow scanning is enabled. However, verify the config as a safety check.

### Step 2: Spawn <%= branding.commandPrefix %>-shadow-scanner

Spawn `<%= branding.commandPrefix %>-shadow-scanner` with `full` mode:

```
Task(
  prompt: """
<shadow_scan_context>
**Scan mode:** full
**Context:** Pre-archive gate for milestone v{version}
**Config:** {shadow_debt config JSON}
</shadow_scan_context>

Scan the repository for AI-session debris using full mode (all 5 categories).
Return a valid ShadowScanReport JSON block as your final output.
""",
  subagent_type: "<%= branding.commandPrefix %>-shadow-scanner",
  description: "Pre-archive shadow scan (full mode, milestone v{version})"
)
```

Parse the returned `ShadowScanReport`.

### Step 3: Handle Results

**If no CRITICAL findings:** Store metric and write results to context file.

**If CRITICAL findings exist AND `block_milestone_on_critical` is true:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 <%= branding.frameworkName %> > SHADOW DEBT GATE — {n} CRITICAL findings before milestone archive
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{findings list — file_path, description, recommendation for each CRITICAL finding}

Actions:
  [F] Fix now — run /shadow-cleanup --full --fix
  [S] Skip    — note findings in milestone archive and proceed
  [A] Abort   — halt milestone completion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Handle user response:

**F — Fix now:**
- Instruct user to run `/shadow-cleanup --full --fix` in a new session.
- Halt milestone completion.

**S — Skip:**
- Note CRITICAL findings in context for milestone-archive to include.
- Proceed (write results to context file).

**A — Abort:**
- Halt milestone completion. Set gate_result to "blocked".

### Step 4: Store Metric and Write Context

Store metric regardless of user choice:

```
mcp__muninn__muninn_remember(
  vault: REPO_VAULT,
  concept: "metric:shadow-debt-milestone-v{version}",
  content: JSON.stringify({
    scan_mode: "full",
    total: {total},
    critical: {critical},
    high: {high},
    medium: {medium},
    low: {low},
    gate_result: "blocked|skipped|clean",
    scanned_at: "{ISO timestamp}"
  })
)
```

Write results to context file:

```typescript
import { writeMilestoneCompleteContext } from "src/skills/__schemas/milestone-complete-context.schemas";

await writeMilestoneCompleteContext({
  milestone_shadow_gate: {
    shadow_scan_ran: true,
    violations_found: totalViolations,
    critical_count: criticalCount,
    high_count: highCount,
    gate_result: gateResult,
  },
});
```

## Output

On success, the context file `milestone_shadow_gate` section will contain:

```json
{
  "shadow_scan_ran": true,
  "violations_found": 3,
  "critical_count": 0,
  "high_count": 1,
  "gate_result": "clean"
}
```

## Error Handling

- **<%= branding.commandPrefix %>-shadow-scanner spawn failure:** Log warning, set `shadow_scan_ran: false`, `gate_result: "error"`, write to context, and return.
- **User chooses Abort:** Set `gate_result: "blocked"`, write to context, and return with error signal.
- **Context file read failure:** ABORT immediately.

## Constraints

- This is an OPTIONAL sub-skill (orchestrator may send SKIP_SCAN instead)
- When called, it MUST spawn <%= branding.commandPrefix %>-shadow-scanner (do not skip the scan)
- User interaction is required only if CRITICAL findings are found
</main>