# Code Review — Phase 01: Handoff envelope schema and local mailbox transport

Three reviewers, cold isolation, run in parallel: **security**, **architecture**, **test-quality**.
Severity tally: **0 CRITICAL · 0 HIGH · 12 MEDIUM · 12 LOW**.

Verdict: **loop back to execute** for a bounded fix wave (5 must-fix). Nothing here invalidates the
design or the phase goal; every finding is a defect in the implementation of an already-correct plan.

## Cross-reviewer convergence

Findings that two or three reviewers reached independently carry the most weight:

| Convergence | Reviewers | Why it matters |
|---|---|---|
| `atomicWrite` fixed tmp path → torn envelope | security + architecture | Independently identified, with the same reasoning: the luca-cli precedent it was copied from is serialized by the pipeline lock; this mailbox is deliberately lock-free and machine-global, so the risk profile does not transfer |
| `chmodSync(0o700)` guard is untested | security + test-quality | test-quality proved it by mutation: **delete the `chmodSync` line and the entire suite stays green** |
| Tautological assertion at `classify-write-path.test.ts:139` | security + test-quality | The exact anti-pattern two plan-review rounds existed to eliminate |

## What the reviewers verified as CLEAN

Recorded because absence of a finding is itself evidence:

- **Path traversal is genuinely closed.** `ENVELOPE_ID_RE` excludes `.` and `/`, so `..`, `/` and NUL
  are unrepresentable; `mailboxPathFor` returns `null` before any `join`; all consumption sites
  short-circuit with the *same* `not-found` string used for a legitimately absent envelope, so target
  existence is not disclosed. The regex is enforced a second time in the schema, so a tampered
  envelope cannot round-trip. Independently confirmed at runtime by the orchestrator:
  `read false not-found update false not-found escaped false`.
- **Envelope create is exclusive and symlink-safe** — `openSync(path,'wx',0o600)` is `O_CREAT|O_EXCL`,
  which fails on an existing symlink; `EEXIST → duplicate-id` rather than truncating.
- **Module boundary holds** — zero `luca-cli` references; the inline `atomicWrite` is a deliberate copy,
  not an import. Only intra-package import is `telemetry/helpers/generate-run-id.ts`.
- **No classes** — zero matches; both transports are factory closures returning a narrow interface.
- **The feared vacuity hole is NOT present.** All 11 mandated test blocks in
  `create-local-mailbox-transport.test.ts` carry real, behavior-coupled assertions — `round-trip`
  reads the file back off disk, `duplicate-id` asserts the original intent survived, `corrupt` asserts
  `statSync` *throws* proving nothing was written, filters assert positive **and** negative sets.
- **Tests never touch the real `~/.luca/`** — every test uses `mkdtempSync` with `rmSync` in `finally`.
- **Untrusted-text contract is recorded** in `schemas.ts`, `create-local-mailbox-transport.ts`, and
  `is-auto-acceptable.ts`; `isAutoAcceptable` is honestly framed as convenience-not-boundary, is pure,
  denies on an absent/empty allowlist, and nothing else in the module treats `origin.repoPath` as a control.

## MUST-FIX (5)

### MF-1 — `atomicWrite` fixed tmp path publishes torn envelopes [correctness]
`create-local-mailbox-transport.ts:159`. Staging path is a fixed, predictable `${path}.tmp` written
with `writeFileSync` (no `O_EXCL`). Two concurrent `updateStatus` calls on one envelope both pass CAS
(both read the same `updatedAt` before either writes) and then race on the *same* staging file: writer
B truncates while A is mid-write, and A's `renameSync` publishes a torn envelope. Because the name is
guessable and unprotected, a pre-planted symlink at `<id>.json.tmp` also redirects the write.
**Fix:** unique unguessable sibling (`${path}.${process.pid}.${randomUUID()}.tmp`) created with
`openSync(tmp,'wx',0o600)`. Keep `rmSync`-on-failure. The `.json` filter in `list` already excludes tmp.

### MF-2 — the `0o700` guard is protected by nothing, and the parent dir stays loose [security]
`create-local-mailbox-transport.ts:260` + test at `:423`. The `0o700` test only exercises the
fresh-directory path, where `mkdirSync(mode)` alone suffices — so the `chmodSync` re-assert added
*specifically* because `mkdirSync` is a no-op on an existing directory is untested and deletable with a
green suite. Separately, only the leaf is tightened: `~/.luca` typically pre-exists at 0755, and a
group/other-writable parent lets a non-owner rename or replace the entire `handoff` directory,
defeating the leaf mode that `constants.ts` calls "the only thing keeping other users off it".
**Fix:** chmod the `~/.luca` parent to 0o700 too (or return `io-error` when it is group/world-writable);
add a test that pre-creates the dir at 0o777 (explicit `chmodSync` to defeat umask) and asserts `send`
tightens it to 0o700; add a 0o600 assertion on the created envelope file.

### MF-3 — `schemaVersion` silently folds, contradicting an explicit plan decision [missing requirement]
`schemas.ts:188`. `schemaVersion: z.number().int().default(HANDOFF_SCHEMA_VERSION)` folds a *missing*
version to the current one. The `superRefine` only fires after the default is applied, and the runtime
pre-check skips it because `version` is `undefined`. This contradicts the module's own docstrings
("a silent default would paper over a truncated or future-versioned envelope") **and** the round-1
plan-review decision B2, which required reject-with-reason over a fold — a decision made precisely
because `hasRequiredStateKeys` exists in this repo for the same reason.
**Fix:** make the field required (`z.number().int()`) so an absent version is a schema failure.

