# Plan Review — Phase 03: SessionStart hook surfacing pending work orders

Round 1 · MODERATE · **STATUS: NEEDS_REVISION** · Blocking: 2 · Advisory: 10

Independent cold reviewer. Tool access: Read/Grep/Glob only, no Bash — third phase running; the
orchestrator supplies the empirical half.

## Stop-conditions checked — all three sound, NOT a STOP

The brief flagged three assumptions that would have invalidated the phase. All hold:

- **`hookSpecificOutput.additionalContext` IS valid for `SessionStart`.** Not a PostToolUse-shaped
  assumption carried over from `context-refresher`. `SessionStart`, `UserPromptSubmit` and
  `PostToolUse` are the three events that consume it, and for `SessionStart` it is the *designed*
  context-injection channel. The precedent's emit block transfers with only `hookEventName` changed.
- **`compile()` round-trips `SessionStart`.** `HOOK_EVENT_ORDER[0] === 'SessionStart'`
  (`compile/index.ts:65-75`); `writeSettings` emits any event with ≥1 slice (`:173-180`); `emitHook`
  sets `matcher` only when defined (`emit-hook.ts:105-107`), so a matcher-less entry is `{hooks:[…]}`
  — the correct shape for an event with no tool matcher.
- **ac-04 is byte-exact and genuinely fix-sensitive.** `buildCommand` returns
  `` `bun "$CLAUDE_PROJECT_DIR"/${def.handler}` `` (`emit-hook.ts:126-135`); ac-04 reconstructs it with
  `$` and `"` from char codes so shell expansion cannot mangle it into a false compare. It drives
  `compile()` for real and asserts both command and `matcher === undefined`. ac-05 is RED at HEAD
  (current `HOOKS` emits only `["PreToolUse","PostToolUse"]`).

## Architect's structural claims — all three CONFIRMED

- **Dep graph** `luca-cli → luca-tools → luca-core`: `luca-tools/package.json:5-8` declares only
  luca-core + zod; `luca-cli/package.json:6-7` declares both. The hook cannot import from luca-cli, so
  moving the escaper down is correct.
- **The move breaks neither phase-2 import site** — `luca-handoff-list.ts:28` and
  `luca-handoff-accept.ts:40` both pull `toSingleLine` from `write-surface/helpers/handoff-transport.ts`;
  a re-export leaves both byte-unchanged. `CONTROL_CHAR_RE` has exactly one consumer.
- **Bundling, not copying** — `packages/luca/build.config.ts:125-156` shells
  `bun build <src> --target bun --outfile …`, with an inline rationale at `:107-115` stating a raw copy
  fails at runtime in consumer repos. Discovery is directory-driven, so the new handler needs no
  build-config edit.
- **luca-core/handoff needs no changes** — `mailboxDirFor` exported, `HandoffFilterSchema` is exactly
  `{status?, targetRepoPath?}`, and `list` returns `{ok:true,envelopes:[]}` on ENOENT rather than
  throwing, skips unparseable files, and the module's ONLY `mkdirSync` is inside `send`. That last fact
  is what makes anti-02 satisfiable rather than aspirational.

## Verification integrity — clean

Zero `-t` filters. **All four grep literals independently re-verified absent at HEAD** (not taken on
trust): `handoffInboxHook|renderInboxNotice|handoff-inbox` over `packages/` → no matches;
`SessionStart` under `packages/luca-tools/src/hooks` → no matches. Additionally
`install-hooks.test.ts` does not exist (so ac-06 is RED at HEAD) and `toSingleLine` currently matches
only under luca-cli (so ac-17 is RED at HEAD). No `grep -P`/`-z`/PCRE — only two grep criteria total,
everything else is a Bun runtime probe.

**The stage-gate-masking claim is CORRECT** — anti-01/anti-02 assert byte-identity after a
`Bun.spawn` of the handler, and a child process spawned inside a bun test is not routed through the
PreToolUse evaluator, so phase 2's IDLE hoist cannot mask them.

**No collapsed-regex-class hazard.** Every control character in every criterion is built via
`String.fromCharCode(...)`; anti-03 detects control chars by `charCodeAt` comparison rather than a
literal class and asserts a POSITIVE observation (`entry.length === 1`), so it cannot evaporate into a
false CLEAN. The architect caught this class of bug in its own first draft and rewrote it.

---

## BLOCKING

### B1 — `origin.repoName` is rendered but not escaped, and nothing probes it
`plan.md:41-43` lists the escaped set as `intent`, `origin.repoPath`, `target.repoPath`. `plan.md:44-45`
lists the *rendered* set as `id`, `origin repoName + repoPath`, `status`, intent preview. **The two
disagree**: `target.repoPath` is escaped but never rendered; `origin.repoName` is rendered but never
escaped.

Live, not theoretical:
- `HandoffOriginSchema.repoName` is `z.string().min(1)` with no length, path, or control-character
  constraint (`handoff/schemas.ts:87-98`). Phase 2's send-boundary hardening constrained **only**
  `target.repoPath` (`luca-handoff-send.ts:73-89`) — `repoName` got nothing.
