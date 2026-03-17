# Phase 186 Context — Skill Prefix Templating

## Gray Area 1: Template Directory Rename [researched]

**Decision:** Rename `templates/harness/claude/skills/lu/` to `templates/harness/claude/skills/__branding.commandPrefix__/`. The processFilename() function handles directory path substitution.

## Gray Area 2: SKILL.md Content References [researched]

**Decision:** Template-process `/lu` command references in SKILL.md files to use `<%= branding.commandSlash %>`. Template `Skill(skill: "lu")` references to use `Skill(skill: "<%= branding.commandPrefix %>")`.

## Gray Area 3: Scope of Cross-Skill References [researched]

**Decision:** All 54 skill template SKILL.md files may reference `/lu` or `Skill(skill: "lu")`. All need scanning and templating. The lu skill's own SKILL.md has the most references.

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
