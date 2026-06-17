# Learn — 01-confidence-gate-substrate

## Stored in MuninnDB (vault: luca-framework / default)

- [decision] decision:confidence-gate-medium-auto-only: Only `low` confidence ever gates; `medium` and `high` route silently to `auto`. Keeps full-auto quiet; the gate fires only on genuine uncertainty. (vault: luca-framework)
- [decision] decision:confidence-gate-fail-toward-ask: When `researchable` is absent or false on a `low`-confidence entry, the gate defaults to `ask` (fail-toward-human). Mirrors the gate-enforcement fail-closed convention already established in the codebase. (vault: luca-framework)
- [decision] decision:confidence-gate-planning-time-signal: `researchable` and `resolution` are planning-time fields — set by the planner/orchestrator, not inferred at runtime. The distinction is: `researchable: true` = ambiguity is factual and resolvable by automated research; absent/false = human judgment required. (vault: luca-framework)
- [decision] decision:confidence-gate-deterministic-not-llm: The gate is CLI-resolved (`luca confidence gate`) and deterministic — no LLM judgment in the bucketing path. Mirrors the gate-enforcement rule that orchestrators resolve gates, not sub-skills. (vault: luca-framework)
- [pattern] pattern:pure-analysis-helper-sibling-to-io-module: When adding analysis/bucketing logic to an IO module (e.g. `confidence-journal.ts`), place the pure helper in a sibling file (`gate.ts`) rather than mixing IO and pure logic. Barrel-export both from the package index. This keeps the IO module's contract stable and the helper trivially testable. (vault: default)
- [pattern] pattern:citty-subcommand-mirrors-sibling: When adding a new CLI subcommand in a citty-based command file, mirror the exact structure of an existing sibling (same `defineCommand` shape, same `slug` arg pattern, same `resolveSlug` call, same `process.stdout.write` output path). Avoids novel IO paths and ensures consistent UX. (vault: default)
- [pitfall] pitfall:stale-global-luca-bin-masks-new-subcommands: The globally-linked `luca` bin is the last built/released version (e.g. alpha.8). New CLI subcommands added to source are invisible through it until rebuild + relink + `luca init`. During dogfooding, verify new subcommands by running from source (`bun packages/luca-cli/src/index.ts confidence gate`) or by composing correctness proofs (type-checked wrapper + proven input/output) rather than the global bin. (vault: default)
- [pitfall] pitfall:schema-drift-between-read-and-write-surfaces: Adding optional fields to a Zod schema (`ConfidenceEntrySchema`) without updating the write-surface handler's `inputSchema` creates a tracked gap. The fields pass through the append call (spread), but the MCP/CLI writer can't accept them until its input schema is extended. Mark with `// TODO(PhaseN)` to prevent silent drift from becoming invisible tech debt. (vault: default)

## Skipped (duplicate or low-confidence)

- [convention] "optional fields must use `.optional()` with no `.default()`" — too narrow/project-specific to be cross-cutting; captured in context.md already.
- [note] "counts field as ergonomic convenience for shell consumers" — LOW confidence as a generalizable pattern; too specific to this shape.
- [note] "async CLI run handler calling sync IO — future async refactor risk" — LOW confidence, standard TypeScript footgun already well-known.

## Recommendations for future phases

- Phase 2 (planner emission): Before the planner emits `researchable`/`resolution`, expand the `luca confidence log` CLI writer flags and the MCP write-surface handler `inputSchema` to accept the new fields. The TODO comment in `luca-confidence-log.ts` marks the gap.
- Phase 2: Apply the three DX SHOULD-FIX items deferred from this phase — expand JSDoc on `researchable` (when to set true vs absent), enumerate `resolution` enum semantics per-value in JSDoc, and tighten `gate --help` to drop the `(stdout JSON)` parenthetical and state the output shape `{auto, research, ask, counts}`.
- Phase 2/3: Consider adding a `satisfies never` exhaustiveness guard on the `resolution` enum branch in `gate.ts` (line 47-50) so that if the enum expands, TypeScript surfaces the gap rather than falling through silently to the `ask` bucket.
- Any phase using `luca confidence gate` in orchestration: the subcommand is read-only and pure-composition-verified but cannot be exercised through the global bin until `bun run build && bun link && luca init` is run. Add this to the pre-dogfooding checklist.
