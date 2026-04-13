---
description: "PR title format — type(#issue): version — Title"
alwaysApply: true
---

## PR Title Format

PR titles MUST follow this exact structure:

```
type(#issue): version — Title
```

Examples:
- `feat(#143): v10.2.0 — Bundled Skills & Rules`
- `fix(#140): v10.1.0 — Align Mode Instructions`
- `refactor(#99): v9.0.0 — Workflow Pipeline Redesign`

Components:
- **type**: feat | fix | refactor | chore
- **#issue**: GitHub issue number this PR closes
- **version**: milestone version (e.g. v10.2.0)
- **Title**: human-readable milestone or feature summary

NEVER use bare conventional-commit format like `feat(mastracode): description`. Always include `(#issue)`, version, and em-dash title.
