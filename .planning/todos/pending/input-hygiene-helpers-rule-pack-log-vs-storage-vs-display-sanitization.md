---
title: "Input-hygiene helpers + rule pack: log vs storage vs display sanitization"
area: rule-packs
created: 2026-05-17
priority: medium
source: pr-feedback-audit
---

## Task

Input-hygiene helpers + rule pack: log vs storage vs display sanitization

## Pattern

Three distinct sanitization concerns are routinely conflated, causing real bugs in any codebase that handles user input:

1. **Log sanitization** — strip CR/LF (log injection — CWE-117), bounded length
2. **Storage sanitization** — strip CR/LF only, NO length cap (otherwise data silently truncated when stored under a length-permissive schema)
3. **Display bounding** — for user input embedded in error messages, large input → large error (DoS risk via `JSON.stringify(largeInput)`)

When a "sanitize-for-log" helper leaks into storage paths, data is silently truncated. When raw user input flows into error messages, attackers can cause memory/CPU spikes.

This is a generic input-hygiene pattern, observed in PRs #239 and #253 in luca but applies to any project.

## Deliverables

1. **Framework utility module** shipping three named helpers consumable by any repo:
   - `sanitizeForLog(s)` — cap + CR/LF strip
   - `sanitizeForStorage(s)` — CR/LF strip only, no cap
   - `displayBounded(s, maxLen)` — head/tail summary form for oversize input
2. **Rule pack entry**: flag direct `${userInput}` (template string interpolation of untrusted symbols) inside `console.warn`/`console.error`/`new Error(...)` constructors; suggest the appropriate helper.
3. **Rule pack entry**: flag use of any "sanitize-for-log" helper in a path that writes to a database/file/telemetry record (storage misuse detector — heuristic, with allowlist comment escape hatch).
4. **Documentation**: short reference doc explaining the three-helper matrix (a one-pager that repos can link from their CONTRIBUTING).
5. **Dogfooding**: migrate luca-framework's own callsites (`workflow-state.ts`, `telemetry.ts`, `phase-paths.ts`, `postmortem.ts`) as proof-point.

## Acceptance

- [ ] Utility module published (or exposed via framework export) with 3 named helpers + unit tests
- [ ] Rule pack flags raw `${userInput}` in log/error contexts
- [ ] Rule pack flags storage misuse of log-sanitizers (with allowlist syntax)
- [ ] Reference doc exists
- [ ] luca-framework callsites migrated

## Memory References

- `01KRESVJX6MMA28B86D9ME32AW` — error-message-blowup-from-user-controlled-input
- `01KRM40JE0K2G8B16FYNQA9VHX` — sanitizer-cap-vs-schema-max-drift
- `01KREK86JT5GX5H40QYWH3KFQB` — log-injection-via-mutable-cwd-path-interp

## Source

PR feedback audit 2026-05-17 (Theme 4). Generic input-hygiene pattern.
