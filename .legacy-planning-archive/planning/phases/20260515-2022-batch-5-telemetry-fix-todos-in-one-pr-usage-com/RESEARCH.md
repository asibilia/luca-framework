# Research: Batched 5-Telemetry-Fix PR

## Summary

Five telemetry data-quality regressions can be fixed atomically in one PR. Three risks are blocking (schema/prose coupling, atomicity, shared-prefix budget); four are advisory. All fixes are prose + small schema/runtime touches across 6 mode files + `shared-prefix.ts` + `workflow-state.ts` + `postmortem.ts` + tests. Critical insight: telemetry parsing is 100% LLM-instructed (no code-level parser), so prose precision matters more than schema changes.

## Scope

**Single highest-leverage file**: `subagents/shared-prefix.ts` (×9 subagent multiplier). All other mode-file prose is supplementary.

**Files affected**:
- `subagents/shared-prefix.ts` — canonical `<!-- usage: -->` directive (Fix 1, Fix 4 prose, Fix 5 prose)
- `instructions/execute.md` — Fix 1, Fix 2, Fix 4, Fix 5 (canonical example with fabricated 45000/12000)
- `instructions/research.md` — Fix 1, Fix 2, Fix 4
- `instructions/review.md` — Fix 1, Fix 2, Fix 4
- `instructions/architect.md` — Fix 1, Fix 4 (shorthand prose gap)
- `instructions/finalize.md` — Fix 1, Fix 4 (shorthand prose gap)
- `tools/workflow-state.ts` — Fix 4 (schema docs only; no shape change recommended)
- `analysis/postmortem.ts:98,415` — Fix 3 (runtime `vault: 'default' as const`)
- `__tests__/subagent-telemetry-prose.test.ts` — Fix 1 coverage extension
- `__tests__/workflow-state-actions.test.ts` — Fix 2 fixture cleanup, Fix 3 vault assertion, Fix 4/5 cases

## Architecture

**Pipeline**: subagent emits `<!-- usage: ... -->` → orchestrator LLM regex-parses last 256 chars → `workflowState({action: "record-subagent", ...})` → `appendTelemetry()` → `TelemetryRecordSchema.safeParse()` → JSONL append.

**No code-level parser exists**. The regex `/<!--\s*usage:\s*(\{[^}]+\})\s*-->/` is documented in mode files only — the orchestrator LLM must apply it itself.

**`recordSubagentAction` schema (current)**:
- `success: z.boolean().nullable().optional()` — `null` schema-legal
- `model: z.string().max(64).regex(no-CRLF).nullable().optional()`
- `inputTokens`/`outputTokens` `int.nonneg.nullable().optional()` (clamped via `clampTokens()`)
- `durationMs: z.number().nullable().optional()` (coerced via `finiteOrNull()`, routed via `overrides`)
- `outcome` enum 6-value `.nullable().optional()` (stored as `meta.outcome`)

**Vault resolution**: `resolveProjectVault()` in `state/vault.ts` reads `.planning/config.json → muninn.vault`, fallback `"default"`. Only imported by `tools/project-preferences.ts:60`. Mode files use prose-only directive; `postmortem.ts` bypasses helper entirely.

**correlationId**: `<role>-${Date.now()}` (13-digit ms). Canonical at `execute.md:149`. `correlationid-format-prose.test.ts` already guards.

## Patterns

**`<!-- usage: -->` canonical form** (`shared-prefix.ts:37`):
```
<!-- usage: {"inputTokens":<N>,"outputTokens":<N>,"model":"<id>"} -->
```
All 3 fields present. `outcome` separate optional field per `shared-prefix.ts:38`. Outcome enum complete: `completed`, `completed_no_usage`, `completed_partial_parse`, `crashed`, `killed`, `timeout`.

**Mode-file prose variants**: `architect.md:115` and `finalize.md:56` use SHORTHAND ("Parse `<!-- usage: ... -->` from last 256 chars") with NO field enumeration. This is the actual `model:null`/`tokens:0` regression vector — modes that don't enumerate fields let LLMs improvise.

**`vault:` prose**: NO mode file uses literal `vault: "default"`. All use `vault: "<repo_vault>"` directive form. `postmortem.ts:98,415` is sole runtime offender.

**`success:`/`durationMs:` prose**: NO `success: null` anywhere. `execute.md:161` has fabricated `durationMs: 45000` + `inputTokens: 12000`. `architect.md`/`finalize.md` omit guidance entirely.

**Test conventions**: fence-split via `split('```')`, region extraction via `indexOf`, parametric via `describe.each(FILES)`. New test should follow `recall-prose.test.ts` shape.

## Dependencies