- The honest-CLI path stamps `repoName = basename(ctx.cwd)`, which is why it looks safe. But the
  mailbox is machine-global and the phase-1/2 threat model treats on-disk envelopes as untrusted —
  `handoff-transport.ts:99-100` says the escaper "also covers envelopes that predate the constraint or
  were written by another tool." A tampered envelope with a multi-line `repoName` passes
  `HandoffEnvelopeSchema` and reaches the renderer intact.
- **Strictly worse than phase 2's MF-4:** that leak went to CLI stdout a human had to invoke. This one
  goes into the agent's context at turn zero, unprompted, in every session.
- **No criterion catches it.** anti-03 injects into `origin.repoPath` and `intent`, not `repoName`. A
  renderer escaping those two but interpolating `repoName` raw passes every criterion in the plan.

**Fix:** (1) restate the escape rule as "every rendered string field except `id` (regex-constrained) and
`status` (enum) passes through `toSingleLine`" — adding `origin.repoName`, dropping `target.repoPath`
or rendering it. (2) add `repoName:'a'+CR+NL+'EVIL'` to anti-03's fixture, same assertion. One token.

### B2 — D8 claims "degrades silently in every failure mode"; 3 of 5 are probed
`plan.md:48-50` names five modes: missing `.luca/`, missing mailbox dir, corrupt envelope, **empty
`homedir()`**, **malformed stdin**. D8 maps to ac-13/14/15/23 — the first three only.

- **Malformed stdin** unprobed. The precedent handles it (`context-refresher/handler.ts:104-117`);
  nothing pins it here.
- **Empty `homedir()`** unprobed, and it is a *known live residual* filed in phase 2's own audit
  ("Residual empty-homedir path", `audits/code-review.md:120-122`). If `os.homedir()` returns `''`,
  `mailboxDirFor({homedir:''})` yields the RELATIVE path `.luca/handoff`, which `existsSync` resolves
  against `cwd` — so the second fast-exit silently reads a repo-local directory instead of the mailbox.
- **The unexpected-throw catch-all** unprobed. The precedent's `main().then(…, () => process.exit(0))`
  is what stops a stack trace becoming a banner at every session start. Nothing asserts exit 0 on a
  path that actually throws — e.g. mailbox present but unreadable → `{ok:false, reason:'io-error'}`,
  and the plan never says what the handler does with a non-ok list result.

This is phase 2's own do-differently verbatim — probe per *entry path*, not per rule. An error banner
in an unrelated repo at every session start is this phase's worst possible regression, so the claim
must not exceed the evidence.

**Fix:** three cases in the already-planned `handler.test.ts` plus ac-24 (malformed stdin → empty
stdout, exit 0), ac-25 (`HOME=''` → empty stdout, exit 0, and no cwd-relative directory read as a
mailbox), ac-26 (unreadable mailbox → non-ok list swallowed, empty stdout, exit 0). Update D8's mapping.

---

## Advisory

1. **Deliverables map to dead `[SPLIT →]` pointer IDs** — D1→ac-11, D6→ac-08, D14→ac-20 name parent
   tombstones, not live criteria; same in four task verification lines. Repoint to children. (Splitting
   form itself is correct.)
2. **Task 3.1.1 under-specifies the move** — `toSingleLine` also depends on `MAX_RENDERED_LENGTH = 256`,
   a module-private const not in the move set. `tsc` catches it, but name it. Also make explicit that
   `toSingleLine` *already* truncates at 256, so `MAX_INTENT_PREVIEW = 120` sits on top of an existing
   cap — so nobody "simplifies" one away.
3. **Task 3.1.2 missing `Dependencies: 3.1.1`** — it imports `toSingleLine` from the new home.
4. **The withholding control has no probe.** `acceptanceCriteria`/`context`/`result` are withheld from
   the notice — a security control with zero criteria. Add `anti-05`: build an envelope with sentinel
   values in those fields, assert the rendered notice contains neither.
5. **Nothing proves the hook reaches a real consumer repo.** Criteria stop at the settings JSON; the
   `bun build` bundling step and a live harness invocation are untouched. Note `SessionStart` accepts
   source matchers (`startup|resume|clear|compact`) — the matcher-less form is the correct all-sources
   spelling, but if it were wrong the hook would silently never fire and every criterion would still be
   green. Add a checks entry asserting `dist/claude/.claude/hooks/handoff-inbox.ts` exists after
   `bun run build`, and record one manual live-session observation in `execute/summary.md`.
6. **`packages/luca-tools` has no `test` script**, so its four existing `.test.ts` files are already
   orphaned from `bun run --filter '*' test`. New tests would run only via this phase's criteria and
   never again. Add `"test": "bun test"` — one line, inside the fence.
7. **anti-04's baseline is unverified** — HEAD is several commits past phase 2. Run
   `git diff --name-only 8916d6f36 -- packages/luca-core/src/handoff/` at execute start, record
   `fenced=[] control=<n>` in the summary, and rebase the guard onto HEAD's sha if non-empty.
