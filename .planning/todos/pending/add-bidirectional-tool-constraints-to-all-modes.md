---
title: "Add bidirectional tool constraints and tool discipline sections to all mode instructions"
area: prompt-engineering
created: 2026-04-13
priority: high
source: research
sprint: 2
---

## Task

Add a `## Tool Discipline` section to each pipeline mode instruction file with bidirectional constraints: for every "use X" instruction, add "do NOT use Y for the same purpose." Also add explicit mutation-tool blocklists to all read-only modes.

## Context

Claude Code's Bash tool description is the canonical example: "Use Read (NOT cat/head/tail). Use Edit (NOT sed/awk). Use Glob (NOT find/ls)." Every positive instruction has a corresponding negative constraint. Models default to familiar shell commands from training data — bidirectional constraints fight this tendency by explicitly naming prohibited alternatives.

luca-mastracode's instruction files reference tools by name but never say what NOT to use. Read-only modes say "read-only" but don't list which mutation tools are prohibited.

## Research References

- [03-tool-definition-engineering.md](../../docs/research/prompt-architecture/03-tool-definition-engineering.md) — Section 3: Anti-redundancy pattern, bidirectional constraints
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 3: "Every positive instruction has a corresponding negative constraint"
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 2, item 2.2

## Implementation

### Pipeline Modes — Add Tool Discipline Section

**execute.md:**
```markdown
## Tool Discipline
- Use `runChecks` for all automated checks. Do NOT run tsc/eslint/tests directly via execute_command.
- Use `workflowState` for all state reads and transitions. Do NOT read .planning/luca-state.json directly.
- Use `manageTodos` for backlog operations. Do NOT create or modify todo files directly.
- Use `verificationResult` for structured verification output. Do NOT write verification results as prose.
```

**architect.md:**
```markdown
## Tool Discipline
- Use `manageRoadmap` for ROADMAP.md operations. Do NOT write ROADMAP.md via writePlanningFile.
- Use `workflowState(action: "save-plan-artifacts")` to record plan paths. Do NOT write state.json directly.
- Use `manageTodos(action: "assign-batch")` for bulk assignment. Do NOT move todos one at a time.
```

### Read-Only Modes — Add Explicit Blocklists

**triage.md** (after "read-only + classification only"):
```markdown
Do NOT use `manageTodos(action: "add")`, `writePlanningFile`, `string_replace_lsp`,
`write_file`, or `execute_command`. The only mutation tools permitted are
`workflowState`, `classifyComplexity`, and `pipelineLock`.
```

**research.md:**
```markdown
Do NOT use `string_replace_lsp`, `write_file`, or `execute_command` for code modifications.
Use ONLY `writePlanningFile` for .planning/ output.
```

**review.md:**
```markdown
Do NOT use `string_replace_lsp`, `write_file`, or `execute_command` for file changes.
Use ONLY `writePlanningFile` for .planning/ output.
```

## Files Changed

All 10 files in `packages/luca-mastracode/src/instructions/`

## Constraints

- Do NOT duplicate tool schema information — focus on behavioral when/when-not guidance
- Keep each Tool Discipline section under 100 words
