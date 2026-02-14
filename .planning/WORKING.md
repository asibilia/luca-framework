# Working Memory

## Session Info

- **Started**: 2026-02-13
- **Workflow**: /phase-plan 26
- **Phase**: 26 — Compiler Architecture Refactor

## Memory Recall

### Patterns

- **Shared build module for single source of truth** [Phase 22/24]: `build-shared.ts` is the central hub. Phase 24 extended this with `generateAllOutputs()`. All build consumers import from here.
- **Map-based in-memory compilation pipeline** [Phase 24]: `generateAllOutputs()` returns `Map<string, string>`. Consumers iterate for their I/O purpose.
- **Plugin compiler via format delegation** [Phase 19]: PluginCompiler delegates to `toClaudeFormat()` rather than creating new entity methods.
- **Metadata registry for non-class entities** [Phase 11]: hookRegistry uses `HookDefinition` metadata objects, not class constructors.
- **Plan file lists undercount affected consumers** [Phase 24]: Always run full test suite after refactoring to discover unlisted consumers.

### Decisions

- **No-classes rule**: Codebase uses functional patterns exclusively. Factory functions, closures, composition.
- **Bun preference**: Use Bun APIs over node:fs per CLAUDE.md and bun-preference rule.

### Pitfalls

- **Registry entries are class constructors, not instances** [Phase 13]: When checking registry entries, `entry.slug` doesn't work because the registry stores constructors.
- **Pre-existing test failures mask new ones** [testing]: 6 pre-existing failures in executeDoctor/configValidationCheck.
- **Cognition config dual source of truth** [Phase 15]: .agent.ts → build:all → compiled .md. Always rebuild after changes.

### Intuition Flags

- CAUTION: The compiler class hierarchy (BaseCompiler → AgentCompiler, SkillCompiler, RuleCompiler, PluginCompiler) is deeply integrated — registries store class constructors that the compilation pipeline instantiates. Refactoring to factory functions affects registration, instantiation, AND compilation.
- CAUTION: Phase 24's `generateAllOutputs()` in build-shared.ts directly instantiates compilers (`new AgentCompiler()`, etc.). This is a primary consumer that needs migration.
- OPPORTUNITY: hookRegistry already uses the metadata pattern (no classes). The agent/skill/rule registries can follow a similar approach.

## Planning Notes

<!-- Log planning decisions as they're made -->

---

_Session Status_

- [x] Active
- [ ] Learnings extracted
- [ ] Ready to clear
