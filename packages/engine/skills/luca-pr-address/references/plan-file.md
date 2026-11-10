# The plan file

Stage 3e of `/luca-pr-address` writes `plan.md` in the working folder, in this shape. It is the readable record of the run, and the last thing a person sees before code changes.

```markdown
# PR #<n>: <title>

head: <sha>   base: <base>   fetched: <iso>   iteration: <k>   owner: <login>

## Summary
Must fix: N · Should fix: N · Answer only: N · Nit: N · From the owner: N
Stale: N · Already answered: N · Notices: N
CI notices (not findings): N

## Findings

### F01 · `path/to/file.ts:186` · must fix / bug · from the owner
source: review_comment (<author>, comment 4039139369)
converged_with: F07
> the reviewer's words, quoted

**Assessment:** _(filled in during Stage 4)_
**Action:** _(fixed <sha> | answered | asked | deferred #<issue> | declined | skipped | noted)_
```

Write where a finding is in the form its `kind` gives: `file.ts:186` for a line, `file.ts:180-186` for a range, `file.ts (whole file)` for a file, `(whole PR)` for a review's own text.
