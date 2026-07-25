# Plan Review — Phase 02: `luca handoff` CLI noun with five verbs

Round 1 · Complexity CRITICAL · **STATUS: NEEDS_REVISION** · Blocking: 6 · Advisory: 7

Independent cold reviewer, orchestrator-spawned. Every file:line claim below was verified against the
actual tree by the reviewer this session.

## Adjudication — the architect's self-flagged weak decision

The architect logged the `complete` drive-through (`accepted → in-progress → complete` as two
sequential CAS'd calls) at LOW confidence and asked for reviewer eyes.

**Verdict: SOUND. Keep it. It needs specification, not redesign.**

- `handoff-transitions.ts:18-20` gives `accepted: ['in-progress','rejected','cancelled']` — so
  `accepted → complete` is genuinely illegal and a strict `complete` would be unreachable in a
  five-verb phase. The architect's premise checks out.
- The drive-through does not corrupt the transition table: every edge traversed is legal and
  `updateStatus` remains the sole enforcement point (`create-local-mailbox-transport.ts:366-416`).
- The synthetic `statusHistory` entry is a fidelity cost, not a corruption — `in-progress` is a state
  the receiving repo logically passed through, with a truthful timestamp, and ac-19.1/19.2 make it
  explicit rather than hidden.
- **Neither option requires touching the fenced `packages/luca-core/src/handoff/`.** Only a third
  option — adding `accepted → complete` to the transition table — would breach the fence, and that
  would be a STOP. The plan correctly does not propose it.
- A sixth `start` verb would contradict `anti-04`, which pins `Object.keys(subCommands)` to five.

---

## BLOCKING

### B1 [HIGH] — `ac-24` is vacuous: it passes at HEAD with the fix undone
`plan.md:214`. Sole *behavioral* criterion for D13, the security fix. It cannot fail pre-fix, for two
independent reasons:

1. **Phase 1's own MF-4 fix defeats it.** `classify-write-path.ts:289-296` denies `.luca/handoff/**`
   unconditionally at step 6, explicitly because `opts.homedir` may be falsy (docstring `:280-288`).
   With `HOME` deleted and no `opts.homedir`, step 5 is skipped, `toLucaRelative` recovers
   `.luca/handoff/forged.json`, step 6 returns `denied`, and the hook blocks — **today, without
   `osHomedir`.**
2. `pipelineStep=plan` → PLANNING, and `STAGE_TOOL_MATRIX.PLANNING['code-write'] === false`
   (`stage-tool-matrix.ts:72`), so the write blocks regardless.

`ac-25` (grep `osHomedir`) proves only that the token appears in the file — not that line 110 is wired
or that the fallback works. The security fix therefore has **zero fix-sensitive verification**. This is
phase 1's dominant failure cluster recurring, on a security line.

**Fix:** target the other `HOME_DENIED_SUBDIRS` member, which has no step-6 backstop, at a step where
`code-write` is permitted. `bun -e`: `delete process.env.HOME`; call `handleStageGateHook` with a
`Write` to `${os.homedir()}/.claude/settings.json`, `cwd` = a temp repo whose `.luca/state.json` has
`pipelineStep: 'execute'`, no `opts.homedir`; assert `decision === 'block'`.
Pre-fix: `homedir` undefined → step 5 skipped → not `.luca/` → class `code` →
`EXECUTING['code-write'] === true` → **allow** → criterion FAILS. Post-fix → `denied` → blocks.
Add the mutation check to the plan text: deleting `|| osHomedir()` must turn this probe red.

### B2 [HIGH] — `ac-23` is unrunnable, and 14 criteria rest on an unstated mechanism
`plan.md:213` asserts `resolveHandoffTransport()` "resolves a mailbox path whose prefix equals
`os.homedir()`". But `HandoffTransport` (`transport-contract.ts:66-80`) exposes exactly
`send | list | read | updateStatus` — **no path accessor**. The probe cannot observe what it asserts.
Same class as phase 1's `globalThis.__e` placeholder.

Compounding: `LocalMailboxTransportOptions` is `{ homedir: string }` — required, never implicit
(`create-local-mailbox-transport.ts:67-70`) — and task 2.1.1 hard-wires `osHomedir()`. The plan then
writes `HOME_FAKE=$(mktemp -d)` in ac-08 and expects the envelope under it, but never states how
`HOME_FAKE` reaches the transport. It only works if `os.homedir()` honors `$HOME` — never asserted,
and deliberately broken by ac-23. **ac-08..ac-22 (14 criteria) rest on this unstated mechanism.**

**Fix:** give the resolver an explicit seam, e.g.
`resolveHandoffTransport(opts?: { homedir?: string }): { transport, mailboxDir }` — `mailboxDirFor` is
already exported from `handoff/helpers/mailbox-path-for.ts`, so no luca-core change is needed. Restate
ac-23 against `mailboxDir`, and restate ac-08..ac-22 as invoking the handler with `homedir: HOME_FAKE`.

### B3 [MEDIUM] — the drive-through's partial-failure state is unspecified and destroys the reject path
Task 2.2.2 says nothing about hop-1-succeeds / hop-2-fails. Verified consequences:
- After hop 1 the envelope is `in-progress`, whose successors are `['complete','failed','cancelled']`
  (`handoff-transitions.ts:20`). **`reject` becomes illegal**, and phase 2 ships no verb producing
  `failed` or `cancelled`. A half-failed `complete` permanently removes the ability to reject.
- Hop 2 can fail for a reason the caller cannot pre-empt: the transport returns `corrupt` when `result`
  is absent on `→ complete` (`create-local-mailbox-transport.ts:395-398`). A malformed `--file` payload
  parsed after hop 1 strands the envelope.
- No criterion exercises the partial-failure path.

**Fix:** (a) `HandoffResultSchema.safeParse` the payload **before** hop 1, refusing with exit 1;
(b) on hop-2 failure the error text must name the resulting status and the recovery; (c) add ac-19.3 —
`complete` on an `accepted` envelope with an invalid result payload asserts `isError: true` **and**
on-disk `status` still `"accepted"`. Record that reject-after-hop-1 is intentionally unreachable.

### B4 [MEDIUM] — `anti-02`'s reference sha is chosen post-hoc by the audited party
`plan.md:221` compares against `<wave-1 base sha>`, which task 2.3.2 *records in wave 3* — after all
edits. An anti-criterion whose reference point is selected after the fact by the executor is not a
guard. The tree is clean and the sha is knowable now.
**Fix:** pin the literal `git rev-parse HEAD` value in the plan text before wave 1, or use
`git merge-base HEAD main` (not executor-selectable). Keep the positive control — it is well designed.

### B5 [MEDIUM] — task 2.1.2 inverts the `--file` layering used by all 8 existing payload commands
`readJsonPayload` (`__helpers/run-handler.ts:241`) is called **only** by leaf commands — every call site
verified (`roadmap.ts:60`, `checks.ts:48`, `confidence.ts:160`, `preferences.ts:62`, `todo.ts:94,231`,
`pr-review.ts:62,106,146`, `repo.ts:47`). Zero handlers call it. Two problems with the inversion: it
makes `write-surface/handlers/` depend on `commands/write-surface/__helpers/`, and `readJsonPayload`
calls `process.exit` (`:254,264`) — unacceptable inside a `ToolDescriptor.handler`, whose contract is to
*return* a `WriteResult` (`write-surface.schemas.ts:55-62`).
**Fix:** the leaf calls `readJsonPayload` and passes the parsed object as `payload` to the tool, whose
`inputSchema` is the strip-and-stamp allowlist. Same for `complete`.

### B6 [MEDIUM] — the `autoAcceptable` annotation has no criterion and an ambiguous config source
Task 2.1.3 requires `list` to annotate each envelope with `autoAcceptable`, but its verification line
names only criteria that **count** envelopes — none reads `autoAcceptable`. The feature ships unprobed.
Separately, under `allTargets: true` envelopes target arbitrary repos, so "the receiving repo's
`.luca/config.json`" is ambiguous: `ctx.cwd`'s config, or a filesystem read of each envelope's
`target.repoPath`? Reading config out of arbitrary repo paths is an unmade design decision.
**Fix:** decide and record — recommend `ctx.cwd`'s config only, annotating `autoAcceptable: false` for
envelopes not targeting cwd. Add ac-13.3 pairing a populated `handoff.autoAcceptFrom` against an absent
one (`is-auto-acceptable.ts:29` denies on absent/empty).

---

## Verification-integrity audit — independently confirmed

| Check | Verdict |
|---|---|
| Zero `bun test -t` / `--test-name-pattern` | **CLEAN** |
| Six grep literals absent at HEAD | **CLEAN — independently re-verified, not taken on trust.** `handoffCommand`, `handoff send`, `handoff: new Set`, `luca handoff send`, `osHomedir`, `lucaHandoffSendTool` — all 0 matches. Also confirmed `handoff: new Set` survives a prettier wrap at five verbs |
| No `grep -P` / `-z` / PCRE | **CLEAN** — only `grep -qF` |
| "No output" criteria fail closed | **CLEAN — the lint deviation is JUSTIFIED.** anti-01/02/05 are one assertion plus an instrument check; splitting them reproduces exactly phase 1's failure where a non-executing command reported clean. The linter is pattern-matching ` and `. Ship as-is |
| Probes runnable as written | **NOT CLEAN** — B2 (ac-23), ADV-1 (ac-13/14/15) |

## Four registration points — wave-by-wave green check

The plan's invariant-2 claim is **accurate** (`classify-bash-command-registry.test.ts:91-111` asserts
`LUCA_NOUN_VERBS[noun]` equals `Object.keys(subCommands)` in both directions). All five invariants
checked at both wave boundaries:

