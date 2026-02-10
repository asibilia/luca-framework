---
title: Implement hooks as deterministic quality gates
area: workflow
created: 2026-02-10
source: codebase-audit + research
---

## Context

The codebase has **zero hooks** (`.claude/hooks/` doesn't exist). This is a critical gap. Research shows hooks are the most reliable enforcement mechanism in Claude Code — they're deterministic where instructions are advisory. Anthropic's own best practice: "Convert CLAUDE.md rules to hooks when Claude ignores them."

Currently, all quality enforcement (formatting, linting, type-checking, security) relies on sub-agents remembering to run checks. Hooks would make these automatic and unavoidable.

## Task

1. **Design hook architecture** — Identify which lifecycle events to hook into:
   - `PreToolUse` (before file edits, before bash commands)
   - `PostToolUse` (after file edits — auto-format, lint)
   - `Notification` (on context usage thresholds)
   - `Stop` (before session ends — ensure WORKING.md is saved)

2. **Implement core hooks:**
   - **Post-edit formatting** — Auto-run formatter after every file write/edit
   - **Post-edit type-check** — Run type-checker after TypeScript edits
   - **Pre-commit quality gate** — Block commits if tests fail or linting errors exist
   - **Context usage monitor** — Warn at 30%, alert at 50%, suggest `/compact` at 70%
   - **WORKING.md persistence** — On Stop, ensure session state is saved
   - **Migration/sensitive file protection** — Block writes to protected paths

3. **Design hook + skill interplay** — Hooks handle deterministic enforcement; skills handle interactive workflows. Define the boundary clearly.

4. **Package hooks in framework template** — Hooks should be distributable to downstream projects via `luca init`

## Notes

- Hooks are the missing enforcement layer — skills are advisory, hooks are deterministic
- Research finding: "If you can't verify it, don't ship it" — hooks automate verification
- Three hook types available: shell hooks (run commands), prompt hooks (single LLM judgment), agent hooks (spawn subagent)
- Context usage monitoring directly addresses the quality degradation curve Luca already documents
- This is arguably the highest-impact single improvement to the framework
