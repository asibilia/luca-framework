# Plan 61-A: Pi Format Functions, Compiler Pipeline Integration, AGENTS.md Generation

## Objective

Add Pi as a fourth compilation target in the Luca Framework build pipeline, generating `.pi/` output directory with agents, skills, merged AGENTS.md, and settings.json.

## Context

- Pi uses YAML frontmatter + H2-section markdown (like Claude format with frontmatter)
- Pi has no rules directory — all rules merge into a single AGENTS.md
- Pi agents support tool restrictions and model tier in frontmatter
- Pi skills use .pi/skills/{name}/SKILL.md with frontmatter

## Tasks

### Wave 1 — Type & Format Foundation

1. **format.ts**: Add `toPiFormat()` shared formatting function
2. **agent.schemas.ts**: Add `toPiFormat()` to BaseAgent type
3. **skill.schemas.ts**: Add `toPiFormat()` to BaseSkill type
4. **rule.schemas.ts**: Add `toPiFormat()` to BaseRule type
5. **create-agent.ts**: Implement `toPiFormat()` in factory
6. **create-skill.ts**: Implement `toPiFormat()` in factory
7. **create-rule.ts**: Implement `toPiFormat()` in factory

### Wave 2 — Compiler Pipeline

8. **compile.ts**: Add "PI" to SupportedFormat, add compilePi functions
9. **compile.ts**: Add format-dispatching for PI case

### Wave 3 — Build Integration

10. **build-shared.ts**: Add `generatePiOutputs()` with AGENTS.md merging
11. **build-shared.ts**: Add Pi settings.json generation
12. **build-shared.ts**: Call generatePiOutputs() from generateAllOutputs()
13. **build-all.ts**: Add .pi/ directory handling (ensureDir, cleanDirectory)
14. **build-all.ts**: Update build summary for Pi counts

### Wave 4 — Tests

15. **pi-compiler.test.ts**: Test compilePi functions
16. **build-output.test.ts**: Update for .pi/ directory validation
17. **check-drift.test.ts**: Update for Pi output freshness

## Success Criteria

- `bun run build:all` generates .pi/ with agents, skills, AGENTS.md, settings.json
- `bun test` passes with new Pi compiler tests
- AGENTS.md contains all merged rules with section headers
- Agent .md files include tool restrictions and model tier
