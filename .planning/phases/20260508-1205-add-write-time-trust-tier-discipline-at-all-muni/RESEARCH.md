# Research: Memory Tier-Promotion Contract

## Summary

Establish write-time trust-tier discipline at every `muninn_remember`/`_batch` callsite in instruction prose, with a tier-decision rule shared across MODE and SUBAGENT injection paths and a `muninn_trust` follow-up for `verified` writes. **Scope is 17 callsites across 16 files. Coverage requires updating BOTH `agent-constraints.ts` (modes) AND `subagents/shared-prefix.ts` (subagents) — they are mutually exclusive injection paths.** Original todo references `src/util/mode-shared-prefix.ts` and `src/util/subagent-prefix.ts`; neither exists. Real names: `src/agent-constraints.ts` and `src/subagents/shared-prefix.ts`.

## Scope

17 write callsites (5 mode `.md`, 4 skill SKILL.md, 3 command `.md`, 2 subagent `.ts`, 2 tool description strings, 1 luca-init blob). 16 recall callsites (filtering = separate todo). **Zero `muninn_trust` callsites in repo today.** Every existing memory lands at engine-default `inferred` tier.

Tier candidates by category:
- **`verified`** (cite-source): W1 milestone init, W3 user-keep, W6/W7 user accept/reject, W8 luca-init prefs.
- **`inferred`** (default): everything else — pitfalls, learnings, metrics, research, session archives, postmortems.
- **`external`**: rare; seeded preferences memory if imported.

W13 (finalize.md:231) hardcodes `vault: "default"` — out-of-scope drift; flag as todo.

## Architecture

Two parallel injection systems, mutually exclusive at runtime:

| Path | File | Injected via | Reaches |
|---|---|---|---|
| MODE | `src/agent-constraints.ts` (`CORE_OPERATING_RULES`, `HARD_CONSTRAINTS`, `RECENCY_REMINDERS`) | `create-static-agent.ts:45-49` dynamic callback | All 10 mode agents |
| SUBAGENT | `src/subagents/shared-prefix.ts` (`SUBAGENT_SHARED_PREFIX`) | `launch.ts:210-223` startup `.map` | All 9 subagents |

- No `skipPrefix` hooks anywhere.
- Zero existing tests on prefix content.
- `SUBAGENT_SHARED_PREFIX` token budget advisory: <400, current ~130, headroom ~270.
- `HARD_CONSTRAINTS` already verbose; `RECENCY_REMINDERS` is the natural mode-side home for tier rule.

## Patterns

### Prose-snapshot test patterns (in repo)
- **Pattern 1**: filesystem walk + regex negation (`no-luca-leak.test.ts`) — recommended for callsite-presence assertions.
- **Pattern 2**: source-level `readFile` + `.toContain` (`ensure-feature-branch.test.ts:122-131`) — recommended for prefix content.
- **Pattern 3**: import-and-iterate runtime module (`preferences-mode-coverage.test.ts`) — not applicable here.

### Comment-before-tool-call convention
- No `# inline comment` style. Uses `###` heading, bold step sentence, or step label + sentence intro.
- Vault prose form is canonical: `Vault from \`.planning/config.json\` → \`muninn.vault\`, fallback \`"default"\`.`

## Dependencies

- `muninn_trust` accepts: `id`, `trust` ∈ {`verified`,`inferred`,`external`,`untrusted`}, optional `vault`.
- `muninn_remember`/`_batch` does NOT accept `trust` field. Engine default = `inferred`.
- `muninn_recall` does NOT accept trust filter. Studio types lack `trust` on engram interfaces.
- `ExcludeUntrusted` is binary vault-level toggle, not granular.
- No TS wrapper exists for write paths. `buildMuninnInstruction()` in `project-preferences.ts:59-82` is a payload assembler, not a wrapper.

**Implication**: every tier promotion = 2 RPC pattern. `muninn_remember(...)` returns id, then `muninn_trust(id, "verified")`. Sequential, no race condition. For `_batch` returning N ids, N separate `muninn_trust` calls.

## Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| R1 | HIGH | `runRules` cannot backstop missing `muninn_trust` at runtime — file-scoped, not RPC-scoped. | Prose discipline; audit skill (separate todo) as retroactive backstop. |
| R5 | HIGH | MODE+SUBAGENT paths mutually exclusive — single-prefix update misses one population. | Inject tier rule into BOTH `agent-constraints.ts` AND `subagents/shared-prefix.ts`. |
| R3 | MEDIUM | Per-callsite prose snapshots = brittle. | Use Pattern-1 regex scan over `src/instructions/*.md`+`src/subagents/*.ts`+`skills/*/SKILL.md` asserting `muninn_remember(` presence implies tier marker nearby. |
| R2 | MEDIUM | 17 prose callsites in 16 files — wide edit surface, easy to miss one. | Drive from scope-table; tests catch omissions. |
| R4 | LOW | `_batch` ambiguity — per-id or per-batch? | Specify per-id in contract; show example with for-each loop. |

## Recommendations

1. **Tier-decision rule lives in BOTH prefixes** — same canonical text in `agent-constraints.ts` (new `MEMORY_TIER_DISCIPLINE` constant included in `getAgentConstraints()`) and `SUBAGENT_SHARED_PREFIX`. Single source-of-truth file with re-export is also acceptable.
2. **Per-callsite update is light**: add a one-line marker comment (`# Tier: verified|inferred per MEMORY_TIER_DISCIPLINE`) immediately above each `muninn_remember(` block. For verified writes (W1/W3/W6/W7/W8), append a follow-up `muninn_trust(...)` call below the block.
3. **Test strategy**: 3 tests
   - **`memory-tier-prefix.test.ts`** — Pattern 2: assert `agent-constraints.ts` and `subagents/shared-prefix.ts` source contain "Memory Tier Discipline" section + 4 tier names.
   - **`memory-tier-callsite.test.ts`** — Pattern 1: walk `src/instructions/*.md`, `src/subagents/*.ts`, `skills/*/SKILL.md`, `commands/*.md`. For each `muninn_remember(` occurrence, assert a tier marker (`# Tier:` or `mcp__muninn__muninn_trust`) within 30 lines.
   - **`memory-tier-verified-followup.test.ts`** — Pattern 1 narrow: at the 5 verified-write callsites (W1/W3/W6/W7/W8), assert a `muninn_trust(` call follows within 50 lines.
4. **Out of scope**: recall-side filtering (next todo), audit skill back-fill (todo 3), `runRules` backstop (defer), W13 vault hardcode bug (separate todo if user wants).

## Open Questions

- Should `muninn_remember_batch` callsites (W2/W9/W10/W14/W15/W17) require per-id trust loop, or is `inferred` blanket appropriate? **Architect should decide**: only the "verified" candidates among batches need promotion. W9/W10/W14/W15/W17 are AI-derived → blanket `inferred`, no follow-up needed → no extra cost. W2 (PR pattern from human review) is borderline — recommend `inferred` to keep contract simple; PR-author intent ≠ source-cited fact.
- Should `tools/run-postmortem.ts:15,35` and `tools/project-preferences.ts:77` description strings get the marker too? Yes — tool description strings are agent-facing prose. Architect to decide whether scope includes them or defers.
