# Luca Workflow v2: 10-Step Reference

Luca Workflow v2 replaces the linear discuss-plan-execute pipeline with a research-heavy, review-loop-based workflow. The core insight: **research quality determines execution quality**. By front-loading deep, multi-agent research and gating it behind convergence-based review loops, v2 eliminates the "hallucinated plan" failure mode where agents confidently build the wrong thing.

## Running Example

All step documentation uses a single running example to illustrate the complete flow:

> **Task:** "Add WebSocket reconnection logic with exponential backoff to a Bun HTTP server"

This example is complex enough to exercise every step (research, discussion, specialist expansion, review loops, per-task recall) while being concrete enough to follow.

## Step Overview

| #   | Step                                     | Key Agents                                                                      | Primary Outputs                                     | MuninnDB                                                                        | v1 Mapping                                          |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | [Ideate](01-ideate.md)                   | `lu-cognition`, `lu-router`                                                     | Structured intent in STATE.md                       | `muninn_recall` (prior art)                                                     | New (was implicit)                                  |
| 2   | [Research](02-research.md)               | 4 specialized researchers (parallel), `lu-research-synthesizer`                 | `.planning/phases/{NN}-{name}/research/*.md`        | `muninn_recall` (past patterns), `muninn_remember` (session:research-\*)        | `phase-research` (massively expanded)               |
| 3   | [Discuss + Pre-mortem](03-discuss.md)    | `lu-discuss-researcher` x N, `lu-premortem`                                     | `CONTEXT.md`, `PREMORTEM.md`                        | `muninn_recall` (brain:project-identity), `muninn_remember` (session:decisions) | `phase-discuss` (enhanced)                          |
| 4   | [Deep Expand](04-deep-expand.md)         | Specialist researcher agents (per topic)                                        | `.planning/phases/{NN}-{name}/research/05-*.md`+    | `muninn_recall` (patterns, pitfalls)                                            | NEW                                                 |
| 5   | [Review Research](05-review-research.md) | `lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer` | Convergence record, revised research files          | `muninn_recall` (verification patterns)                                         | NEW                                                 |
| 6   | [Graduate to MuninnDB](06-graduate.md)   | `lu-research-graduator`                                                         | MuninnDB `research:*` engrams, GRADUATION-REPORT.md | `muninn_remember_batch` (research:\*)                                           | NEW                                                 |
| 7   | [Plan](07-plan.md)                       | `lu-planner`                                                                    | PLAN.md files with `@research` refs                 | `muninn_recall` (patterns, procedures)                                          | `phase-plan` (enhanced with research refs)          |
| 8   | [Review Plan](08-review-plan.md)         | `code-architect`, `dx-advocate`, `security-auditor`                             | Convergence record, revised plans                   | `muninn_recall` (planning pitfalls)                                             | `lu-plan-checker` (expanded to multi-reviewer loop) |
| 9   | [Execute](09-execute.md)                 | `lu-executor`                                                                   | Code, SUMMARY.md, commits                           | `muninn_recall` (per-task targeted), `muninn_remember` (session:findings)       | `phase-execute` (enhanced with per-task recall)     |
| 10  | [Verify + UAT](10-verify.md)             | `lu-verifier`, `lu-learner`, code review agents                                 | VERIFICATION.md, UAT.md, promoted engrams           | `muninn_remember` (pattern:_, pitfall:_, procedure:\*)                          | `verify` (enhanced with research traceability)      |

## Data Flow Diagram

```
User Idea
    |
    v
[1. Ideate] ──> Structured Intent
    |
    v
[2. Research] ──> .planning/phases/{NN}-{name}/research/01-04-*.md
    |
    v
[3. Discuss + Pre-mortem] ──> CONTEXT.md + PREMORTEM.md
    |                          (locks decisions, identifies risks)
    v
[4. Deep Expand] ──> .planning/phases/{NN}-{name}/research/05+*.md
    |                 (specialist deep-dives, same directory)
    v
[5. Review Research] ──> Convergence score
    |                     (loop until reviewers approve)
    |   ^
    |   | (revision loop)
    |   |
    +---+
    |
    v
[6. Graduate to MuninnDB] ──> Persistent engrams
    |                          (distilled research findings)
    v
[7. Plan] ──> PLAN.md files (with @research refs)
    |
    v
[8. Review Plan] ──> Convergence score
    |                  (loop until reviewers approve)
    |   ^
    |   | (revision loop)
    |   |
    +---+
    |
    v
[9. Execute] ──> Code + commits + SUMMARY.md
    |              (per-task MuninnDB recall)
    v
[10. Verify + UAT] ──> VERIFICATION.md + UAT.md
                        (learning capture to MuninnDB)
```

