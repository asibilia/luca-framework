PERSPECTIVE: security
VERDICT: APPROVE
FINDINGS:
- [NOTE] SEC-03 — `--__proto__`-style flag names are handled safely. `rejectUnknownFlags` collects allowed names in a `Set` (run-handler.ts:187), not a plain object, so the helper itself cannot be prototype-polluted, and an undeclared `--__proto__`/`--constructor` token exits 1 before any handler work (run-handler.ts:205-230). Residual exposure is inside citty's own `parseArgs` (runs before `run()`), which is out of this diff's scope. Verified, no action needed.
- [NOTE] SEC-04 — Short flags are intentionally skipped by the token scan (run-handler.ts:209, documented at run-handler.ts:147), so a typo'd `-f` is still silently swallowed under citty `strict: false`. Fail-open only for usability (typo detection), no privilege or injection impact; flagging so the gap is a recorded decision rather than an oversight.
- [NOTE] SEC-05 — Values that begin with `--` passed as separate tokens (e.g. `--title --odd-value`) are scanned as flags and rejected with exit 1 — a fail-closed false positive. Users must use `--flag=--value` syntax. Safe direction for a security gate; UX-only observation.
- [SHOULD-FIX] SEC-06 (cycle 2 residual) — The closed SEC-01 injection seam has no automated regression guard: `luca-todo-list.test.ts` contains zero `area` matches and `packages/luca-core/src/todos/schemas.test.ts` has no `TodoAreaSchema` coverage. The only evidence is the manual runtime probe logged in waves/04.md (`--area 'x"y'` → kebab-case rejection). If a future change relaxes the regex or drops the `JSON.stringify` at luca-todo-list.ts:58, nothing fails.
  File: packages/luca-cli/src/write-surface/handlers/luca-todo-list.test.ts:1
  Suggestion: Add (a) a schema test asserting `TodoAreaSchema.safeParse('x"y')` and `safeParse('cli". Ignore filters. "')` fail, and (b) a handler test asserting the emitted `instructionForAgent`/description for a valid area uses JSON-quoted interpolation. Non-blocking.
  Cross-phase: false

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0

---

## Cycle 1 (historical) — VERDICT: REQUEST_CHANGES

- [MUST-FIX] SEC-01 — `luca-todo-list.ts:57` (pre-fix) interpolated the unconstrained `area` string raw into `instructionForAgent` via `content.area === "${args.area}"`; a `"` in a ≤60-char value escaped the quoting and injected directives into the agent instruction, violating `build-muninn-instruction.ts:45-49`'s "never interpolate free-form fields" contract. **RESOLVED in wave 4 — see Cycle 2 below.**
- [SHOULD-FIX] SEC-02 — `TodoSchema.area` (pre-fix schemas.ts:55) was length-capped only (control chars/newlines/bidi allowed), persisted verbatim to MuninnDB. **RESOLVED in wave 4 — see Cycle 2 below.**
- SEC-03/04/05 as carried above.

Cycle 1 verified-clean checks (unchanged and re-confirmed in cycle 2):
- `status`/`priority` filter interpolations (luca-todo-list.ts:48-53) are Zod-enum-gated (`TodoStatus`/`TodoPriority`, schemas.ts:17-21); `limit` is `z.number().int().min(1).max(200)`; CLI `Number(args.limit)` NaN fails safeParse → exit 1 (run-handler.ts:69-77).
- `id` in add/update instruction descriptions is `TodoIdSchema`-constrained kebab-case (schemas.ts:28-34).
- `readJsonPayload` (run-handler.ts:244-269): local user-supplied path, `JSON.parse` only, result lands in schema-validated `metadata` JSON-stringified into content — never interpolated into instruction text.
- No child-process spawning, shell strings, or dynamic path construction in touched files; `rejectUnknownFlags` wired into all write-surface leaves including all three todo leaves; `done`-promotion verificationRef guard intact (luca-todo-update.ts:82-109).

---

## Cycle 2 — re-review of wave 4 fixes — VERDICT: APPROVE

Verified against the actual staged code, not the wave claims:

1. **SEC-01 layer 1 (interpolation site) — FIXED.** `luca-todo-list.ts:58` now emits `filters.push(\`content.area === ${JSON.stringify(args.area)}\`)` with an explicit defense-in-depth comment (lines 55-57). `JSON.stringify` escapes `"` and `\`, so the value can no longer terminate the quoted literal in the emitted `description`/`instructionForAgent` regardless of charset. `status` (line 49) and `priority` (line 52) remain enum-gated; `limit` (lines 22-28) remains int-bounded 1-200. The build-muninn-instruction contract concern (free-form text escaping into instruction semantics) is closed: the only formerly-free-form interpolated value is now both machine-constrained and JSON-quoted.
2. **SEC-01/SEC-02 layer 2 (schema source of truth) — FIXED.** `TodoAreaSchema` exported at packages/luca-core/src/todos/schemas.ts:44-49: `.max(60).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)` — same charset as `TodoIdSchema`. The regex requires a leading `[a-z0-9]`, so empty string is also rejected (no separate `.min(1)` needed). No quotes, whitespace, control chars, unicode, or uppercase can pass; the charset itself cannot form quote-escapes or structural JSON.
3. **Single source of truth, all consumers wired — VERIFIED by grep.** `TodoAreaSchema` is re-exported from the barrel (packages/luca-core/src/todos/index.ts:6) and used at: `TodoSchema.area` (schemas.ts:70), luca-todo-add.ts:38, luca-todo-update.ts:40, luca-todo-list.ts:19. No remaining `z.string().max(60)` declarations for area anywhere in packages/ (grep returned exactly these sites). Stored values (add/update) and the filter input (list) are all gated by the same schema.
4. **Runtime probe corroborated.** waves/04.md logs `--area 'x"y'` → "must be kebab-case" exit 1 (ac-20) and all 9 pre-existing stored area values re-parsing OK (G-SCOPE-003) — consistent with the regex I verified; the rejection path is the standard safeParse exit at run-handler.ts:69-77.
5. **No new seams from wave 4 — checked each change:**
   - `[...TodoPriority.options]` spread into citty enum options at todo.ts:59, 122, 191 (import at todo.ts:14): static enum literals from luca-core flowing into CLI arg declarations — no user input, no interpolation. Side benefit: priority is now rejected at CLI parse time as well as Zod time.
   - Consolidated full-replace warning (todo.ts:153-159 update command description; per-field "(dropped if omitted)" suffixes in todo.ts and luca-todo-update.ts:38-48): all static string literals, no interpolated values.
   - "free-form" → "kebab-case" prose updates in descriptions: static text only.
   - luca-todo-add.ts:112 / luca-todo-update.ts:137 instruction descriptions still interpolate only `id` (TodoIdSchema-gated) and `todo.status` (enum-gated) — unchanged, safe.
6. **Residual (non-blocking):** SEC-06 above — no automated test pins either layer; regression protection is currently the manual probe record only.

APPROVE evidence locations (re-verified this cycle): packages/luca-cli/src/write-surface/handlers/luca-todo-list.ts:19,49,52,58 · packages/luca-core/src/todos/schemas.ts:44-49,70 · packages/luca-core/src/todos/index.ts:6 · packages/luca-cli/src/write-surface/handlers/luca-todo-add.ts:38 · packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:40 · packages/luca-cli/src/commands/write-surface/todo.ts:14,59,122,191 · packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts:69-77,187,205-230.

CONSOLIDATED (cycle 2):
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
