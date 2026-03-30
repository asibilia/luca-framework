# Phase 224 — Anti-Skip Rollout: Pre-Mortem Risk Brief

**Complexity:** COMPLEX
**Scenarios analyzed:** 3

## Critical Risks

1. **Context File State Corruption on Concurrent Sub-Skill Invocation** — Multiple sub-skills reading stale `/tmp/{skill}-context.json` during parallel wave execution, causing state machine desynchronization | Mitigation: Implement 200ms TTL guard on pre-step hook with atomic read-modify-write for context updates

2. **Hook Registration Drift Between src/ and Generated Outputs** — Hook registry entry added to `canonicalHookRegistry` but pre-step enforcement hook not generated in `.claude/hooks/` until next `bun run build:all`, causing phase execution to bypass enforcement | Mitigation: Document build:all requirement, add pre-flight check to verify hook presence

3. **State Machine Transition Validation Race Between Sub-Skills** — Two sub-skills attempt to emit terminal events concurrently, causing state overwrite and lost transitions | Mitigation: Add event dedup timestamp to context file; pre-step hook validates event hasn't already been processed

## Recommended Plan Constraints

- Document that `bun run build:all` must be run by user manually between sessions before phase execution resumes
- Implement event idempotency check in context file: each state transition records `event_timestamp` and `event_id`; pre-step hook rejects duplicate event IDs
- Add pre-flight validation in phase-execute skill: scan `.claude/hooks/` for presence of all registered enforcement hooks before allowing sub-skill invocation
- Ensure sequential (not parallel) state machine transitions: lu-verifier writes context, THEN lu-learner is spawned

## Risk Assessment

| Risk                    | Likelihood | Impact | Mitigation Cost                             |
| ----------------------- | ---------- | ------ | ------------------------------------------- |
| Context file corruption | MEDIUM     | HIGH   | LOW (200ms guard already exists from pilot) |
| Hook registration drift | HIGH       | MEDIUM | LOW (documentation + pre-flight check)      |
| State machine race      | LOW        | HIGH   | MEDIUM (event sourcing pattern)             |

## Approved Mitigations

All 3 mitigations approved for inclusion in planning constraints.