- **End of wave 1** (`{send, list}`): inv-1 ✓, inv-2 ✓ (2=2), inv-3 ✓, inv-4 ✓, inv-5 ✓ (`list` is
  exempt via `LUCA_READ_VERBS`; task 2.1.5 supplies `'handoff send'`). **Green.**
- **End of wave 2** (five verbs): inv-2 ✓ (5=5), inv-5 ✓ (task 2.2.4 supplies all four). **Green.**
- **Wave 3 docs deferral is safe** — no test binds the write-surface skill artifact to the CLI surface.
- **All five as `[]` is justified** — `workflow reset`, `confidence log`, `state advance`,
  `snapshot create/diff`, `budget check` are all `[]` (`step-artifacts.ts:102-111`), and `luca-write`
  is allowed in every non-IDLE coarse phase anyway, so `[]` adds no exposure.

## Advisory

- **ADV-1 [MED]** ac-13.1/13.2/14/15.1/15.2 say `list` "returns exactly N envelopes", but a handler
  returns `WriteResult` text blocks. Specify `json: true` and `JSON.parse(result.content[0].text)`.
- **ADV-2 [MED]** The strip-and-stamp allowlist is **complete** (13 fields checked against
  `schemas.ts:187-226`; `result` falls outside and is dropped; `target.repoPath` is caller-supplied by
  design — it is the address). But ac-10/ac-11.1 only probe `status` and `id`. Add a probe that a
  payload carrying `statusHistory` and `result` yields on-disk `statusHistory: []` / `result: undefined`
  — a fabricated audit trail is the more dangerous forge.
