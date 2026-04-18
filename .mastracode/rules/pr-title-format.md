---
description: "PR title format convention — recall release details from MuninnDB before every PR"
alwaysApply: true
---

**Before creating any PR**, recall release conventions from MuninnDB:

```
mcp__muninn__muninn_recall(vault: "<repo_vault>", context: ["release checklist", "PR title format", "version convention"], mode: "semantic", limit: 5)
```

Resolve `<repo_vault>` from `.planning/config.json` → `muninn.vault`, fallback `"default"`. Apply the recalled conventions to determine: version number, title format, milestone linkage, and PR body structure.

**Title format**: `type(scope): <version> #issue description`
Types: feat|fix|docs|style|refactor|test|chore. Scopes: framework|mastracode|studio|config|docs|repo.
Example: `feat(mastracode): v10.2.0 #143 bundled skills and rules system`

**Never** use `(#issue)` as scope. **Never** create a PR without recalling release conventions first.
