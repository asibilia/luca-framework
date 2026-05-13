---
title: "manageTodos waiver path: support verificationRef.waiver for stale-cleanup closes without re-running pipeline"
area: tooling
created: 2026-05-12
priority: medium
source: user-feedback
---

## Task

manageTodos waiver path: support verificationRef.waiver for stale-cleanup closes without re-running pipeline

## Problem

Today `manageTodos(action:"move", targetStatus:"done")` requires a `verificationRef: { criterionId, wave }` that resolves to a PASS entry in `.planning/verification-history.jsonl`. This works well for in-pipeline closes but fails the backlog-gardening case:

- A todo was duplicate-filed during triage; the actual work is already shipped on `main` (e.g. via a merged PR weeks ago)
- The original `verificationRef` is no longer addressable (archived phase, different runId, gc'd)
- The only ways to close today are: (a) hand-write a synthetic PASS to `.planning/verification-history.jsonl` (works but undocumented), or (b) `manageTodos remove` (loses audit trail)

Surfaced by an agent in another repo trying to close two stale-resolved todos that were verifiably shipped via PR #288. Diagnosed the lookup target (root `.planning/verification-history.jsonl`, not phase-scoped) but the bigger gap is: no first-class escape hatch.

## Proposal

Extend `verificationRef` schema to accept a waiver variant:

```ts
verificationRef:
  | { criterionId: string; wave: number }
  | {
      waiver: 'stale-cleanup' | 'duplicate' | 'obsolete';
      reason: string;        // required, ≥20 chars, trimmed
      evidence: string;      // required, ≥10 chars: PR#, commit SHA on main, file:line
    }
```

## Behavior on waiver path

1. **Validate** reason+evidence shape (length, non-empty, regex sanity for evidence)
2. **Append synthetic PASS** to `.planning/verification-history.jsonl` with:
   - `source: "waiver"`
   - `waiverKind: <variant>`
   - `reason`, `evidence` inline
   - `runId: "waiver-<ISO-ts>"` (no collision with real run IDs)
   - `wave: 0`, single criterion with `criterionId: "waiver-<todo-slug>"`
3. **Stamp the done-todo file frontmatter** with:
   ```yaml
   closedVia: waiver
   waiverKind: stale-cleanup
   waiverReason: "..."
   waiverEvidence: "..."
   closedAt: <ISO-ts>
   ```
4. **Emit telemetry** event `todo.waiver` with `{kind, slug, reason, evidence}` in meta
5. **Update postmortem gate** to flag runs with >N waivers as a smell (configurable threshold)

## Acceptance criteria

- [ ] `verificationRef` schema accepts waiver variant (Zod discriminated union or refined object)
- [ ] Validation rejects empty/short reason+evidence with clear error code (`TODO_WAIVER_INVALID`)
- [ ] Synthetic PASS appended idempotently (don't double-append on retry)
- [ ] Done-todo frontmatter stamped with waiver metadata
- [ ] Telemetry event emitted (kind: `todo.waiver`)
- [ ] `move-batch` supports per-item waivers (same schema in items[])
- [ ] Tests cover: happy path, invalid waiver, idempotency, frontmatter stamp, telemetry emission
- [ ] Documentation in tool description + `manageTodos` JSDoc explains when to use waiver vs ref

## Related

- Source diagnosis: `manage-todos.ts:44-76`, `verification-result.ts:95-98` (root path)
- User report: other-agent's backlog cleanup attempt for two PR-#288-resolved todos
- Adjacent: postmortem gate should treat high waiver counts as a workflow signal (separate todo if needed)