- **ADV-3 [MED]** `--expected-updated-at` introduces no new race class (`transport-contract.ts:40-51`
  already documents optimistic CAS and possible lost updates), but in default mode the token is read
  microseconds before the write, so the guard degrades to last-writer-wins and the operator's *intent*
  is no longer enforced. Only the override path is probed. Record the semantics.
- **ADV-4 [LOW]** No criterion probes an explicit `targetRepo` override; `targetRepo` + `allTargets`
  precedence unspecified.
- **ADV-5 [LOW]** All handler tests land in one file; precedent is per-handler
  `write-surface/handlers/luca-<noun>-<verb>.test.ts` (e.g. `luca-snapshot-create.test.ts`, which also
  asserts `allowedPhases`). Split or state the deviation.
- **ADV-6 [LOW]** anti-01/anti-05 lint plan.md text, not executor behavior — worth having, but they
  cannot catch an executor running a `-t`-filtered command ad hoc. Note the limit.
- **ADV-7 [LOW]** ac-23 uses `require('node:os')` inside `bun -e`; prefer ESM `import`.

## Checked and CLEAN (recorded as evidence)

Wave/dependency ordering acyclic; no same-file concurrent-edit hazard (each shared file is touched in
wave 1 and again in wave 2, never twice within one wave); D1-D17 all map to live ac-IDs and never to a
`[SPLIT →]` parent; ID stability held with parent tombstones retained; five anti-criteria all in
`MUST NOT` form and traceable to context.md L4, the scope fence, and phase-1 failure modes; ac-19.1/19.2
are consistent with `updateStatus` appending exactly one `statusHistory` entry per call
(`create-local-mailbox-transport.ts:410-415`) and would go red under a `start`-verb design, which is the
correct sensitivity; `--auto` semantics match `is-auto-acceptable.ts:29-33`; anti-04's probe is runnable.

