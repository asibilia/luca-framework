---
title: "Dual-layer Zod schema drift detector — rule pack + reviewer guidance"
area: rule-packs
created: 2026-05-17
priority: high
source: pr-feedback-audit
---

## Task

Dual-layer Zod schema drift detector — rule pack + reviewer guidance

## Pattern

Many Mastra tools (and Zod-based APIs generally) use a **two-layer schema** pattern: an outer flat `inputSchema` for the harness pre-parse, and per-action discriminated schemas inside `execute()`. When a guard (e.g. CR/LF regex, max-length, refinement) is added to one layer but not the other, tests that call `execute()` directly **silently bypass the outer layer** — passing even if the new guard is removed.

This is a generic Zod/Mastra pattern, not specific to luca-framework. Observed repeatedly in PRs #243 and #253.

## Deliverables

1. **Rule-pack entry** (`.luca/rules/` ships with framework, consumable by any repo):
   - Detect dual-layer Zod schemas in tool definitions
   - Assert every field with a regex/refinement guard on one layer has a matching guard on the other (or explicit allowlist comment)
   - Flag test files that call `execute()` directly without also exercising the flat schema
2. **Reviewer perspective hint**: add to the reviewer prompt the question "If this PR adds a schema guard, does a test exist that would fail if the guard were removed at each layer?"
3. **Shared test helper convention**: ship `safeParseViaInputSchema(action, input)` helper template in the framework's `templates/` directory for repos to copy.
4. **Dogfooding**: apply the rule pack to luca-framework's own `workflowState` tool as the validation proof-point — decide whether to collapse to one layer or test both.

## Acceptance

- [ ] Rule pack entry ships with framework and is discoverable by `runRules`
- [ ] Reviewer perspective updated with dual-layer question
- [ ] Test helper template documented in framework docs
- [ ] luca-framework's own dual-layer schemas pass the rule (decision recorded)

## Memory References

- `01KRPD06NYNJ14XQJPTWFWQWHE` — defense-in-depth-test-bypasses-outer-validation-layer
- `01KRPB1GPS4PHRMCZ5KC2JWW50` — flat-vs-per-action-schema-drift

## Source

PR feedback audit 2026-05-17 (Theme 3). Generic Zod/Mastra pattern.
