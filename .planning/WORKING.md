# Working Memory

## Session Info

Auto-persisted at 2026-02-16T14:42:50Z (context: CRITICAL)

- **Started**: 2026-02-16T16:04:35Z
- **Workflow**: /phase-plan
- **Phase**: 43 — Tech Stack Guideline Profiles

## Memory Recall

- **Patterns**: Bun file/readdir patterns, metadata-driven config, backward-compatible migration
- **Decisions**: None directly relevant
- **Pitfalls**: Dual source of truth between source and compiled files — use build pipeline
- **Procedures**: None matched

## Planning Notes

## Findings

- Plan 43-01 completed: Profile infrastructure, config toggle, and TS rule migration all done
- 8 TS-specific rules moved from general/ to profiles/typescript/ via git mv (history preserved)
- Rule registry now dynamically assembles from general + active profile rules
- Config toggles: `opinionated_guidelines` (master on/off) and `tech_stack_profiles` (array of profile names)
- Build pipeline verified: 19 rules, no drift, 2065 tests pass
- Rule registry test needed updating to scan profiles/ directory (fixed)

## Hypotheses

## Candidate Learnings

- **Pattern**: Profile-based rule organization with config-driven loading works cleanly with the existing build pipeline
- **Decision**: Used `require("fs").readFileSync` in loadProfileConfig() for synchronous config reading at module init time
- **Pitfall**: Rule registry completeness tests hardcoded directory paths — need to be updated when rule organization changes

---

_Session Status_

- [ ] Active
- [ ] Learnings extracted
- [x] Ready to clear