## Round 1 verdict

**Revise.** B1 and B2 first — both are phase 1's root cause recurring, and until they land the security
fix and 14 of 26 criteria have no fix-sensitive evidence. Keep the `complete` drive-through design.

---

# Round 2 — **STATUS: APPROVED** · CONVERGED · Blocking: 0 · Advisory: 9

Independent cold reviewer, fresh context. All six round-1 blockers landed and verify.

## B1 traced independently — the security criterion is no longer vacuous

The reviewer did not accept the architect's reasoning; it walked all eight classifier steps for a
`Write` to `${homedir()}/.claude/settings.json` with `HOME` deleted, no `opts.homedir`, cwd = a temp
repo at `pipelineStep: 'execute'`:

1. `handle-stage-gate-hook.ts:110` → `homedir = undefined`
2. Steps 1-4 miss (`/Users/...` matches neither `SYSTEM_DIR_PATTERN` nor the darwin tmpdir prefixes);
   **step 5 skipped** because `opts.homedir` is falsy (`classify-write-path.ts:263`); step 6's
   `.luca/handoff` unconditional deny is unreachable (no `.luca/` segment); → **`code`**
3. `code-write` × `EXECUTING` → `stage-tool-matrix.ts:84-85` is `true` → **allow → RED**
4. Post-fix `homedir` resolves → step 5 hits `.claude` → `denied` → block. Deleting `|| osHomedir()`
   returns it to (3). **Mutation-sensitive as claimed.**

Four candidate fourth-vacuity-sources checked and ruled out: owner stamping is gated on
`toolName === 'Bash'`; the bystander exemption needs both `ownerSessionId` and `sessionId` (a fresh
temp state has neither) and sits *after* `pathBlockReason` anyway; `artifactPathGate` only runs for
`planning-*` classes; the ephemeral short-circuit needs an OS-temp *target*, not an OS-temp cwd. The
one residual — a probe that forgets to write `.luca/state.json` → IDLE → allow — fails **closed**.

## B2-B6 verdicts

- **B2** — `ToolContext` is `{ cwd: string }` (`write-surface.schemas.ts:10-12`); an optional
  `homedir?` keeps `runWriteHandler`'s `tool.handler(parsed.data, { cwd })` type-clean and
  production-unset. ac-30 works: `rejectUnknownFlags` builds its allowlist from `cmd.args` keys plus
  `help`/`version` only. ac-23 is now observable via the exported `mailboxDirFor`.
- **B3** — ac-19.3 is fix-sensitive (`{ outcome: 'nope' }` fails both the enum and the required
  `phaseSlug`); parse-before-hop-1 is in the **task text**, not only the criterion; reject-unreachability
  is recorded in `## Decisions`.
- **B4** — sha pinned. Self-protecting: the positive control proves git and the ref resolved, and a
  sha predating the handoff module would list every handoff file → fails loudly. Fails closed.
- **B5** — layering restored; no handler calls `readJsonPayload`. Matches all 8 precedents.
- **B6** — decision recorded (`ctx.cwd`'s config only; reads out of a self-declared `target.repoPath`
  rejected as unauthenticated) and ac-13.3 is a real paired probe.

## New criteria audit (ac-27..ac-32, ac-13.3, ac-19.3)

All eight runnable as written and all eight fail with the work undone. Grep literals independently
re-verified absent at HEAD this round: `handoffCommand`, `handoff send`, `handoff: new Set`,
`osHomedir`, `handoff` in the write-surface skill, `resolveHandoffTransport`,
`describeCompleteHopFailure`, `formatHandoffFailure`.

