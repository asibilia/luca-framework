# Context — Memory Tier-Promotion Contract

## Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | Tier-decision rule injected into BOTH `agent-constraints.ts` (modes) AND `subagents/shared-prefix.ts` (subagents) | MODE+SUBAGENT injection paths mutually exclusive; single-prefix update misses one population (R5). |
| D2 | Single source-of-truth: new file `src/memory-tier-discipline.ts` exporting `MEMORY_TIER_DISCIPLINE` constant; both prefix files import it | Prevents drift between two prose copies. |
| D3 | Tier rule placed in `RECENCY_REMINDERS` (modes) and appended before `## Luca Reminders` (subagents) | Recency zone for write-time decision rule; matches existing structural conventions. |
| D4 | Verified-tier candidates: W1 (milestone init), W3 (user-keep), W6/W7 (arch-audit user accept/reject), W8 (luca-init prefs) | These cite user intent explicitly — falsifiable from a user message-id. All other writes (AI-derived patterns, learnings, metrics, research, postmortem pitfalls) stay `inferred`. |
| D5 | Per-callsite update = `# Tier: <verified\|inferred>` marker comment immediately preceding fenced block; for verified writes, append `mcp__muninn__muninn_trust(id, "verified")` follow-up call | Marker is grep-able for tests; verified writes get explicit promotion call. |
| D6 | `_batch` callsites stay blanket `inferred` — no per-id loop | All 6 batch callsites (W2/W9/W10/W14/W15/W17) are AI-derived. Avoids contract complexity. |
| D7 | Tool description strings (`run-postmortem.ts:15`, `project-preferences.ts:77`) get marker comment too | Agent-facing prose, same risk surface. |
| D8 | Three new tests: prefix-content snapshot (Pattern 2), callsite-marker scan (Pattern 1), verified-followup scan (Pattern 1 narrow) | Layered coverage, brittleness-resistant. |
| D9 | Recall-side filtering OUT OF SCOPE — separate todo. | Sequence: this todo establishes write-time tier; recall todo consumes it. |
| D10 | Audit skill back-fill OUT OF SCOPE — separate todo. | Existing memories all `inferred`; audit skill handles retroactive promotion. |
| D11 | Rules-engine backstop OUT OF SCOPE | `runRules` cannot inspect runtime RPC sequences. Defer to a follow-up todo if drift observed. |
| D12 | W13 (finalize.md:231 vault hardcode) handled separately — todo already added in research phase | Out of scope for this contract. |

## Constraints

- `SUBAGENT_SHARED_PREFIX` token budget advisory <400; current ~130; tier rule must fit ~80–120 tokens.
- Existing prose conventions: markdown `###` heading or bold step sentence above fenced code blocks (no `# inline` comments). Use `# Tier:` as a non-rendered HTML-comment-style marker — it's grep-able and won't render in markdown.
  - Refinement: in `.md` files use `<!-- Tier: ... -->` HTML comment. In `.ts` backtick strings use `// Tier: ...` JS comment. In code-block content (which is shown as code, not interpreted) use `# Tier: ...`. Tests scan for any of these forms.
- Caveman behavior unchanged.

## Out of scope

- `muninn_recall` tier filtering (next todo).
- Audit skill back-fill (third todo).
- Existing-memory bulk promotion.
- New MCP tool actions.
- W13 vault hardcode bug (separate todo).
