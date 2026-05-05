# Research Capture — Dependencies

**Subagent**: researcher (returned narration only; supplemented)
**Perspective**: dependencies
**Timestamp**: 2026-05-05

## Findings

### Repo Structure

Bun monorepo, 3 packages:
- `packages/luca-framework` — core framework (vault-setup utilities, project context detection)
- `packages/luca-mastracode` — pipeline/MCP tool implementations (workflowState, writePlanningFile, manageTodos, etc.)
- `packages/luca-studio` — UI

### Tool Ownership

All pipeline tools live in `packages/luca-mastracode/src/tools/`:
- workflowState (workflow-state.ts)
- writePlanningFile (write-planning-file.ts)
- manageTodos (manage-todos.ts)
- manageRoadmap (manage-roadmap.ts)
- pipelineLock (pipeline-lock.ts)
- repoCleanup (repo-cleanup.ts)
- runPostmortem (run-postmortem.ts)
- runRules (run-rules.ts)
- confidenceJournal (confidence-journal.ts)
- checkConvergence (check-convergence.ts)
- claimVerifier (claim-verifier.ts)
- verificationResult (verification-result.ts)

### External Consumers of `.planning/` Paths

1. **Skills** (`.mastracode/skills/`):
   - `gh-prepare/SKILL.md` — may reference PR-BODY.md / PR-DRAFT.md
   - `gh-issue-triage/SKILL.md` — references `.planning/todos/`
   - Need to grep for `.planning/` in skills.
2. **Modes** — instruction `.md` files in `packages/luca-mastracode/src/instructions/` (already inventoried in scope capture)
3. **luca-studio** — likely reads luca-state.json or todos/ for UI display. Need to verify if it reads phase artifacts (CONTEXT.md, PLAN.md, RESEARCH.md).

### Cross-Package Coupling

- `luca-mastracode` imports from `@luca-framework` (suggests vault-setup utilities accessible).
- If `sanitizeVaultName` is re-exported, can be reused; otherwise copy.

### MCP Server / Tool Definitions

Tools registered via `@mastra/core/tools` `createTool({...})`. Inputs defined with zod. Each tool has `id`, `description`, `inputSchema`, `outputSchema`, `execute`.

### Configuration

`.planning/config.json` referenced by:
- triage.md:65 — Muninn vault config
- shadow-scanner.ts:23,41 — shadow_debt config
- finalize.md:50 — Muninn vault config

This is **per-repo config**, separate from `luca-state.json`. **Stays at root** (cross-phase, cross-run).

### Documentation Files (need updating)

- `AGENTS.md` (top-level)
- `CLAUDE.md` (top-level)
- `docs/getting-started.md`
- `docs/troubleshooting.md`
- `packages/luca-mastracode/README.md`
- `packages/luca-mastracode/src/instructions/*.md`

### gitignore Investigation Needed

Need to verify `.gitignore` handling of `.planning/`, runs/, lock files. Likely already gitignored or partially tracked.

### Compatibility / Migration

Existing repos with top-level artifacts:
- Migration command (e.g. `luca archive-loose`) scans top-level `.planning/`, derives slug from latest luca-state.json (or timestamp), moves artifacts.
- Backward compat: code reading `state.currentPhaseSlug ?? undefined` falls back to root paths via `phaseDir()` helper. In-flight runs at upgrade time keep working.

### gh-prepare PR Body Reference Risk

If `gh-prepare` skill quotes a `.planning/POSTMORTEM.md` path in PR body, it must update to `.planning/phases/<slug>/POSTMORTEM.md` or use a placeholder.

### Affected APIs

No external programmatic API to luca pipeline observed — consumers are CLI/Claude-Code-driven. Internal API surface is the tools above.
