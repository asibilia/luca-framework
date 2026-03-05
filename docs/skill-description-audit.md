# Skill Description Audit

Observational audit of skill descriptions for trigger accuracy. No changes recommended yet -- this documents findings for future refinement.

## Methodology

Reviewed all 47 skill `description` fields in `src/skills/general/` and `src/skills/luca/` for:

- **Too broad**: Could trigger on unrelated prompts
- **Too narrow**: Might miss valid triggers
- **Overlapping**: Multiple skills could trigger on the same prompt

## Findings

### Potentially Too Broad

| Skill    | Description                                                                | Concern                                                                                                            |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `quick`  | "Execute a quick task without full workflow overhead."                     | Very generic -- any small request could match. May compete with direct user prompts that don't need skill routing. |
| `note`   | "Capture a note to WORKING.md for session memory."                         | "note" is a common word; could trigger when users mention taking notes in unrelated contexts.                      |
| `choose` | "Let the user choose what to do next by presenting context-aware options." | Could match any ambiguous user input where intent is unclear.                                                      |

### Potentially Too Narrow

| Skill            | Description                                                                                    | Concern                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `git-commit`     | "Stage and commit changes using the project's conventional commit CLI with ticket extraction." | Mentions "conventional commit CLI" which is implementation-specific. Users saying "commit my changes" might not match if routing is literal. |
| `phase-research` | "Deep-dive research on a specific topic before planning a phase."                              | Limits to "before planning a phase" -- users may want research at other workflow points.                                                     |
| `qa-consolidate` | "Consolidate QA feedback from multiple reviewers into actionable items."                       | Only mentions "QA feedback" -- could miss general "merge reviewer feedback" requests.                                                        |

### Overlapping Descriptions

| Skills                               | Overlap                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase-plan` / `session-plan`        | Both mention planning. A user saying "plan my next step" could route to either. The `session-plan` description ("Plan a development session...") helps differentiate, but "plan" alone is ambiguous. |
| `milestone-audit` / `milestone-gaps` | Both relate to milestone health. `audit` focuses on completeness checks, `gaps` on identifying missing work. A user saying "check my milestone" could match either.                                  |
| `verify` / `test-run`                | Both involve running checks. `verify` is broader (goal verification), `test-run` is focused on test execution. "Run my tests" should route to `test-run` but could match `verify`.                   |
| `code-lint` / `code-typecheck`       | Both are code quality checks. A user saying "check my code" could match either. These are distinct enough in practice but could benefit from clearer routing hints.                                  |
| `session-pause` / `session-resume`   | No overlap in description, but a user saying "I need to stop" could match pause while "let's continue" could match resume. These are well-scoped.                                                    |

### Well-Scoped Descriptions (No Issues)

The following skills have clear, well-scoped descriptions that should route accurately:

- `debug` -- "Systematic debugging workflow with persistent hypothesis state across context resets."
- `phase-execute` -- "Execute all plans in a phase with wave-based parallelization and harness verification."
- `git-feature` -- "Create a feature branch from a Jira ticket or GitHub issue."
- `git-pr` -- "Create a pull request with structured description from commit history."
- `pr-address` -- specific to PR comment handling
- `codebase-map` -- specific to codebase visualization
- `repo-audit` -- specific to repository health checking
- `autopilot` -- specific to autonomous multi-phase execution
- `workflow-start` -- specific to initial project setup

## Recommendations (Future Work)

1. **Add routing hints** to descriptions for overlapping skills (e.g., keywords that disambiguate)
2. **Narrow `quick`** to mention specific triggers like "quick fix" or "one-off task"
3. **Broaden `git-commit`** to include simpler phrasing like "commit changes"
4. **Consider negative routing** for skills that shouldn't trigger (e.g., `quick` should not trigger during active phase execution)
