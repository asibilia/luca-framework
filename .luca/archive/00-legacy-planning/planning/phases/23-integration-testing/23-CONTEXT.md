# Phase 23 Context — Integration Testing

## Decisions

### 1. Spec-First, No Duplication

Phase 23 tests validate against the **official Claude Code plugin specification** only. Existing drift tests in `scripts/check-drift.test.ts` already cover:

- File existence for all agents, skills, hooks
- Byte-for-byte content parity between compiler output and committed files
- Orphan detection in all output directories
- plugin.json and marketplace.json content matching
- Registry completeness (every source file has a registry entry)

**Phase 23 does NOT re-test any of the above.** Instead, it adds a new validation layer:

- Does the plugin structure conform to the Claude Code plugin spec?
- Are plugin.json fields valid per the spec schema?
- Are hooks.json event types recognized by Claude Code?
- Do SKILL.md files have the required frontmatter?
- Does the marketplace manifest have all required fields?

### 2. Static Validation Only (No Runtime CLI)

TEST-05 (end-to-end plugin loading) is satisfied by comprehensive static spec-conformance checks rather than invoking `claude --plugin-dir`. Rationale:

- Claude Code CLI may not be installed in all environments (CI, other devs)
- No `claude validate-plugin` command exists
- Runtime loading tests are fragile and environment-dependent
- If static checks pass against the spec, loading will succeed

### 3. Structural + Schema Validation Depth

Validation targets:

| What                | Validation                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Directory structure | Required dirs exist: `.claude-plugin/`, `agents/`, `skills/`, `hooks/`, `scripts/`                             |
| plugin.json         | Matches spec schema: `name` (kebab-case, required), optional metadata fields, NO component arrays              |
| marketplace.json    | Has `name`, `owner` (required), `plugins[]` with `name` and `source`                                           |
| hooks.json          | Event types are valid Claude Code events (`PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentTool`) |
| SKILL.md files      | Have `description` frontmatter (YAML block at top)                                                             |
| Agent .md files     | Exist and contain markdown content                                                                             |

Not validating: every possible frontmatter field name, hook timeout ranges, field ordering.

## Plan Mapping

| Plan  | Focus                           | What's New (not in drift tests)                                                                                 |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 23-01 | Structure + manifest validation | Spec-schema validation for plugin.json and marketplace.json                                                     |
| 23-02 | Hook paths + compilation parity | `${CLAUDE_PLUGIN_ROOT}` presence in hook scripts, hooks.json event type validation, SKILL.md frontmatter checks |
| 23-03 | E2E loading (static)            | Comprehensive spec-conformance suite that validates everything Claude Code would check during loading           |

## Requirement Coverage

| Requirement           | Covered By | How                                                                      |
| --------------------- | ---------- | ------------------------------------------------------------------------ |
| TEST-01 (structure)   | 23-01      | Validate required directories and files against spec                     |
| TEST-02 (manifest)    | 23-01      | Validate plugin.json and marketplace.json against spec schemas           |
| TEST-03 (hook paths)  | 23-02      | Verify `${CLAUDE_PLUGIN_ROOT}` in all hook scripts, validate event types |
| TEST-04 (parity)      | 23-02      | Verify SKILL.md frontmatter, agent format                                |
| TEST-05 (E2E loading) | 23-03      | Static spec-conformance suite replaces runtime loading test              |

## Deferred Ideas

(None — scope is well-defined)

---

_Context gathered: 2026-02-12_
