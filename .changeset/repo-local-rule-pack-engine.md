---
'@alecsibilia/luca-mastracode': minor
---

Add a repo-local rule-pack engine plus recurrence-driven rule suggestion. Closes the gap between "we keep flagging this in PR review" and "we have a machine-checkable invariant."

**Why**

Repos accumulate "house rules" that exist only in PR-review folklore — Convex anti-patterns, auth invariants, internal RPC conventions, naming rules. These get caught manually in every PR review, forever, because there is no encoding for them outside of human memory.

This phase ships the engine. Zero domain rules ship in `luca-mastracode` itself — every rule is repo-local in `.luca/rules/*.ts`.

**Engine: `defineRule` + runner**

- `rules/define-rule.ts` — author API. `defineRule({ id, severity, description, scope, category, exclude, check })`. Schema validates id and check function at definition time.
- `rules/runner.ts` — discovery and execution.
  - Walks `.luca/rules/` recursively for `*.ts`/`*.mts`/`*.js`/`*.mjs` files (skips `.test.ts`, `.spec.ts`, dotfiles, `node_modules`).
  - Dynamically imports each file and pulls every `RuleDefinition` from default + named exports + arrays.
  - Resolves `scope` globs via `Bun.Glob`, applies `exclude`, builds one `RuleFile` per candidate.
  - Calls `rule.check(file)` and collects `RuleFinding[]`.
- Hybrid `RuleFile` API: `content: string` for cheap regex checks, lazy `ast(): ts.SourceFile | null` for AST-level matching.
  - AST parse is cached per file across rules (multiple rules processing the same file pay parse cost once).
  - `typescript` is loaded via `createRequire` at call time — repos without `typescript` installed get `ast() === null` and regex-only rules keep working.
- Resilience: rule throws are caught and reported as `RuleExecutionError`; rule-file syntax errors are caught and reported as `RuleLoadError`. A single broken rule never crashes the run.
- Findings are typed compatibly with `pr-review/convergence.ts`'s `ReviewFinding`, so rule output flows through the existing convergence detector as a first-class reviewer perspective.

**Tool: `runRules`**

Four actions:
- `list` — discover rules and return their metadata without executing them.
- `run` — execute all rules; non-blocking; returns the full report.
- `gate` — execute and block (`success: false`, `code: RULE_VIOLATIONS_DETECTED`) when any finding has severity `must-fix`.
- `suggest` — see "Recurrence-driven promotion" below.

Every call appends a `rules-run` ledger event. Available in `build`, `fast`, `luca:4-execute`, `luca:5-review`, `luca:6-finalize` modes.

**Recurrence-driven promotion: `rules/recurrence.ts`**

The hard part of a rule engine is not running rules — it's deciding what rules to write. This module surfaces candidates.

- Iterates every available run (current + archived) via `listRuns()`/`listArchivedRuns()` + `analyzeRun()`.
- Groups violations by `ViolationCode`, counts the number of *distinct runs* each code appeared in (not total occurrences — a single noisy run shouldn't promote a rule).
- Codes meeting `threshold` (default 3) are flagged as recurring.
- For each, renders a draft `.luca/rules/<slug>.ts` template with the rule scaffolding, sample violation message in a comment, and TODO matcher body.
- Renders the full set to a `SUGGESTED-RULES.md` artifact under the planning directory for human review.

Drafts are **never** auto-applied. Generated rules are inevitably approximate; auto-applying would produce false-positive overload. The user reads the rendered file, decides which patterns are mechanically detectable, fills in the matcher, and commits.

**Mode integration**

- `instructions/execute.md` — new Step 2.5 runs `runRules(gate)` after `runChecks` reports `resolved`, before `Verify`. Must-fix rule findings block wave advance. Tool Coordination updated to reflect the new gate.
- `instructions/finalize.md` — new Step 4.5 runs `runRules` with the `suggest` action after the postmortem gate, advisory only. The Tool Coordination sequence numbers up by one.

**Verification**

- Type check clean.
- Build clean.
- Smoke tests pass:
  - Two-rule fixture (regex `no-todo`, AST `no-any`): correctly identified findings on dirty fixture, none on clean.
  - Throwing rule: surfaced in `executionErrors`, did not affect other rules.
  - Syntax-broken rule file: surfaced in `loadErrors`, runner continued.
  - Recurrence detection on the framework's own ledger: 0 recurring pitfalls (expected — postmortem is clean), markdown renderer correctly returned the empty-state message.
