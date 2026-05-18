---
severity: must-fix
applies-to: review
description: >
  Use `sanitizeForLog` for console output (200-char cap, CR/LF/tab strip),
  `sanitizeForStorage` for persisted/telemetry fields (no cap, CR/LF/tab strip).
  Never persist `sanitizeForLog` output — the 200-char cap will silently truncate
  values that the schema's `.max()` permits longer.
---

# Rule: Input Hygiene — Log vs Storage vs Display

## Pattern
- `src/util/sanitize.ts` exports three helpers with distinct contracts:
  - `sanitizeForLog(value)` — console output only, 200-char cap
  - `sanitizeForStorage(value)` — persisted fields (telemetry meta, ledger payloads), no cap
  - `displayBounded(value, max)` — bounded display, caller-controlled cap

## Anti-pattern (DON'T)
- Persisting `sanitizeForLog(query)` into telemetry meta — silently truncates schema-allowed
  values >200 chars (recall.miss query field allows 512).
- Using `sanitizeForStorage` for console output — unbounded output spams logs.

## Do
- Pair the helper with its sink: console → `sanitizeForLog`, telemetry → `sanitizeForStorage`.
- For UI display with a known budget, use `displayBounded(value, max)`.

## Symptom history
- PR #248: sanitizeLogMessage 200-char cap silently truncated telemetry queries.
