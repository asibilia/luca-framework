---
title: "Repo-cleanup: transient-artifact gitignore + placeholder/stale-ref detectors"
area: repo-cleanup
created: 2026-05-17
priority: low
source: pr-feedback-audit
---

## Task

Repo-cleanup: transient-artifact gitignore + placeholder/stale-ref detectors

## Pattern

Cosmetic findings that consistently recur in PR reviews — generic across any repo that uses luca:

- Transient session/scratch artifacts committed by accident (review captures, convergence state files, planning intermediates)
- Resolved todos left in `pending/` instead of moved to `done/`
- Bare ``` in changeset/markdown content breaks rendering
- Round-number placeholders in code examples (`inputTokens: 12000`, `durationMs: 45000`) — reviewers flag as fabricated
- Stale identifiers in example snippets after rename (e.g. deprecated model IDs, old function names)

These are framework-shipped repo hygiene concerns that benefit every consumer repo, not luca-internal cleanups.

## Deliverables

1. **Framework-shipped `.gitignore` snippet** (or starter pack) documenting recommended patterns for consumer repos:
   - `**/review-capture-*.md`
   - `**/checks-convergence.json`
   - `.planning/REVIEW-*.md` outside phase dirs
2. **`luca-init` (or equivalent) integration**: offer to append these patterns to the consumer repo's `.gitignore` during init.
3. **Finalize hook**: any todo with status `done` MUST live in `todos/done/` — auto-move with warning if found in `pending/`.
4. **Repo-cleanup scanner extensions** (apply to any repo, configurable via rule-pack):
   - Bare ``` inside changeset/markdown content (heuristic with code-fence allowlist)
   - Round-number placeholder detector for example numerics in instruction/doc files (`<multiple-of-1000>` for token-like fields, `<multiple-of-1000>` for duration-like fields) — configurable thresholds + allowlist
   - **Stale-identifier detector** driven by a repo-local "deprecated names" manifest (consumer repos populate; luca-framework dogfoods by sourcing from `model-routing.ts`)
5. **Dogfooding**: enable all of the above on luca-framework itself.

## Acceptance

- [ ] Framework ships recommended `.gitignore` patterns + init integration
- [ ] Finalize auto-moves stale `done` todos
- [ ] Repo-cleanup flags bare ``` in changesets
- [ ] Round-number placeholder detector configurable + with allowlist
- [ ] Stale-identifier detector reads from repo-local manifest (not hardcoded); luca dogfoods via model-routing.ts

## Memory References

- `01KRHYQHQMQRJPKP7MXNZ5AQTV` — pr-review-transient-artifacts-committed
- `01KRHYQHQNKQ8XVJF2MWPZ3BRTC` — pr-review-resolved-todos-left-in-pending
- `01KRQ310E8WY06JXSMM7NNRY4A` — execute-md-fabricated-example
- `01KR4AKKR8CKMC7Q79ZC24N6M4` — yaml-frontmatter-quote-collision

## Source

PR feedback audit 2026-05-17 (Theme 10). Generic repo hygiene pattern.