**Schema dual-track requirement**: Flat schema mirror at `workflow-state.ts:608-733` must update in lockstep with per-action schemas. Existing lockstep gaps: `role`/`correlationId` missing `min(1)` and CR/LF regex in flat mirror; `query` missing `min(1)`. Defense-in-depth only — `callAction` test helper bypasses flat schema.

**MCP `muninn_recall`**: accepts `vault` as optional string param. No adapter needed.

**SUBAGENT_SHARED_PREFIX budget**: Current 2539 bytes / 3000 hard ceiling = **461 bytes headroom** (~115 tokens × 9 subagents = ~1035 tokens/run). Adding telemetry prose must measure delta.

**Aggregator backward compat**: `SKILL.md` reads JSONL with bare `JSON.parse` + `v:1` check, no schema. Historical `success:null`/`model:null`/`vault:"default"` records all safe.

## Risks

| # | Risk | Confidence | Verdict |
|---|------|-----------|---------|
| 1 | `success` nullable removal breaks in-flight callers | HIGH | **BLOCKING** — Keep `.nullable()`. Fix is prose-only. |
| 2 | Prose drift across 6 mode files mid-ship | HIGH | **BLOCKING** — Single atomic commit. Consider cross-file invariant test. |
| 3 | `shared-prefix.ts` 461-byte headroom | HIGH | **BLOCKING** — Measure delta. Trim or expand ceiling. |
| 4 | correlationId aggregator regression | LOW | ADVISORY — aggregator uses dict-key join, no regex |
| 5 | Vault resolution fallback reliability | MEDIUM | ADVISORY — 4-layer fallback airtight; `postmortem.ts` intentional |
| 6 | Tests locking buggy behavior | MEDIUM | ADVISORY — `inputTokens:null` IS locked; `success:null` NOT |
| 7 | JSONL backward compat | HIGH | ADVISORY (safe) — aggregator reads schema-agnostic |

## Recommendations

1. **Fix 1 (usage drift)**: Update `architect.md:115` + `finalize.md:56` shorthand prose to enumerate `inputTokens`, `outputTokens`, `model` fields. Add prose: "If `model` unknown, omit the entire usage comment — never emit `model: null`." Add prose: "Use `null` for unknown tokens, never `0`." Add cross-file invariant test scanning `<!-- usage:` examples for `model` presence.

2. **Fix 2 (correlationId unit drift)**: Update test fixtures in `workflow-state-actions.test.ts` to use non-round 13-digit ms values (e.g. `1700000000001` not `1747200000000`). No mode-file prose change needed — `correlationid-format-prose.test.ts` already guards.

3. **Fix 3 (vault hardcoding)**: Thread vault parameter through `postmortem.ts` signature OR document intentional cross-project canonical with a code comment. Add regression test asserting `postmortemReport()` accepts vault override.

4. **Fix 4 (success:null semantics)**: PROSE-ONLY. Update `shared-prefix.ts:37-38` to document: "if `outcome: completed`, set `success: true`. If `outcome` in `{crashed, killed, timeout, completed_partial_parse}`, set `success: false`. Never emit `null` on complete events." Keep schema `.nullable()` for backward compat. Add test asserting prose contains this directive.

5. **Fix 5 (fabricated durationMs)**: Update `execute.md:161` example values to realistic primes (e.g. `inputTokens: 8743, outputTokens: 2156, durationMs: 47382`). Add prose: "durationMs MUST be `Date.now() - ts`, never a guess. Use `null` if unable to measure." Add test asserting `execute.md` example has `durationMs % 1000 !== 0`.

**Ship order** (atomic single commit):
- Wave 1: shared-prefix.ts prose (measure delta) + architect.md/finalize.md shorthand fixes
- Wave 2: execute.md example values + postmortem.ts vault threading + test fixture cleanup
- Wave 3: New cross-file invariant test + regression tests + changeset

## Open Questions

1. **`postmortem.ts vault: 'default'`** — intentional cross-project canonical (so all repos' pitfalls aggregate centrally) OR oversight? If intentional, add code comment; if not, thread vault.
2. **Should new test be in existing `subagent-telemetry-prose.test.ts` or new `usage-comment-prose.test.ts`?** Recommend new file to keep separation of concerns.
3. **`shared-prefix.ts` ceiling**: Bump to 3500 OR trim existing prose to fit? Recommend bumping with explicit test update (cost: ~115 extra tokens × 9 subagents per run = ~1035 tokens). Acceptable for the data-quality gain.
4. **Aggregator skill updates**: Should `luca-telemetry-report` add new flags for `model:null` rate / `success:null` rate to track regression? Out of scope for this PR but worth a follow-up todo.
