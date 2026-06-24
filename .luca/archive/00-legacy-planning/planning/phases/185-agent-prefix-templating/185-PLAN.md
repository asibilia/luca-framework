---
phase: 185
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 185 Plan 1: Agent Prefix Templating

## Objective

Make agent template filenames and content use the configurable branding prefix instead of hardcoded `lu-`, so that `luca init` with custom branding (e.g., `commandPrefix: 'ai'`) produces agent files like `ai-router.md` instead of `lu-router.md`.

No code changes are needed to the template engine -- `processFilename()` already supports `__branding.commandPrefix__` patterns and `processTemplate()` already processes EJS in `.md` files. This phase is purely template file updates.

## Context

@packages/luca-framework/templates/harness/claude/agents/ (all 39 agent templates)
@packages/luca-framework/src/utils/template.ts (processFilename, processTemplate -- NO CHANGES)
@packages/luca-framework/src/utils/branding.ts (defaultBranding, createBrandingContext -- NO CHANGES)

## Tasks

### Wave 1: Rename files and update content

#### 1. Rename 29 lu-prefixed agent template files

**Type:** auto
**TDD:** false
**Depends on:** none

Rename all 29 `lu-*.md` agent template files to use `__branding.commandPrefix__-*.md` pattern. The `processFilename()` function in template.ts resolves `__branding.commandPrefix__` from the context object created by `createBrandingContext()`.

**Files to rename (all in `packages/luca-framework/templates/harness/claude/agents/`):**

| Current filename           | New filename                                           |
| -------------------------- | ------------------------------------------------------ |
| lu-codebase-mapper.md      | \_\_branding.commandPrefix\_\_-codebase-mapper.md      |
| lu-cognition.md            | \_\_branding.commandPrefix\_\_-cognition.md            |
| lu-debugger.md             | \_\_branding.commandPrefix\_\_-debugger.md             |
| lu-discuss-researcher.md   | \_\_branding.commandPrefix\_\_-discuss-researcher.md   |
| lu-executor-capable.md     | \_\_branding.commandPrefix\_\_-executor-capable.md     |
| lu-executor.md             | \_\_branding.commandPrefix\_\_-executor.md             |
| lu-integration-checker.md  | \_\_branding.commandPrefix\_\_-integration-checker.md  |
| lu-learner.md              | \_\_branding.commandPrefix\_\_-learner.md              |
| lu-phase-researcher.md     | \_\_branding.commandPrefix\_\_-phase-researcher.md     |
| lu-plan-checker.md         | \_\_branding.commandPrefix\_\_-plan-checker.md         |
| lu-planner.md              | \_\_branding.commandPrefix\_\_-planner.md              |
| lu-pm-planner.md           | \_\_branding.commandPrefix\_\_-pm-planner.md           |
| lu-pr-reviewer.md          | \_\_branding.commandPrefix\_\_-pr-reviewer.md          |
| lu-premortem.md            | \_\_branding.commandPrefix\_\_-premortem.md            |
| lu-process-data.md         | \_\_branding.commandPrefix\_\_-process-data.md         |
| lu-project-researcher.md   | \_\_branding.commandPrefix\_\_-project-researcher.md   |
| lu-repo-architect.md       | \_\_branding.commandPrefix\_\_-repo-architect.md       |
| lu-research-synthesizer.md | \_\_branding.commandPrefix\_\_-research-synthesizer.md |
| lu-roadmap-architect.md    | \_\_branding.commandPrefix\_\_-roadmap-architect.md    |
| lu-roadmap-prioritizer.md  | \_\_branding.commandPrefix\_\_-roadmap-prioritizer.md  |
| lu-roadmap-qa.md           | \_\_branding.commandPrefix\_\_-roadmap-qa.md           |
| lu-roadmap-synthesizer.md  | \_\_branding.commandPrefix\_\_-roadmap-synthesizer.md  |
| lu-roadmapper.md           | \_\_branding.commandPrefix\_\_-roadmapper.md           |
| lu-router-fast.md          | \_\_branding.commandPrefix\_\_-router-fast.md          |
| lu-router.md               | \_\_branding.commandPrefix\_\_-router.md               |
| lu-shadow-scanner.md       | \_\_branding.commandPrefix\_\_-shadow-scanner.md       |
| lu-test-writer.md          | \_\_branding.commandPrefix\_\_-test-writer.md          |
| lu-verifier-fast.md        | \_\_branding.commandPrefix\_\_-verifier-fast.md        |
| lu-verifier.md             | \_\_branding.commandPrefix\_\_-verifier.md             |

