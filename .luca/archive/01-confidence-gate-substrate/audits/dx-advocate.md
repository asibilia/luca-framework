# Audit — Developer Experience (dx-advocate)

## Verdict
APPROVE

## Summary
The new schema fields, gate helper, and CLI subcommand are clean and readable; three SHOULD-FIX gaps remain around missing JSDoc on the new schema fields (rule: exported fields carry docs), an undocumented `resolution` enum variant ambiguity, and a `--help` description inconsistency on the `gate` subcommand.

## Verified Locations

1. `packages/luca-core/src/confidence/schemas.ts:53-63` — `researchable` and `resolution` field JSDoc.
2. `packages/luca-core/src/confidence/gate.ts:23-32` — `ConfidenceGateActions` interface and `selectConfidenceGateActions` JSDoc.
3. `packages/luca-cli/src/commands/write-surface/confidence.ts:244-265` — `gateCommand` description + args + run body.
4. `packages/luca-core/src/confidence/index.ts:17-25` — barrel re-exports include both new symbols.
5. `packages/luca-cli/src/commands/write-surface/confidence.ts:267-280` — parent `confidenceCommand` subCommands map registration.

## Findings

- **[SHOULD-FIX]** `researchable` field JSDoc says "Planning-time hint" but does not explain what a **caller should set it to** during execution-time logging — the sentence "Splits `low` into research-vs-ask in the confidence gate" is useful but buries the action: when SHOULD an executor set `researchable: true`? (Answer: when the ambiguity is factual/resolvable rather than a policy/human judgment call.) The gap means a first-time executor-author reading the schema will not know when to set this flag vs. leaving it absent.
  - File: `packages/luca-core/src/confidence/schemas.ts:53-58`
  - Suggestion: Expand the JSDoc to read: "Set to `true` when the ambiguity is factual and can be resolved by automated research (e.g. missing API contract). Leave absent or `false` when human judgment is required. Affects the confidence gate: `low` + `researchable:true` → `research` bucket; `low` without it → `ask`."

- **[SHOULD-FIX]** `resolution` field JSDoc says "overrides the confidence-derived bucket" but does not document each enum value's meaning — `'auto'`, `'research'`, `'ask'` are not self-evident when someone encounters this field in JSON output. An author adding a new entry may set `resolution:'auto'` thinking it means "I auto-resolved it" rather than "route to the auto bucket regardless of confidence."
  - File: `packages/luca-core/src/confidence/schemas.ts:59-63`
  - Suggestion: Enumerate the three values inline: `` `'auto'` — proceed silently; `'research'` — trigger automated research; `'ask'` — escalate to human. `` Mirrors the `ConfidenceGateActions` bucket semantics.

- **[SHOULD-FIX]** `gateCommand` description (CLI `--help`) is shorter and less precise than the sibling commands. `summary` says "Print aggregate counts … for a phase's confidence journal." `gate` says "Bucket a phase's confidence entries into gate actions (auto / research / ask) with per-bucket counts (stdout JSON)." — the parenthetical "(stdout JSON)" is inconsistent with how `read` and `summary` describe their output (they say nothing about stdout). More importantly the description does not hint that the output shape is `{auto:[], research:[], ask:[], counts:{…}}` which would help a first-time caller decide between `gate` and `summary`.
  - File: `packages/luca-cli/src/commands/write-surface/confidence.ts:248-250`
  - Suggestion: Remove "(stdout JSON)" parenthetical (all commands write stdout); add a one-line shape note: "Output: `{auto, research, ask, counts}` — entry arrays grouped by required action." Align with sibling description style.

- **[NOTE]** `ConfidenceGateActions.counts` duplicates data already computable as `auto.length` etc. The JSDoc says "for cheap orchestrator inspection" which is a valid reason, but it is undocumented what "orchestrator" means here for a new consumer — a shell-script consumer piping `luca confidence gate | jq '.counts.ask'` is the intended use, but that is implicit. No action required unless counts is exported as a standalone type.

- **[NOTE]** `gate.ts` file-level module JSDoc (lines 1-19) is thorough and a good template. However `selectConfidenceGateActions` function-level JSDoc (line 35-38) is sparse — it repeats "total over its input" which is already in the module doc. This is not a violation but the function JSDoc would be more useful if it contained the `@param` and `@returns` tags for IDE hover. Low priority given the module doc compensates.

- **[NOTE]** `index.ts` barrel comment (line 1-3) references `confidence.jsonl` path but the new `gate.ts` exports are pure (no IO). The barrel comment implicitly scopes the module as IO-centric which could mislead a reader about `selectConfidenceGateActions`. Minor; the exports themselves are clear.

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 3
- NOTE: 3
- CROSS_PHASE: 0
