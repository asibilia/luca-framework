# Phase 185 Context — Agent Prefix Templating

## Gray Area 1: Filename Substitution Pattern [researched]

**Question:** What pattern to use for dynamic filenames?

**Decision:** Use the existing `__commandPrefix__` pattern supported by `processFilename()` in template.ts. Rename `lu-router.md` → `__commandPrefix__-router.md`. This is already built and tested.

## Gray Area 2: Content Substitution Pattern [researched]

**Question:** How to replace hardcoded `lu-` references in template content?

**Decision:** Use EJS `<%= branding.commandPrefix %>` tags. The `.md` extension is already in `TEMPLATE_EXTENSIONS`, so EJS processing is automatic via `processTemplate()`.

**Scope:** Replace agent name references like "lu-cognition", "lu-executor" in template prose. YAML frontmatter `name:` field should NOT use EJS — it goes through `processFilename()` instead, but since it's content inside the file it needs EJS: `name: <%= branding.commandPrefix %>-router`.

## Gray Area 3: Which Files to Update [researched]

**Decision:** 29 agent template files in `packages/luca-framework/templates/harness/claude/agents/` that have `lu-` prefix. The 10 non-prefixed agents (code-architect, dx-advocate, etc.) need no filename change but may need content updates where they reference `lu-*` agents.

## Deferred Ideas

None — straightforward mechanical substitution.

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
