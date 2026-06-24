# Phase 151 Context: Topology Accuracy & Complexity Filter Fix

## Decisions

### 1. Skill Node Placement

**Decision:** Add a 7th "entry" stage container for entry-point skills.

- `lu`, `autopilot`, `debug`, `quick` go in the "entry" stage container (top of graph)
- `phase-discuss`, `phase-plan`, `phase-execute`, `phase-research` go inside their respective pipeline stage containers (discuss, plan, execute)
- `verify` skill goes in the verify stage container
- Spine edge: entry → classify → discuss → plan → execute → verify → learn (with learn → classify loop)

### 2. Complexity Filter Behavior

**Decision:** Tier badge + header color change on agent cards. Never hide agents.

- When complexity level is selected, agent card headers update accent color:
  - fast → gray (#6b7280)
  - balanced → sky (#0ea5e9)
  - capable → amber (#f59e0b)
- Tier badge text changes to match (e.g., "Fast (Haiku)" → "Capable (Opus)")
- No routing preset names on cards — that detail lives in the sidebar
- When no complexity selected (filter cleared), show default model tier from topology data
- All agents remain visible at all complexity levels — containment does not change

### 3. Skill→Agent Edge Rendering

**Decision:** Show all edges. Accuracy over visual cleanliness.

- Use existing "spawns" edge style (dashed cyan, thin, animated)
- Show all skill→agent invocation edges
- If density becomes a problem, add a toggle later — don't pre-optimize

## Scope

### In Scope

- Add 19 missing agents to `workflow-topology.ts` AGENTS[] array
- Add 9 core skill nodes (with node_type: "skill")
- Add "entry" as 7th stage (WorkflowStageSchema, STAGE_COLORS, STAGE_DESCRIPTIONS)
- Add skill→agent spawns edges
- Fix complexity filter: remove agent-hiding, add model tier visualization
- Update container sizing for expanded stages (plan gets ~8 more nodes, verify gets ~6 more)
- Update sidebar to show routing preset in agent detail view
- Update stats bar to reflect accurate totals

### Out of Scope

- workflow.json config extraction (future milestone)
- Editor write-back / bi-directional sync
- Runtime state visualization
- Support skill nodes (git-commit, jira-issue, etc.) — only core pipeline skills

## References

- `docs/workflow-system/topology-audit.md` — full audit with missing agents/skills tables
- `docs/workflow-system/systematization-gaps.md` — gap analysis
- `src/complexity/__helpers/model-routing.ts` — MODEL_ROUTING_TABLE with 7 presets
- `.claude/rules/complexity-gating.md` — authoritative complexity rules
- `.planning/todos/pending/73-*.md` — 3 quick-win todo files
