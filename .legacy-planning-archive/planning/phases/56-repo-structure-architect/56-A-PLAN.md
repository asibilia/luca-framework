# Plan 56-A: lu-repo-architect Agent Definition

## Objective

Create the `lu-repo-architect` agent following the established `createAgent()` factory pattern. This agent audits repository structure, enforces conventions, and reports health metrics.

## Tasks

### 1. Create agent file

**File:** `src/agents/general/lu-repo-architect.agent.ts`

- Follow the pattern from `security-auditor.agent.ts` and `lu-router.agent.ts`
- Use `createAgent()` factory from `~/agents/__helpers/create-agent`
- Define frontmatter with:
  - name: "lu-repo-architect"
  - description: Audits repo structure, enforces conventions, reports health metrics
  - tools: ["Read", "Glob", "Grep", "Bash"]
  - cognition: { default_tier: "T1", promotable_to: "T2", memory_tags: ["architecture", "repo-structure", "conventions"] }
  - context: { default_tier: "T1", promotable_to: "T2", isolation: "none" }
- Define sections covering:
  - role: Repo structure architect that audits and enforces conventions
  - audit_checks: List of specific checks (naming, directory structure, imports, orphaned files, empty dirs, package.json health)
  - output_format: Structured health report format with severity levels
  - complexity_gating: How audit depth varies by complexity level

### 2. Register in agent index

**File:** `src/agents/index.ts`

- Add import for `luRepoArchitectAgent`
- Add registry entry: `"lu-repo-architect": () => luRepoArchitectAgent`

## Verification

- TypeScript compiles without errors: `bunx --bun tsc --noEmit`
- Agent creates successfully (no runtime parse errors)
- Build generates output: `bun run build:all`

## References

- Pattern: `src/agents/general/security-auditor.agent.ts`
- Schema: `src/agents/__schemas/agent.schemas.ts`
- Factory: `src/agents/__helpers/create-agent.ts`
- Registry: `src/agents/index.ts`
