---
description: "PR title format convention — consult projectPreferences before every PR"
alwaysApply: true
---

**Before creating any PR**, consult project preferences (works in every registered Luca mode):

```
projectPreferences({ action: "consult-section", section: "pr",      fallback: true })
projectPreferences({ action: "consult-section", section: "tracker", fallback: true })
```

Apply `pr.titleTemplate` (preferred) or `pr.titleFormat` (legacy) as the title template. Tokens (e.g. `{type}`, `{scope}`, `{version}`, `{issue}`, `{description}`) are project-defined — render them from the consulted preference values, never invent your own.

Build issue references in PR titles **and** PR bodies via `tracker.linkFormat` (e.g. `Closes #{issue}`).

Reject the PR title if it matches any pattern in `pr.forbidden[]`.

**If `projectPreferences` is unavailable** (custom consumer mode without the tool registered): consult MuninnDB for release/PR conventions before opening the PR. Never invent a title format.

```
mcp__muninn__muninn_recall({ vault: "<repo_vault>", context: ["PR title format", "release checklist"], mode: "semantic", limit: 5 })
```

**Never** open a PR without consulting these conventions first.
