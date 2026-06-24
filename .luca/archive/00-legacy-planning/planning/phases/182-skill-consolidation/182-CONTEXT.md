# Phase 182 — Skill Consolidation: Context

## Decisions

### 1. Config key stays 'autopilot' [researched]

Keep the `autopilot` key in `.planning/config.json` as-is. Renaming to 'lu' would break existing configs across all repos using Luca. The lu skill reads `config.autopilot.*` settings — the key name is an implementation detail, not a user-facing API. Add a code comment noting the config section name.

### 2. Merge strategy: absorb sections, preserve routing [researched]

lu.skill.ts currently has 3 sections: main, sub-agent_delegation_requirements, process. After merge it will have ~14+ sections (all of autopilot's sections absorbed). The existing lu routing logic (Step 4) gets updated: instead of routing TO autopilot, the autopilot loop runs inline. All other routes stay (PR → pr-address, bug → debug, quick for trivial ad-hoc).

Structure of merged file:

- Section 1 (main): Updated header with combined description and full flag set
- Section 2 (sub-agent delegation): Merged sub-agent lists from both skills
- Section 3 (process): Updated routing — autopilot behavior is now the DEFAULT for phase/milestone work
- Sections 4-14+: All autopilot sections (configuration, backlog_scan, roadmap_revision, execution_order, phase_loop, milestone_gate, cross_milestone, oversight_gates, failure_handling, summary) absorbed verbatim

### 3. Default behavior: full-auto [researched]

When user runs `/lu <task>`, the default behavior for phase/milestone work is now full-auto autopilot (backlog scan → roadmap revision → multi-phase execution). The `--ask` flag provides a quick way to switch to `--oversight=phase` for human-in-the-loop control.

### 4. Combined flag set [researched]

From lu: `--complexity`, `--force-complex`, `--skip-memory`, `--skip-branch`
From autopilot: `--oversight`, `--skip-backlog`, `--max-phases=N`, `--no-swarm`, `--dry-run`
New: `--ask` (alias for `--oversight=phase`)

### 5. Reference update strategy [researched]

9 files with 51 'autopilot' references need updating:

- `src/skills/luca/lu.skill.ts` — 4 refs (routing to autopilot, removed)
- `src/skills/general/autopilot.skill.ts` — 33 refs (file deleted)
- `src/skills/__helpers/build-skill-registry.ts` — 2 refs (remove autopilot import + registration)
- `src/skills/__helpers/scaffolding.ts` — 2 refs (remove from known skills list)
- `src/skills/general/phase-discuss.skill.ts` — 1 ref (update mention)
- `src/agents/general/lu-roadmap-architect.agent.ts` — 1 ref (update docstring)
- `src/agents/general/lu-roadmap-prioritizer.agent.ts` — 1 ref (update docstring)
- `src/agents/general/lu-roadmap-qa.agent.ts` — 1 ref (update docstring)
- `src/agents/general/lu-roadmap-synthesizer.agent.ts` — 6 refs (update docstrings)

Post-merge: run `grep -r 'autopilot' src/ .claude/rules/` to verify zero remaining references.

### 6. lu-workflow.md rule update [researched]

The .claude/rules/lu-workflow.md rule references autopilot as a separate concept. Update to describe lu as the unified entry point. Remove mentions of "autopilot skill" as a separate entity.

### 7. lu.skill.ts stays in src/skills/luca/ [researched]

The merged skill stays at `src/skills/luca/lu.skill.ts` (its current location). autopilot was in `src/skills/general/` — after deletion, no file remains there for this functionality.

## Scope Boundaries

- IN: Absorb all autopilot sections into lu.skill.ts
- IN: Delete autopilot.skill.ts
- IN: Update all 9 files with autopilot references
- IN: Update skill registry
- IN: Update lu-workflow.md rule
- IN: Post-merge grep verification
- OUT: Renaming config.json 'autopilot' key (keep as-is)
- OUT: Refactoring the merged file for size (accept ~1500 lines)
- OUT: Adding new capabilities beyond what both skills already have
