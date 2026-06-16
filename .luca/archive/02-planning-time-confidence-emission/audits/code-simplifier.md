# Audit — Simplification

## Verdict
APPROVE

## Summary
The flag→payload→inputSchema→handler threading for `researchable`/`resolution` is consistent and minimal — only one real redundancy found (manual `--resolution` enum check at the CLI layer that the downstream Zod schema already owns). The `_exhaustive: never` guard is clean. The "When to Log" trigger lists are correctly sync-commented rather than blindly duplicated.

## Findings

- **[SHOULD-FIX]** Manual `--resolution` enum validation in `confidence.ts` duplicates what `inputSchema.safeParse` already does in `runWriteHandler`.
  - File: `packages/luca-cli/src/commands/write-surface/confidence.ts:166-177`
  - Detail: Lines 166–177 manually check `resolution !== 'auto' && resolution !== 'research' && resolution !== 'ask'` and call `process.exit(1)`. However, `runWriteHandler` at line 68 calls `tool.inputSchema.safeParse(rawArgs)` which runs `z.enum(['auto','research','ask']).optional()` on the same field. In the flag-driven path, the raw payload is passed directly to `runWriteHandler`, meaning the manual check fires first but the schema check would catch the same error anyway. The manual validation adds ~10 lines of dead guard and creates two independent failure messages for the same constraint.
  - Suggestion: Remove lines 166–177. The schema's `z.enum` rejection in `runWriteHandler` already produces a structured error message with field path and allowed values. If a more targeted error is desired, the inputSchema description already documents the allowed values — no pre-validation needed.
  - Cross-phase: false

- **[NOTE]** The optional-field conditional spread pattern is identical for `reviewHint`, `researchable`, and `resolution` in both `confidence.ts` (lines 191–199) and `luca-confidence-log.ts` (lines 152–161). This is intentional mirroring of the same schema contract and the repetition is shallow (3 two-line spreads each). However, if a fourth optional field is added later, a helper like `pickDefined(obj, keys)` would keep both sites DRY.
  - File: `packages/luca-cli/src/commands/write-surface/confidence.ts:191-199` / `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts:152-161`
  - Not a current blocker — note for when optional fields grow beyond 3.
  - Cross-phase: false

- **[NOTE]** The `_exhaustive: never` guard in `gate.ts` (line 51) is correct and clean. The `entry.resolution` type is `z.enum(['auto','research','ask']).optional()` — once the `if (entry.resolution)` guard on line 47 passes, TypeScript knows it is a non-undefined enum value. The `never` assignment compiles only if the union is genuinely exhausted, making this a true compile-time guard. No change needed; documenting as verified.
  - File: `packages/luca-core/src/confidence/gate.ts:51`
  - Cross-phase: false

- **[NOTE]** "When to Log" in `architect.ts` (line 357 comment) explicitly states it mirrors `execute.ts` and annotates the cross-reference. The two lists are intentionally worded differently (plan-time vs execution-time framing), so deduplication via a shared constant in luca-tools' shared/ would require prose parameterization. The sync-comment approach is pragmatic given the different agent contexts. No change needed.
  - File: `packages/luca-tools/src/artifacts/modes/architect.ts:357`
  - Cross-phase: false

## Verified Locations (anti-sycophancy gate)

1. `packages/luca-cli/src/commands/write-surface/confidence.ts:153-200` — flag-driven payload construction path; confirmed `researchable`/`resolution`/`reviewHint` all use conditional spread, consistent with handler.
2. `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts:138-162` — `appendConfidenceEntry` call; optional fields forwarded with the same conditional-spread pattern; no double-parse since `runWriteHandler` owns schema validation.
3. `packages/luca-core/src/confidence/gate.ts:46-61` — exhaustiveness guard: `const _exhaustive: never = entry.resolution` only reachable if a new enum value is added without updating the if-chain; verified correct.
4. `packages/luca-core/src/confidence/schemas.ts:80` — canonical `resolution` definition is `z.enum(['auto','research','ask']).optional()` — confirms the manual CLI check at confidence.ts:168-176 is fully redundant.

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 1
- NOTE: 3
- CROSS_PHASE: 0
