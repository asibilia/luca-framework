# Review Capture — Security [Wave 2]

**Verdict**: APPROVE (0 MUST-FIX, 2 SHOULD-FIX)

## SHOULD-FIX
- **S2-S1** Three structurally-mutating MuninnDB tools absent from forbidden list: muninn_apply_enrichment, muninn_replay_enrichment, muninn_merge_entity, muninn_entity_state, muninn_entity_state_batch. These alter enrichment metadata or entity graph topology. LLM could call them on perceived duplicates/deprecated entities.
- **S2-S2** Test gap — no assertion that `verified→inferred` demotion is gated; no assertion that `--auto + --dry-run` keeps dry-run wins.

## NOTE
- N1: lastRunAt Step 5 vs Step 6 stale ref (same as D2-1).
- N2: --auto + --dry-run interaction handled correctly via pre-flight strip but untested.

## VERIFIED RESOLVED
- SEC-1 (vault guard always-on, edge cases handled by shape validation seeding fresh).
- SEC-2 (Step 2 pre-apply gate fires before Step 3 MCP call; demotion explicitly gated).
- SEC-3 (11 tools enumerated, 10 in test array + bare-remember regex).
- SF state validation, --vault format regex, citation regex anchors.

## NEW THREATS CHECKED
- --auto bypass: not exploitable (pre-flight ordering + Step 2 path correct).
- Pre-flight ordering before MCP: clean.
- Demotion gating: present at line 68 + 171.
- state.json cursor validation: opaque-string + length<=4096 is correct.
