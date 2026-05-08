---
title: "memory tier-promotion contract: write-time tier discipline at all muninn_remember and muninn_recall callsites"
area: memory
created: 2026-05-08
priority: high
source: discuss
---

## Task

memory tier-promotion contract: write-time tier discipline at all muninn_remember and muninn_recall callsites

## Goal

Establish a discipline contract — enforced via instruction prose loaded once per mode swap — that every `muninn_remember` callsite explicitly selects a trust tier before writing, and every `muninn_recall` callsite prefers `verified` results.

## The decision rule (lives in MODE_SHARED_PREFIX)

```
verified — content cites a specific source (file:line+SHA, PR-id, user-message-id, external URL) AND claim is testable from that source AND content is factual not interpretive.
external — content imported from outside this repo (rare; e.g. seeded preferences memory).
inferred — DEFAULT. Patterns, lessons, opinions, predictions, recommendations.
untrusted — never assigned by an agent.
```

## Deliverables

### Prose changes
- Add tier-decision rule + write-time contract to `src/util/mode-shared-prefix.ts` (`MODE_SHARED_PREFIX`).
- Mirror in `src/util/subagent-prefix.ts` (`SUBAGENT_SHARED_PREFIX`) so subagents follow the same contract.
- Update all 11 `muninn_remember` callsites in instruction prose (across mode files, skill SKILL.md files, and command files) to:
  - Add a comment line preceding the call: `# Decide tier per MODE_SHARED_PREFIX rule`
  - Add a follow-up line after the call: `# IF tier === "verified": muninn_trust(id: <returned-id>, trust: "verified")`
- Update `muninn_recall` callsites to filter/prefer `verified` results in-context (since `muninn_recall` doesn't take a trust filter).

### Optional rule-engine backstop (nice-to-have, can be split into follow-up todo)
- Add `.luca/rules/memory-tier-discipline.md` — gate at finalize time, scans recent ledger for `muninn_remember` calls without `muninn_trust` follow-up when content cites a source.

### Tests
- Prose-snapshot tests on the 11 callsites confirming they include the tier-decision comment and (where applicable) the trust-promotion follow-up.
- Snapshot test on `MODE_SHARED_PREFIX` containing the tier rule.
- Snapshot test on `SUBAGENT_SHARED_PREFIX` containing the tier rule.

## Audit mapping

The 11 callsites to update (search: `muninn_remember\(` in instruction files):
- Mode files: triage.md, research.md, architect.md, execute.md, review.md, finalize.md, learner-related prose
- Skill files: any SKILL.md that captures pitfalls/decisions
- Command shims: pr-address, gh-prepare if applicable

(Run `search_content "muninn_remember\\(" packages/luca-mastracode` during planning to enumerate exact list.)

## Honest framing

This is a discipline contract, not a runtime guarantee. The audit skill (Todo: memory-audit) is the safety net that catches drift retroactively.

## Out of scope

- Code-level enforcement (no TS chokepoint exists — `muninn_remember` is invoked via MCP).
- Migration of existing memories — the audit skill handles those.
- New MuninnDB tool actions (e.g. `muninn_remember_with_tier`) — keep MCP surface stable.