### MF-4 — classifier fails OPEN when `homedir` is falsy [security]
`classify-write-path.ts:263`. The home-deny is skipped entirely when `opts.homedir` is falsy, and the
`toLucaRelative` fallback then matches the ABSOLUTE mailbox path, rewriting it to
`.luca/handoff/x.json` → `planning-general` → an **allowed** artifact write in PLANNING/REVIEWING. An
agent could hand-forge an envelope straight into the machine-global mailbox, bypassing the
schema-validated CLI that is this module's stated core invariant. The new guard test only exercises
the homedir-supplied branch, so the gap is untested.
**Fix (luca-core half only):** in step 6, treat a `.luca/` path recovered by the `toLucaRelative`
*fallback* — absolute, not resolving under `opts.cwd` — as `denied` rather than `planning-general`.
Add a guard test with NO homedir asserting the result is not `planning-general`.
**SCOPE NOTE:** the other half of the fix (`handle-stage-gate-hook.ts:110` derives
`opts.homedir ?? process.env.HOME`; it should fall back to `os.homedir()`) lives in **luca-cli**, which
`anti-04` forbids this phase. Defer that half to phase 2 and record it — do NOT breach the fence.

### MF-5 — tautological assertion in the security guard test [verification integrity]
`classify-write-path.test.ts:139`. `expect(\`${homedir}/.luca/handoff/x.json\`).toContain('/.luca/handoff/')`
asserts a locally-constructed string contains its own substring; it calls no production code and passes
with `classify-write-path.ts` deleted. It exists only to satisfy ac-19's grep marker. The real
assertions beside it are sound, but the guard's durability now rests on a literal that can survive
while the meaningful assertions are weakened.
**Fix:** delete the line; anchor `r.reason` on real content; and satisfy ac-19's literal via a second
real call, e.g. `classifyWritePath(\`${homedir}/.luca/handoff/nested/x.json\`, { homedir }).class === 'denied'`.

## Additive-now, breaking-later (fix if trivial; do NOT loop for these)

Each is cheap today and a cross-phase break after phase 2 ships:

- **`HandoffTransport` contract lives inside a concrete implementation.** `create-local-mailbox-transport.ts:89`
  declares the interface and all four result types; the peer implementation imports its contract from
  its sibling implementation. Phase 5's daemon would `import type { HandoffTransport } from '.../create-local-mailbox-transport.ts'`.
  A pure file move to `schemas.ts` (beside `HandoffFailure`) or `transport-contract.ts` now; a public
  type-path break later. `actor-handle.ts` is not a precedent — it has one implementation; this has two
  and will gain a third.
- **`list` silently drops future-version envelopes.** `parseEnvelopeFile` returns `null` for any parse
  failure including the schemaVersion refine, so an older luca reports "no envelopes" instead of "1
  envelope this version cannot read". Mixed-version installs are the *expected steady state* for a
  machine-global mailbox. Widening to `{ ok:true, envelopes, unreadable: [...] }` is additive now.
- **Timestamps typed `z.string().min(1)`** despite every docstring saying ISO 8601, so
  `createdAt: "yesterday"` parses. The `updatedAt < createdAt` guard is a lexicographic compare, wrong
  for any non-`Z` offset. Use `z.string().datetime()` and compare via `Date.parse`; the `NaN` branch in
  `nextUpdatedAt` then becomes real defense-in-depth instead of a live path.
- **`failed` has no terminal exit.** `failed: ['in-progress']` only — combined with the deliberate
  absence of `prune`, a permanently-failed envelope is stuck non-terminal forever in a machine-global
  dir. Add `cancelled` to the `failed` row.
- **`list` ordering is unspecified** (raw `readdirSync`). Existing tests pass only because each asserts
  a single-element result. Sort by `createdAt` asc, `id` tiebreak, and document it.
- **`io-error` is never reached by behavior** — the enum lists it, three production sites return it, all
  untested; the `rmSync` tmp-cleanup path is dead in test.
- **CAS docstring overstates its guarantee.** It claims two same-millisecond writers cannot both pass;
  compare and write are separate unsynchronized operations, so a true simultaneous read-modify-write
  still loses an update. Restate accurately — phases 2 and 5 will build against this text.
- **`corrupt` is overloaded**: returned when the *caller* omits `result` on a `→ complete` transition,
  though nothing on disk is corrupt. Phase 2's CLI cannot distinguish "file damaged" from "you forgot
  `--result`" without string-matching.
- Minor: unreachable `send` null-path branch returning the wrong reason; duplicated path-null guard
  between `updateStatus` and `loadEnvelope`; `create-remote-transport.test.ts:35` name claims shape
  parity with the local transport but never references it.

## Reviewer tool-access note

All three reviewers reported having **no Bash tool** in their session, so none could execute tests or
`git diff`; every finding is derived from reading source. That is a real limit on this review's
strength — findings are analytically sound but not empirically confirmed by the reviewers themselves.
The orchestrator independently ran the runtime probes (ac-35..38 plus a traversal-escape probe) and the
full suite, so the *passing* evidence is empirical even though the *findings* are not.
Carried to `learn`.
