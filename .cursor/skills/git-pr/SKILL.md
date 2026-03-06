---
name: git-pr
description: Create a pull request with conventional formatting and submit for review.
---

<main>
# Git Pull Request

Create a pull request with proper formatting.

## Instructions

1. **Push branch**: `git push -u origin HEAD`
2. **Get context**:
   - Branch name: `git branch --show-current`
   - Extract Jira ticket from branch name
   - Get diff: `git diff main...HEAD`
3. **Analyze changes** and draft PR description
4. **Create PR**:
   - Standard: `gh pr create --title "..." --body "..."`
   - Draft: Add `--draft` flag

## PR Title Format

```
type(scope): TICKET description
```

Example: `fix(apps): PROJ-1234 update login button url`

## PR Body Template

```markdown
## Summary

- [change 1]
- [change 2]

## Test plan

- [ ] Tested locally
- [ ] Verified build passes

---

Generated with [Claude Code](https://claude.com/claude-code)
```

## Notes

- Feature branches typically target the **main** branch (or a release branch)
- Include "Closes PROJ-####" or "Fixes #issue" when applicable
- Adjust base branch based on your team's workflow
</main>