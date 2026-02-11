# Working Memory

## Session Info

- **Started**: 2026-02-11
- **Workflow**: /lu-plan-phase 16
- **Phase**: 16
- **Complexity**: COMPLEX

## Memory Recall

- **Patterns loaded**: 4-tier cognition profiling (T0-T3), tag-based selective recall, metadata-driven config, N-level to M-tier compression, self-gating agents via always-apply rules, metadata registry for non-class entities
- **Decisions recalled**: 4-tier cognition system (T0-T3), YAML frontmatter for compiled agents, soft enforcement via self-gating rules, module pattern consistency (types.ts + defaults.ts + index.ts)
- **Pitfalls flagged**: Context bloat from aggressive recall, cognition config dual source of truth (.agent.ts AND compiled .md), executor modifying orchestrator-owned files, research data requires independent verification (12% error rate)

## Intuition Flags

| Flag                                                | Type        | Reason                                                                                              |
| --------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| Phase 15 tier system is natural extension point     | OPPORTUNITY | T0-T3 already exists; adding context dimension follows same pattern                                 |
| Module pattern from Phase 13 applies                | OPPORTUNITY | src/context/ follows src/harness/, src/complexity/ structure (types.ts + defaults.ts + index.ts)    |
| Dual source of truth risk repeats                   | CAUTION     | Context config in .agent.ts + compiled .md, same as cognition config — must build:all after changes |
| Independent promotion adds complexity               | CAUTION     | Two promotion tracks (cognitive + context) means more matrix entries. Keep documentation clear      |
| Zod schema for result envelope validates at runtime | OPPORTUNITY | Universal envelope + fallback-to-raw is resilient. Follows schema-first-parsing rule                |

## Planning Notes

### Context Decisions (from 16-CONTEXT.md)

1. Additive tier-mapped profiles for task context (T0: plan only → T3: everything)
2. Independent promotion tracks — context promotes one level more aggressively than cognitive
3. Output reservation is advisory (documented best practice, not enforced)
4. Universal result envelope as Zod schema with fallback-to-raw
5. Conflict resolution: keep all findings, tag with source agent
6. Writer/reviewer isolation: cold (reviewers) + warm (verifier, no WORKING.md)
7. Context assembly functions in src/context/ module, build-time compilation
8. Clean separation: agents = instructions (HOW), orchestrator = context (WHAT)

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