Scope fence **HELD, no STOP** — the `autoAcceptFrom` read needs no luca-core change because
`loadCurrentConfig` is already exported and returns an opaque record. `packages/luca-core/src/handoff/`
untouched. Wave/dependency correctness clean after the revision; ID stability held (ac-23/ac-24 kept
their IDs *and meanings* while their probes were retargeted, annotated inline).

## Advisory — carried into execution, no third round

1. **[highest carry] `origin` stamping can make 6+ criteria unrunnable.** `HandoffOriginSchema`
   requires `runId` and `phaseSlug` at `min(1)` (`handoff/schemas.ts:92-95`), but a bare `mkdtemp`
   probe repo has neither → the envelope fails `safeParse` inside `send` → `corrupt`, taking ac-08/09/
   10/11.x/12/27 and every send-prefixed probe with it. Record explicit fallbacks or an explicit
   refusal, and extend the probe convention to seed `.luca/state.json` with a `sessionId` and enough
   roadmap state for the slug to resolve.
2. **`targetRepo` default vs ac-29 are in tension.** A Zod `.default()` cannot see `ctx`, and adding
   one destroys the "explicitly supplied" signal that ac-29's mutual-exclusion refusal needs. Use
   `z.string().optional()` with no schema default; refuse on
   `targetRepo !== undefined && allTargets === true`; apply the `ctx.cwd` fallback in the handler
   *after* that check.
3. **ac-30/ac-26 invoke the BUILT CLI** (`packages/luca/bin/luca.js:2` runs `../dist/index.mjs`), so
   `bun run build` must precede them. Fails closed, so this is a stall not a false green.
4. **Handler→resolver wiring is only implied.** If the executor hard-wires `osHomedir()` inside the
   handlers, the probes write envelopes into the developer's **real** `~/.luca/handoff/`. State the
   wiring explicitly in the handler tasks.
5. `ac-22.1`'s `conflict` literal is not in the transport's message text — only the machine `reason`
   field carries it. Specify that `formatHandoffFailure` renders the reason token verbatim.
6. Name the config-read mechanism: `loadCurrentConfig` + a local Zod section schema (precedent
   `resolve-run-budget.ts:131`). This is what keeps the scope fence intact.
7. ac-31 is compound; ac-11.2 is near-tautological if `writtenPath` is probe-computed (ac-08 already
   proves the location).
8. D14's mapping to anti-02 does not observe the deferral record — drop it or add a text probe.
9. **Where the criteria run:** ~25 `bun -e` probes plus `bun test` are blocked at `pipelineStep=verify`
   (bare `bun` denied; `checks run` is `['execute','checks']`). State that the set executes at
   `execute`/`checks`. Also task 2.1.4 declares no `Dependencies` despite importing 2.1.2/2.1.3's tools.

## Round 2 verdict

**APPROVED.** B1-B6 all landed and all verify. The security criterion is mutation-sensitive, traced
independently rather than taken on trust. Nine advisories carry into execution.

---

## Confidence Gate Resolutions

Gate returned **10 auto · 0 research · 1 ask**.

- **[gate-ask] `complete` drives `accepted → in-progress → complete`** (task
  `complete-drives-in-progress`, low confidence, `requirement-ambiguous`) — **CONFIRMED by the user.**
  Two sequential CAS'd `updateStatus` calls; `statusHistory` records `[accepted, in-progress, complete]`;
  the verb set stays at five. Alternatives declined: a sixth `start` verb (expands the stated goal and
  contradicts anti-04's five-verb pin) and a strict `complete` (unreachable this phase — nothing parks
  an envelope at `in-progress`, so the verb would ship inert).
  This matches the round-1 cold-review adjudication, which reached the same conclusion independently:
  every traversed edge is legal, `updateStatus` remains the sole enforcer, and the synthetic history
  entry is a fidelity cost rather than a corruption. Partial-failure handling is specified per B3 —
  payload parsed before hop 1, hop-2 failure names the resulting status and the recovery, and
  reject-after-hop-1 is recorded as intentionally unreachable.
