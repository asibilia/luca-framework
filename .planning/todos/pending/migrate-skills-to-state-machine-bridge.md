---
title: Migrate remaining 38 skills to use state machine bridge
area: architecture
created: 2026-02-15
source: conversation
---

## Context

The XState state machine and bridge CLI (`src/state-machine/bridge.ts`) are fully implemented. However, only 6 of 44 skills have been migrated to use the bridge. The remaining 38 still directly read/write `.planning/STATE.md` via grep, cat, sed, and heredocs.

### Already migrated (6 skills)

- `phase-plan.skill.ts` — `read-complexity`, `read-status`
- `phase-execute.skill.ts` — `read-status`, `read-complexity`, `transition complete-phase`
- `phase-discuss.skill.ts` — `read-complexity`
- `progress.skill.ts` — `read-status`
- `quick.skill.ts` — `ensure-init`
- `autopilot.skill.ts` — `read-status`

### Not yet migrated (38 skills)

Workflow/management: choose, codebase-map, config-profile, config-settings, debug, help, session-resume, milestone-complete

Git/GitHub: git-commit, git-feature, git-pr

Code quality: code-lint, code-typecheck, jira-issue

Milestone management: milestone-audit, milestone-gaps, milestone-new, phase-assumptions

Phase management: phase-add, phase-insert, phase-remove, phase-research, pr-address

Rules: rule-complexity-gating, rule-file-naming, rule-harness-verification, rule-lu-workflow

Learning/testing: session-pause, test-run, todo-add, todo-check

Misc: update, verify, workflow-start, lu

## Task

For each of the 38 remaining skills:

1. Identify all direct STATE.md reads (grep, cat) and replace with bridge commands as primary, keeping STATE.md as fallback
2. Identify all direct STATE.md writes (sed, heredoc, cat >) and replace with bridge `transition` commands
3. Use the established dual-layer pattern from the migrated skills
4. Adopt unused bridge commands where appropriate: `snapshot`, `gate-check`, `read-oversight`, `read-field`

### Migration pattern

```bash
# Before (legacy)
COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}')

# After (bridge primary, STATE.md fallback)
COMPLEXITY=$(bun run src/state-machine/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "")
if [ "$COMPLEXITY" = "" ] || [ "$COMPLEXITY" = "undefined" ]; then
  COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
fi
```

### Priority order

1. **High**: Skills that write state (workflow-start, session-resume, milestone-complete, verify, phase-\* management)
2. **Medium**: Skills that read state for gating decisions (git-commit, git-pr, test-run)
3. **Low**: Skills that only display state (help, debug, todo-check, progress already done)

## Notes

- Keep STATE.md fallback until bridge is battle-tested across all skills
- Only `phase-execute` currently uses bridge for writes — expanding write coverage is the biggest win
- The `snapshot` command can replace manual STATE.md regeneration in several skills
- Consider batching skills by category (all git-_ together, all milestone-_ together, etc.)
