---
'@alecsibilia/luca-mastracode': minor
'@alecsibilia/luca-framework': patch
---

Defend against doc-claim drift — when changesets, PR bodies, and PLAN.md cite symbols, file paths, or quantitative counts that don't match the shipped code.

**New `claimVerifier` tool** (`tools/claim-verifier.ts`, `claim-verifier.ts`) — extracts factual claims from any text artifact:

- `symbol` — backtick-wrapped identifiers (`` `myFunction` ``)
- `file-path` — repo-relative paths matching common project layouts
- `quantitative` — `<N> <countable-noun>` patterns from a small allow-list of countable nouns

For each claim, it greps the working tree (`git grep --untracked` for tracked + new files; filesystem fallback for non-git repos) and reports failures with stable evidence strings. Tolerance ±1 on quantitative counts. 30s total budget, 5s per claim, with timeout failures explicit.

Three actions:

- `verify-text` — verify an inline string (e.g. PR body draft).
- `verify-file` — verify a file on disk (resolves to repo root, then `.planning/`).
- `gate` — verify multiple inputs; returns `code: "CLAIM_VERIFICATION_FAILED"` if any input has unverifiable claims.

Every call appends a `claim-verifier-run` ledger event for postmortem visibility.

**Finalize integration** (`instructions/finalize.md`):

- **Step 3c** (PLAN.md reconciliation) — runs `claimVerifier(action: "verify-file", path: ".planning/PLAN.md")` during gap detection; failures attached to *complete* tasks block re-entry to execute, failures on incomplete tasks are allowed.
- **Step 5b.1** (write release artifacts AFTER review iteration converged) — moves changeset/release-note authoring to *after* the final review iteration. Writing release artifacts before this point is the upstream cause of doc-drift; only the post-convergence tree is a trustworthy source for descriptions of shipped work.
- **Step 5b.2** (verify artifact claims) — runs `claimVerifier(action: "gate", paths: [...], texts: [...])` over the changeset and PR body draft before `gh pr create`. The gate blocks the PR until every cited symbol, path, and count is verified against the working tree.

**Review-mode advisory** (`instructions/review.md`) — non-blocking self-check: reviewers may run `claimVerifier(action: "verify-text", ...)` over their own MUST-FIX/SHOULD-FIX entries to catch hallucinated symbols early.

**Mode permissions** (`tools/mode-permissions.ts`):

- `luca:5-review`: `verify-text`, `verify-file` (advisory).
- `luca:6-finalize`: full access (gate before PR).

Catches the failure class where changesets cite renamed/removed symbols, design docs drift from shipped code, or PR bodies describe quantities that don't match the diff — failure modes that previously were only caught post-merge by reviewers.
