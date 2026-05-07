---
'@alecsibilia/luca-mastracode': minor
---

**Phase C: PR/Release/Commit Conventions Consult Preferences**

Replace luca-framework-specific PR/release/commit conventions hardcoded across rules, skills, and instruction files with `projectPreferences.consult-section()` calls. Extend `ProjectPreferencesSchema` additively with 9 new optional fields for PR templates, commit conventions, and tracker link formats.

### Deliverables

- Schema extension with 9 new optional fields for PR, commits, and tracker sections
- Mode registration — plan stock mode now registered with consult/consult-section actions
- Seeded preferences — .planning/preferences.json committed with canonical Zod-valid field names
- Prose refactor across rules/pr-title-format.md, skills/gh-prepare/SKILL.md, instruction files, and commands/gh-pr-address.md
- Extended tests with schema roundtrip parse, mode-coverage, and no-luca-leak grep assertions
- Boilerplate elimination — vault-resolution prose deduped via tool encapsulation

### Key Patterns

- consult(fallback: true) returns full preferences
- consult-section(fallback: true) returns one section with graceful-degradation
- Schema and memory field names must match exactly
- alwaysApply rules must verify target mode is registered

### Impact

Framework-distributed files can now be deployed to projects with different PR/release/commit conventions without forking the codebase.
