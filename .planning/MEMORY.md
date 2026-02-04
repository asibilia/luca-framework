# Long-Term Memory

> Persistent learnings across sessions. Selectively recalled based on task context.

## Patterns

### Validated Approaches

<!-- Patterns that worked well — recall when similar tasks arise -->

- **Codebase mapping with parallel agents**: Spawn 4 lu-codebase-mapper agents in parallel (tech, arch, quality, concerns) — produces comprehensive analysis in ~1 minute
- **Questioning before planning**: Deep questioning surfaces hidden requirements and constraints before committing to implementation

### Established Conventions

<!-- Conventions to maintain consistency -->

(None yet — will accumulate during development)

## Decisions

### Architectural Choices

<!-- Past decisions with rationale — recall to avoid re-debating -->

| Decision | Context | Rationale | Date |
|----------|---------|-----------|------|
| CLI installer over npm | Distribution model | Better UX for setup wizard, can prompt for config | 2026-02-04 |
| Branded skin over rebrand | Customization approach | Cursor file name limitations, enables upgradability | 2026-02-04 |
| React+TS template only v1 | Stack templates | Ship one excellent template, prove pattern | 2026-02-04 |

### Trade-offs Made

<!-- Explicit trade-offs — recall when similar decisions arise -->

(None yet — will accumulate during development)

## Pitfalls

### Known Issues

<!-- Problems encountered — recall to prevent repetition -->

- **Hardcoded paths break packageability**: Found 10+ locations with hardcoded PT-/ENG- prefixes, company references, absolute paths — all need abstraction

### Anti-patterns

<!-- What NOT to do — recall when approaching similar areas -->

(None yet — will accumulate during development)

## Preferences

### User Preferences

<!-- Learned from feedback — recall for consistency -->

(None yet — will accumulate during development)

### Project Preferences

<!-- Project-specific patterns — recall for consistency -->

- **Enterprise focus**: Prioritize compliance, security, configurability over convenience
- **Notify don't auto-update**: Teams control when they update framework

---

*Entries added by: lu-learner*
*Last curated: 2026-02-04*
