# Skill Rename Plan

Corrective renames to align skill names with established namespace conventions. Each rename resolves a specific inconsistency identified during the skill naming audit.

## Renames

### 1. `git-pr` -> `pr-create`

**Rationale:** The `pr-*` family (7 skills) covers the full PR lifecycle: fetch, address, respond, validate, debate, fix, learn. PR creation is the missing first step. The `git-*` prefix should be reserved for git operations (commit, branch), not GitHub PR workflows.

**Files to change:**

- `src/skills/general/git-pr.skill.ts` -> `src/skills/general/pr-create.skill.ts`
- Config: `name: "git-pr"` -> `name: "pr-create"`
- Export: `gitPrSkill` / `gitPrConfig` -> `prCreateSkill` / `prCreateConfig`
- Registry: `src/skills/__helpers/build-skill-registry.ts`
- Cross-references: `lu.skill.ts`, `lu-phase-loop.skill.ts`, `lu-route.skill.ts`
- Dependency map: `src/skills/__helpers/default-dependency-map.ts`
- Validation order: `src/skills/__helpers/validate-skill-order.ts`
- Scaffolding: `src/skills/__helpers/scaffolding.ts`
- Workflow contracts: `src/workflow/__schemas/contracts.schemas.ts`
- Phase pipeline: `src/workflow/__helpers/phase-pipeline.ts`
- DAG visualizer: `src/workflow/__helpers/dag-visualizer.ts`
- Shadow scanner agent: `src/agents/general/lu-shadow-scanner.agent.ts`
- Rules mentioning skill name: `hook-skill-boundary.rule.ts`, `domain-architecture.rule.ts`

### 2. `git-feature` -> `git-branch`

**Rationale:** Within the `git-*` family, `git-commit` names the action (commit). `git-feature` names the use case (feature), not the action (branch). Renaming to `git-branch` makes the `git-*` family consistently action-oriented.

**Files to change:**

- `src/skills/general/git-feature.skill.ts` -> `src/skills/general/git-branch.skill.ts`
- Config: `name: "git-feature"` -> `name: "git-branch"`
- Export: `gitFeatureSkill` / `gitFeatureConfig` -> `gitBranchSkill` / `gitBranchConfig`
- Same cross-reference locations as above (registry, dependency map, etc.)

### 3. `config-profile` -> `config-model`

**Rationale:** This skill switches the model delegation profile (quality/balanced/budget). The name `config-profile` creates confusion with `profile-export` and `profile-import`, which handle memory profiles. `config-model` makes the distinction unambiguous.

**Files to change:**

- `src/skills/general/config-profile.skill.ts` -> `src/skills/general/config-model.skill.ts`
- Config: `name: "config-profile"` -> `name: "config-model"`
- Export: `configProfileSkill` / `configProfileConfig` -> `configModelSkill` / `configModelConfig`
- Registry and cross-references

### 4. `test-run` -> `code-test`

**Rationale:** `code-lint` and `code-typecheck` form a `code-*` quality check family. `test-run` performs the same category of work (code quality verification) but uses a different prefix. `code-test` completes the family.

**Files to change:**

- `src/skills/general/test-run.skill.ts` -> `src/skills/general/code-test.skill.ts`
- Config: `name: "test-run"` -> `name: "code-test"`
- Export: `testRunSkill` / `testRunConfig` -> `codeTestSkill` / `codeTestConfig`
- Registry and cross-references

### 5. `jira-issue` -> `jira-import`

**Rationale:** The skill imports a Jira ticket as a GitHub issue with labels and cross-references. "issue" is ambiguous (create? view? manage?), while "import" describes the actual action. This also follows the action-oriented naming pattern used by `git-commit`, `git-branch`, `pr-create`, etc.

**Files to change:**

- `src/skills/general/jira-issue.skill.ts` -> `src/skills/general/jira-import.skill.ts`
- Config: `name: "jira-issue"` -> `name: "jira-import"`
- Export: `jiraIssueSkill` / `jiraIssueConfig` -> `jiraImportSkill` / `jiraImportConfig`
- Registry and cross-references
- Rule: `atlassian-mcp.md` references `/jira-issue`

## Migration Checklist (Per Rename)

Each rename requires these steps in order:

1. **Rename the source file** using `git mv` to preserve history
2. **Update the skill config** (`name`, description if needed)
3. **Update the TypeScript export names** (skill const and config const)
4. **Update the barrel** (`src/skills/general/index.ts` or wherever re-exported)
5. **Update the registry** (`build-skill-registry.ts`)
6. **Update the dependency map** (`default-dependency-map.ts`)
7. **Update the validation order** (`validate-skill-order.ts`)
8. **Update workflow references** (contracts, pipeline, DAG visualizer)
9. **Update all skill cross-references** (other skills that invoke or reference this skill)
10. **Update agent references** (agents that reference the skill name)
11. **Update rule references** (rules that mention the skill name)
12. **Update documentation** (docs/, CLAUDE.md rules mentioning the skill)
13. **Run `bunx --bun tsc --noEmit`** to verify no broken imports
14. **Run `bun run build:all`** (outside Claude Code session) to regenerate outputs
15. **Run `bun run check:drift`** to verify generated output matches source

## Execution Strategy

These renames are independent and can be done in any order. Recommended approach:

- Execute all 5 renames in a single phase to minimize churn
- One commit per rename for clean `git log` attribution
- Final commit after `build:all` to capture generated output changes

## Risk Assessment

- **Low risk**: These are name-only changes with no behavioral modifications
- **Breaking**: Any external scripts or user muscle-memory using `/git-pr`, `/git-feature`, `/config-profile`, `/test-run`, or `/jira-issue` will need to update
- **Mitigation**: Document old -> new mapping in changelog; consider temporary aliases if adoption friction is high
