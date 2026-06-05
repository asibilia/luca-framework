# Plan Review — Phase 2: planning-time-confidence-emission

**VERDICT: APPROVED** (0 blocking, 4 advisories). Tasks atomic, sequenced correctly (writer surface before instruction bodies), traceable to the locked design. All Phase-1 carry-forward should-fix items accounted for. Below are the advisories as **executor directives** — apply all four.

## Executor directives

### D1 (correctness — from G-DX-001): update the write-surface `inputSchema`, not just the CLI flags
The CLI `logCommand` (`confidence.ts:140-175`) passes its payload to `runWriteHandler('confidence log', lucaConfidenceLogTool, payload)`, which validates against `lucaConfidenceLogTool.inputSchema` via `safeParse` — **unknown keys are silently stripped** (the schema has no `.strict()`). So adding `--researchable`/`--resolution` CLI flags ALONE makes them silent no-ops.
- **Must also edit** `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts`: add `researchable: z.boolean().optional()` and `resolution: z.enum(['auto','research','ask']).optional()` to `inputSchema` (~`:54`), and thread them into the `appendConfidenceEntry` payload spread (~`:121-139`), conditionally — mirror the existing `reviewHint` pattern (~`:135-138`).
- **Scope clarification:** this is the CLI's write path. There is NO running MCP server. "Do not touch MCP" in `plan.md`/Phase-1 context meant *don't add MCP tool registrations / server wiring* — it does NOT exempt this `inputSchema`, which the CLI depends on. Update it.
- Verify the fix end-to-end: `luca confidence log ... --researchable --resolution=research` then `luca confidence gate` shows the entry in the `research` bucket (run from source; global bin stale).

### D2 (from G-DX-002): exhaustiveness guard form
`satisfies never` does NOT work as a bare statement in the `else`. In `gate.ts`, replace the final `else ask.push(entry)` (~`:50`) with:
```ts
else if (entry.resolution === 'ask') ask.push(entry)
else { const _exhaustive: never = entry.resolution; ask.push(entry) }  // fail-toward-human
```
This errors at tsc if the `resolution` enum ever grows, and preserves fail-toward-`ask`.

### D3 (from G-ARCH-001): single owner for the emission instruction
`architect.ts` is the authoritative planner (already declares `pipelineInvocations: ['confidence-log']`). Put the full "Confidence Emission (plan-time)" instruction in **`architect.ts` only**. In `phase-plan/index.ts`, add only a brief pointer ("the architect logs a confidence entry per non-trivial plan-time decision — see its Confidence Emission section"). Prevents double-emission of the same decision.

### D4 (from G-ARCH-002): keep execute-mode schema block from drifting
`execute.ts` confidence-schema example (~`:133-147`) lists canonical ConfidenceEntry fields but not the two new ones. Add `researchable?`/`resolution?` as optional there (one line each, noted as planning-time hints), OR change that block to point at `luca confidence log --help`. Prevents the two mode bodies diverging on the schema.

## Notes
- Editing the architect/phase-plan/execute string-template bodies risks nothing beyond tsc (malformed interpolation only) + visual correctness of the documented `luca confidence log` invocation.
- The "When to Log" trigger list is soft-duplicated from execute mode into the architect emission section — acceptable for string-template bodies; add a one-line cross-reference comment so future edits stay in sync.