Use `git mv` to preserve file history.

**Verification:**

- No `lu-*.md` files remain in the agents directory (only the 10 non-prefixed agents remain)
- All 29 files now start with `__branding.commandPrefix__-`

#### 2. Update YAML frontmatter `name:` field in all 29 renamed templates

**Type:** auto
**TDD:** false
**Depends on:** 1

In each renamed template, replace the hardcoded `name:` field with EJS substitution.

Example transformation:

```yaml
# Before
name: lu-router

# After
name: <%= branding.commandPrefix %>-router
```

Apply this to all 29 renamed files. The `name:` field is inside the file content, so it goes through `processTemplate()` (EJS), not `processFilename()`.

**Verification:**

- Every renamed template's YAML frontmatter `name:` field uses `<%= branding.commandPrefix %>-{agent-name}`
- No hardcoded `lu-` remains in any `name:` field of the 29 renamed templates

#### 3. Update content references to lu-prefixed agent names in all 39 templates

**Type:** auto
**TDD:** false
**Depends on:** 1

Replace hardcoded `lu-` agent name references in template body content with EJS `<%= branding.commandPrefix %>-` substitution. This applies to both:

- The 29 renamed templates (self-references and cross-references)
- The 10 non-prefixed templates that reference lu-\* agents (code-architect.md, dx-advocate.md)

**Scope of content replacements:**

- Agent name references in prose (e.g., "lu-cognition" becomes `<%= branding.commandPrefix %>-cognition`)
- Markdown headings using the agent name (e.g., `# lu-router` becomes `# <%= branding.commandPrefix %>-router`)
- References to other lu-agents (e.g., "spawned by lu-executor" becomes `spawned by <%= branding.commandPrefix %>-executor`)
- Slash-command references like `/lu` should use `<%= branding.commandSlash %>` (this computed property is already available in the template context from `createBrandingContext()`)

**Exclusions -- do NOT template these:**

- Code examples referencing `lu-router.agent.ts` as file naming conventions (these are documentation about the source code structure, not deployed agent names)
- Any literal reference to the "Luca" framework name itself (use `<%= branding.frameworkName %>` only where the brand name is being referenced as a name, not as a proper noun in documentation)

**Verification:**

- `grep -r 'lu-' *.md` in the agents directory returns only: (a) documentation-example file paths like `lu-router.agent.ts`, and (b) the 10 non-prefixed agent filenames themselves
- No remaining hardcoded `lu-` agent name references in prose, headings, or frontmatter

### Wave 2: Verify

#### 4. Type-check and validate

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Run `bunx --bun tsc --noEmit` to confirm no TypeScript errors were introduced. Since this phase only touches `.md` template files (no `.ts` changes), this is a sanity check that no imports or references were broken.

**Verification:**

- `bunx --bun tsc --noEmit` exits cleanly with no errors

## Verification

1. All 29 previously `lu-*` prefixed agent templates are now named `__branding.commandPrefix__-*.md`
2. All YAML `name:` fields in the 29 renamed templates use EJS substitution
3. All prose/heading references to `lu-{agent}` use EJS substitution
4. The 10 non-prefixed agents still have their original filenames
5. Type-check passes cleanly
6. No template engine code was modified (template.ts and branding.ts remain unchanged)

## Success Criteria

- Running `luca init` with default branding (`commandPrefix: 'lu'`) produces the same agent filenames as before: `lu-router.md`, `lu-cognition.md`, etc.
- Running `luca init` with custom branding (`commandPrefix: 'ai'`) produces correctly prefixed agent files: `ai-router.md`, `ai-cognition.md`, etc.
- Agent file content (name field, prose references) reflects the configured prefix in both scenarios.

## Output Specification

- 29 renamed agent template files using `__branding.commandPrefix__-*.md` pattern
- 39 agent template files with EJS-substituted content (29 renamed + up to 10 non-prefixed with updated cross-references)
- REQ-08 satisfied
