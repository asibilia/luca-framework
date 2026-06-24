# Plan 56-B: repo-audit Skill Definition

## Objective

Create the `repo-audit` skill following the established `createSkill()` factory pattern. This skill provides an interactive and automated mode for running repo structure audits.

## Tasks

### 1. Create skill file

**File:** `src/skills/general/repo-audit.skill.ts`

- Follow the pattern from `code-typecheck.skill.ts` and `phase-execute.skill.ts`
- Use `createSkill()` factory from `~/skills/__helpers/create-skill`
- Define frontmatter with:
  - name: "repo-audit"
  - description: Run repo structure audit to detect naming violations, orphaned files, and convention drift
- Define sections covering:
  - main: Workflow instructions for running the audit
    - Delegate to `lu-repo-architect` agent via Task tool for analysis
    - Run existing scripts: `bun run scripts/check-domain-boundaries.ts` and `bun run check:drift`
    - Parse and display results with severity-coded output
  - modes: Interactive (full report) vs automated (summary + exit code)
  - arguments: Optional flags (--quick for TRIVIAL/SIMPLE, --full for COMPLEX/CRITICAL)

### 2. Register in skill index

**File:** `src/skills/index.ts`

- Add import for `repoAuditSkill`
- Add registry entry: `"repo-audit": () => repoAuditSkill`

## Verification

- TypeScript compiles without errors: `bunx --bun tsc --noEmit`
- Skill creates successfully (no runtime parse errors)
- Build generates output: `bun run build:all`

## References

- Pattern: `src/skills/general/code-typecheck.skill.ts`
- Schema: `src/skills/__schemas/skill.schemas.ts`
- Factory: `src/skills/__helpers/create-skill.ts`
- Registry: `src/skills/index.ts`
