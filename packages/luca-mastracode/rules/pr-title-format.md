---
description: "PR title format — type(scope): version #issue description"
alwaysApply: true
---

## PR Title Format

PR titles MUST follow this exact structure:

```
type(scope): <version?> #issue description
```

- **type**: feat | fix | docs | style | refactor | test | chore (from commit.config.ts)
- **scope**: framework | mastracode | studio | config | docs | repo (from commit.config.ts)
- **version**: milestone version if one exists (e.g. v10.2.0) — omit if no version applies
- **#issue**: GitHub issue number prefixed with # (e.g. #143)
- **description**: concise human-readable summary

Examples:
- `fix(mastracode): v10.1.0 #140 align mode instructions with tool permissions`
- `feat(mastracode): v10.2.0 #143 bundled skills and rules system`
- `fix(studio): #152 validate API schemas against real responses` (no version)

NEVER use `(#issue)` as the scope. The scope always comes from commit.config.ts.
Always recall memory for PR conventions before creating a PR.
