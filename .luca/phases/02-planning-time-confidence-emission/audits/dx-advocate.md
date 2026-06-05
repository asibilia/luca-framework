# Audit — dx-advocate

## Verdict
APPROVE

## Summary
The new `--researchable` / `--resolution` flags and the architect "Confidence Emission" section are clear, internally consistent, and well-described; two SHOULD-FIX DX gaps exist (a missing `--help` note on the `resolution` error message, and a stale `description` string in the tool descriptor) but nothing blocks correctness.

## Verified Locations
1. `packages/luca-cli/src/commands/write-surface/confidence.ts:139-152` — `researchable` and `resolution` arg descriptions are accurate and match the schema.
2. `packages/luca-core/src/confidence/schemas.ts:54-80` — JSDoc on both new fields is substantive, has concrete examples, and correctly documents the fail-toward-human default.
3. `packages/luca-tools/src/artifacts/modes/architect.ts:351-390` — "Confidence Emission (plan-time)" section: trigger list is concrete, `--researchable` vs `--resolution` guidance is unambiguous, worked example shows a realistic command.

## Findings

- **[SHOULD-FIX]** Resolution validation error message does not suggest `--help` or name the command being run, making it harder to self-diagnose at runtime.
  - File: `packages/luca-cli/src/commands/write-surface/confidence.ts:173-177`
  - Suggestion: Change the error string to `'luca confidence log: --resolution must be one of: auto, research, ask (got "${resolution}"). Run `luca confidence log --help` for field reference.'` — the extra pointer costs nothing and matches the pattern in the architect body which explicitly says "Run `luca confidence log --help` for the full field reference."

- **[SHOULD-FIX]** The `lucaConfidenceLogTool.description` string (used in MCP tool discovery) still enumerates only the original fields (`phase, wave, task, confidence, category, decision, alternatives, reasoning, risk, files, reviewHint?`) and silently omits `researchable?` and `resolution?`, so any agent that reads the MCP description rather than the inputSchema will not know the new fields exist.
  - File: `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts:124-127`
  - Suggestion: Append `researchable?, resolution?` to the parenthetical in the description string: `"…(phase, wave, task, confidence, category, decision, alternatives, reasoning, risk, files, reviewHint?, researchable?, resolution?)."` — small change, restores parity between the prose description and the actual schema.

- **[NOTE]** The architect body's "When to Log" section carries an inline sync-reminder comment (`// NOTE: The When-to-Log trigger list below mirrors the execute-mode confidence journal … Keep both in sync`). This is a future-drift risk: when new triggers are added to one file, the comment does nothing to enforce the other is updated. A shared constant or a lint rule would be more reliable than a prose reminder, but this is a NOTE-level concern for a future DRY pass.
  - File: `packages/luca-tools/src/artifacts/modes/architect.ts:357-358`

- **[NOTE]** The `phase-plan/index.ts` pointer to the architect's confidence-emission behaviour (line 270-271) is a one-liner cross-reference and is adequate. However it uses the phrase "see its `Confidence Emission (plan-time)` section" — if the section heading in `architect.ts` is ever renamed, this pointer silently becomes stale. Low risk given stable naming, but worth tracking.
  - File: `packages/luca-tools/src/artifacts/skills/phase-plan/index.ts:270-271`

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 2
- NOTE: 2
- CROSS_PHASE: 0