## Key Differences from v1

| Aspect               | v1                                                  | v2                                                               |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Research             | Single `lu-phase-researcher` agent, one RESEARCH.md | Parallel facet-specific researchers, deep expansion, review loop |
| Research review      | None (research accepted as-is)                      | Multi-reviewer convergence loop (Step 5)                         |
| MuninnDB integration | Session tracking, post-execution learning           | Research graduation (Step 6), per-task recall (Step 9)           |
| Plan review          | Single `lu-plan-checker`, max 3 iterations          | Multi-reviewer convergence loop (Step 8)                         |
| Research persistence | Ephemeral (file-only, lost across sessions)         | Graduated to MuninnDB engrams (Step 6)                           |
| Discussion           | Gray area identification, optional pre-mortem       | Research-informed discussion, mandatory decision locking         |
| Execution            | Plan-driven with harness verification               | Plan-driven with per-task targeted MuninnDB recall               |

## Convergence Model

Steps 5 and 8 use a gap-severity convergence model. For the full specification -- including severity definitions (CRITICAL/IMPORTANT/MINOR), gap ID format (reviewer-prefixed: G-COMP-001, G-ACC-001, G-ACT-001), iteration budgets per complexity level, and stop conditions -- see [`05-review-loops/convergence-criteria.md`](../05-review-loops/convergence-criteria.md).

Summary:

1. **3 fresh reviewers** are spawned in cold isolation at all complexity levels
2. Each reviewer classifies findings by severity (CRITICAL / IMPORTANT / MINOR)
3. Loop continues while any CRITICAL findings exist
4. Loop MAY continue for IMPORTANT findings (configurable)
5. Loop stops when 0 CRITICAL + 0 IMPORTANT, or max iterations reached
6. If max iterations exhausted without convergence: escalate to user

## Vault Routing

All MuninnDB operations follow the two-vault model:

- **Repo vault** (`luca-framework` from `.planning/config.json`): Session context, project identity, metrics, research findings
- **Default vault** (`"default"`): Cross-cutting patterns, pitfalls, preferences, user identity

See [vault-routing.md](../../../../.claude/rules/vault-routing.md) for the complete routing table.

## Complexity Scaling

**All 10 steps run at all complexity levels** (preserving the v1 invariant). No steps are skipped based on complexity alone. For TRIVIAL tasks, researchers use `fast` tier, review loops max at 1 iteration, and graduation still runs (but may graduate 0 engrams). What changes across complexity levels:

- **Model tier** of spawned agents (fast/balanced/capable) -- see [`04-agent-orchestration/`](../04-agent-orchestration/) for routing presets
- **Loop budgets** (iteration caps for review loops) -- see [`05-review-loops/iteration-budgets.md`](../05-review-loops/iteration-budgets.md)
- **Research depth** (number of facets, specialist agents)
- **Discussion depth** (questions per gray area)

See [complexity-gating.md](../../../../.claude/rules/complexity-gating.md) for the full matrix.

## File Conventions

Research files use a **phase-scoped, flat directory** layout (no `deep/` subdirectory). For the canonical specification, see [`02-research-system/research-file-structure.md`](../02-research-system/research-file-structure.md).

- Research brief: `.planning/phases/{NN}-{name}/research/00-brief.md`
- Initial research files: `.planning/phases/{NN}-{name}/research/01-architecture-patterns.md` through `04-*.md`
- Deep expand files: `.planning/phases/{NN}-{name}/research/05-{topic}.md` and up
- Research review log: `.planning/phases/{NN}-{name}/research/REVIEW-LOG.md`
- Graduation report: `.planning/phases/{NN}-{name}/research/GRADUATION-REPORT.md`
- Context file: `.planning/phases/{NN}-{name}/{NN}-CONTEXT.md`
- Pre-mortem file: `.planning/phases/{NN}-{name}/PREMORTEM.md`
- Plan files: `.planning/phases/{NN}-{name}/{NN}-{PP}-PLAN.md`
- Summary files: `.planning/phases/{NN}-{name}/{NN}-{PP}-SUMMARY.md`
- Verification file: `.planning/phases/{NN}-{name}/VERIFICATION.md`
- UAT file: `.planning/phases/{NN}-{name}/{NN}-UAT.md`
