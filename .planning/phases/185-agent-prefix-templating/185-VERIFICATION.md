---
phase: 185
plan: 1
type: feature
verified: 2026-03-17T18:30:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 185 Verification: Agent Prefix Templating

**Phase Goal:** Make agent template filenames and content use the configurable branding prefix instead of hardcoded `lu-`, so that `luca init` with custom branding (e.g., `commandPrefix: 'ai'`) produces agent files like `ai-router.md` instead of `lu-router.md`.

**Verified:** 2026-03-17
**Status:** PASSED
**Verification Mode:** Standard

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                             | Status     | Evidence                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | All 29 previously `lu-*` prefixed agent templates are renamed to use `__branding.commandPrefix__-*.md` pattern    | ✓ VERIFIED | 29 files found with `__branding.commandPrefix__-` prefix; 0 `lu-*.md` files found in agents directory                                                           |
| 2   | All YAML `name:` fields in the 29 renamed templates use EJS substitution (`<%= branding.commandPrefix %>-{name}`) | ✓ VERIFIED | All 29 renamed files contain `name: <%= branding.commandPrefix %>-{agentname}` in frontmatter                                                                   |
| 3   | All prose/heading references to `lu-{agent}` use EJS substitution (`<%= branding.commandPrefix %>-{agent}`)       | ✓ VERIFIED | Spot checks show `<%= branding.commandPrefix %>-router`, `<%= branding.commandPrefix %>-cognition`, etc. in content; zero hardcoded agent name references found |
| 4   | All `/lu` slash command references use EJS substitution (`<%= branding.commandSlash %>`)                          | ✓ VERIFIED | Files contain `<%= branding.commandSlash %>` where `/lu` command was previously hardcoded                                                                       |
| 5   | The 10 non-prefixed agents retain original filenames and are updated with cross-references                        | ✓ VERIFIED | code-architect.md, code-developer.md, etc. exist; contain EJS-templated references to lu-\* agents                                                              |

**Score:** 5/5 truths verified

## Required Artifacts

| Artifact                          | Expected                                     | Status        | Details                                                                                                 |
| --------------------------------- | -------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| 29 renamed agent template files   | `__branding.commandPrefix__-*.md` pattern    | ✓ EXISTS      | All 29 files present in `packages/luca-framework/templates/harness/claude/agents/`                      |
| YAML frontmatter in renamed files | `name: <%= branding.commandPrefix %>-{name}` | ✓ SUBSTANTIVE | 29/29 files contain EJS-templated name fields                                                           |
| Content references                | EJS substitutions throughout                 | ✓ WIRED       | Agent name references properly templated; file path references (lu-router.agent.ts) correctly preserved |
| .gitignore update                 | Agents directory tracked as source           | ✓ EXISTS      | .gitignore lines 9-13 show agents NOT in gitignore; hooks/rules/skills still gitignored                 |
| TypeScript compilation            | No new errors                                | ✓ PASSES      | `bunx --bun tsc --noEmit` shows only 4 pre-existing errors in dist/plugin/scripts (unrelated)           |

## Key Link Verification

| From              | To                 | Via                                  | Status  | Details                                                                       |
| ----------------- | ------------------ | ------------------------------------ | ------- | ----------------------------------------------------------------------------- |
| Template filename | EJS processor      | `__branding.commandPrefix__` pattern | ✓ WIRED | `processFilename()` in template.ts already supports placeholder patterns      |
| Template content  | EJS processor      | `<%= %>` syntax                      | ✓ WIRED | `processTemplate()` already processes EJS in .md files                        |
| Branding context  | Template variables | `createBrandingContext()`            | ✓ WIRED | `commandPrefix` and `commandSlash` computed and available in template context |
| Default branding  | Custom branding    | Validation schema                    | ✓ WIRED | Field validation and merging logic confirmed in branding.ts                   |

## Anti-Patterns Found

No blockers or warnings identified:

- No hardcoded `lu-` agent name references in content (0 found)
- No TODO/FIXME comments indicating incomplete work
- No file path references to `.agent.ts` files incorrectly templated
- All EJS syntax correct and consistent

## Special Verifications

### Branding Context Availability

Checked that computed properties are available to templates:

```
createBrandingContext() provides:
  - branding.commandPrefix (from config, e.g., 'lu' or 'ai')
  - branding.commandSlash (computed: `/${commandPrefix}`, e.g., `/lu` or `/ai`)
  - branding.frameworkName, ticketPattern, etc.
```

✓ All properties required for templating are present and computed correctly.

### File Path Reference Handling

Verified that documentation references to source code are properly excluded from templating:

- `lu-router.agent.ts` — preserved as literal (documentation of source structure)
- `packages/luca-framework/` — preserved as literal (documentation of monorepo)
- `src/agents/luca/` — preserved as literal (documentation of source structure)

✓ File path references are correctly distinguished from deployed agent names.

### .gitignore Configuration

Verified that template sources are now tracked:

```
Hooks, rules, skills: gitignored (compiled output)
Agents: NOT gitignored (now EJS source files with branding)
```

✓ Agents are tracked as source; other templates remain gitignored.

## Goal Achievement Summary

Phase goal achieved: Agent templates now use configurable branding prefix.

**Before (hardcoded):**

- Template filename: `lu-router.md`
- YAML name: `name: lu-router`
- Content reference: `spawned by lu-executor`
- Command reference: `/lu`

**After (templated):**

- Template filename: `__branding.commandPrefix__-router.md`
- YAML name: `name: <%= branding.commandPrefix %>-router`
- Content reference: `spawned by <%= branding.commandPrefix %>-executor`
- Command reference: `<%= branding.commandSlash %>`

When `luca init` runs with:

- `commandPrefix: 'lu'` (default) → produces `lu-router.md`, name field renders as `lu-router`
- `commandPrefix: 'ai'` (custom) → produces `ai-router.md`, name field renders as `ai-router`

✓ REQ-08 satisfied: Agent template filenames use configurable branding prefix.

## Notes

- No TypeScript changes were needed (template engine already supports this)
- No changes to branding.ts or template.ts (existing functions are sufficient)
- The only code change was the .gitignore update to track agent templates as source files
- All 29 file renamings, 29 YAML updates, and content templating completed in 3 focused commits

---

_Verified: 2026-03-17T18:30:00Z_
_Verifier: Claude (lu-verifier)_
_Verification Mode: Standard (quick + substantive checks)_