8. **Descriptive criteria depend on a reading verifier** — ac-12–16, ac-21, ac-23.x, ac-08.2, ac-11.2,
   anti-01, anti-02 assert file *contents*, not command exits; execution rides on ac-08.1/ac-11.1. State
   this in the criteria preamble so the verifier opens the files (it structurally cannot run bare `bun`).
9. **ac-21 measures the cheapest path** — it times a `cwd` with no `.luca/`, which exits at fast-exit #1
   and measures little beyond bun startup. Also print the timing for a `.luca/`-initialized repo with a
   10-envelope mailbox as the number backing the 150 ms p50 claim. No new threshold needed.
10. **Two nits** — ac-02 asserts `background === false`, which the schema supplies by default, so it
    passes even if the author omits the field; assert the compiled entry has no `async` key instead.
    ac-09's `'longest x run'` label is cosmetically wrong (`/x+/.exec()` returns the first run); the
    assertion is correct.

Also: no `context.md` for this phase, so the anti-criteria trace to architect-declared constraints
rather than recorded user decisions. Acceptable at MODERATE, but record what was deliberately excluded
(auto-accept, `autoAcceptable` computation, the `describeCompleteHopFailure` seam) under `## Decisions`
so phase 4 inherits it.

## Verified CLEAN

Never-auto-accept is pinned by anti-01 + anti-02 together (envelope bytes and directory listing both
identical after a spawned run), and `list` provably creates nothing. Truncation and count caps are
probed, not assumed (ac-09: 600-char intent → longest `x` run ≤ 120; ac-10: 9 envelopes → exactly 5
occurrences + `+4 more`). Fast-exit ordering is correct — `existsSync(cwd/.luca)` precedes any `$HOME`
touch. `timeoutMs: 5000 → timeout: 5` via `Math.ceil`; `background: false` correctly suppresses the
`async` key, which matters because a backgrounded hook's `additionalContext` cannot reach the session.
Scope fence respected. checks.json baseline is exactly 33 labels, so ac-20.2's append-don't-replace
assertion is checkable.

## Round 1 verdict

**Revise.** B1 and B2 are both small edits with outsized consequence: one closes an unescaped field
that lands in agent context unprompted, the other stops a claim from outrunning its evidence on the
failure mode that would be this phase's worst regression.

---

# Round 2 — **STATUS: APPROVED** · Blocking: 0

Verified by the orchestrator directly rather than a second cold reviewer: this is a MODERATE phase,
both blockers were closed at the root cause, and the remaining checks were mechanical.

## B1 — closed better than proposed

The architect diagnosed the root cause as the **form of the rule**, not a missed field: an enumerated
escape list had already desynced from the render list inside a single drafting pass. It is now stated
positionally — *every rendered string field passes through `toSingleLine` except `id`
(`ENVELOPE_ID_RE`-constrained) and `status` (enum)* — so it cannot desync again. That is a stronger fix
than "add `repoName` to the list", which would have left the failure mode intact.

anti-03's fixture now injects `CR+NL` into `origin.repoName` alongside `repoPath` and `intent`, and
adds a `leaked` arm asserting no bare `EVIL` line — so a renderer escaping two of three goes RED.

## B2 — closed, and ac-25 is fix-sensitive by construction

The constraint is restated as *probe per entry path, not per rule*, naming **seven**: the original five
plus a non-ok `HandoffListResult` and a top-level throw. Task 3.1.4 now specifies the handler contract
explicitly — guard empty homedir *before* use, swallow all 8 failure reasons, wrap `main()` in the
precedent's catch-all.

**ac-25 is the one worth noting.** Its fixture gives the `cwd` a **decoy `.luca/handoff/` holding a
matching pending envelope**. An unguarded handler resolves the relative `.luca/handoff` against `cwd`,
finds the decoy, and emits — so the criterion is RED against the broken implementation rather than
passing trivially on an absent path. This closes the residual phase 2 filed at
`audits/code-review.md:120-122` and never fixed.

## A seventh vacuity instance, self-caught

`ac-02` previously asserted `background === false`, which `HookDefinitionSchema` supplies by default —
so it passed even if the author omitted the field. Rewritten to assert the compiled entry has **no
`async` key**, which is the property that actually matters (a backgrounded hook's `additionalContext`
cannot reach the session).

## Orchestrator verification

| Check | Result |
|---|---|
| `luca plan lint` | 10 advisory warnings, all fixture-setup conjunctions justified in `## Decisions` |
| `ls packages/luca/dist/claude/.claude/hooks/handoff-inbox.ts` | No such file — ac-27 RED at HEAD |
| `grep -c '"test"' packages/luca-tools/package.json` | 0 — ac-28 RED at HEAD |
| Deliverable mapping | repointed off `[SPLIT →]` tombstones; D8 now maps to 9 live criteria |
| anti-03 / anti-05 | both assert POSITIVE observations with fail-closed arms; no absence-only guards |

All 10 advisories applied. Seven confidence entries logged.

## Confidence Gate Resolutions

Gate returned **7 auto · 0 research · 0 ask** — every plan-time decision was high/medium confidence and
auto-routed. No resolutions to append.

## Round 2 verdict

**APPROVED.** Proceed to execute.
