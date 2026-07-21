---
id: 02-luca-handoff-cli-noun-with-five-verbs
title: luca handoff CLI noun with five verbs
wave: 3
tasks: 14
---

# Plan: `luca handoff` CLI noun with five verbs

> Revision 2 — addresses plan-review round 1 (B1-B6, ADV-1..7). The `complete` drive-through is KEPT
> (reviewer-adjudicated SOUND), now specified. anti-01/02/05 stay conjunctive per the reviewer.

## Objective

Make the phase-1 handoff foundation reachable: add the `luca handoff` noun with
`send | list | accept | complete | reject`, landing ALL FOUR registration points in this phase, plus
the deferred luca-cli half of the `homedir` fail-open (phase-1 MF-4).

## Context

- Phase 1 is committed at **`8916d6f36`** — the pinned reference sha for `anti-02` (B4).
  `@alecsibilia/luca-core/handoff` exports the schema, transitions, transport contract, local mailbox
  transport, `mailboxDirFor`, `generateEnvelopeId`, `isAutoAcceptable`.
  **`packages/luca-core/src/handoff/` is NOT modified here.**
- Reference implementation is `luca state advance`: leaf in `commands/write-surface/<noun>.ts` (owns
  `rejectUnknownFlags` + `readJsonPayload`) → `runWriteHandler` → `ToolDescriptor` in
  `write-surface/handlers/` → barrel `write-surface/index.ts`.
- `classify-bash-command-registry.test.ts` invariant 2 asserts `LUCA_NOUN_VERBS.handoff` EQUALS the
  citty `subCommands` keys, so every wave moves both in lockstep — this sets the wave boundaries.
- **Grep-literal HEAD-absence verified** (L1): the six literals used below each ran as
  `grep -rn <literal> <dir>` at HEAD and exited 1 — reviewer re-confirmed. No new grep this revision.

## Phases

### Phase 2: luca handoff CLI noun

#### Wave 1: Tracer bullet — `send` + `list` end-to-end through all four registration points

- [ ] **Task 2.1.1**: Transport seam (B2): `resolveHandoffTransport(opts?: { homedir?: string })` returns
  `{ transport, mailboxDir }` (via the exported `mailboxDirFor`), defaulting to `osHomedir()`; add
  optional `homedir?` to `ToolContext` (`runWriteHandler` never sets it → no `--homedir` flag); add
  `formatHandoffFailure(f)` over the 8-member reason union.
  - Files: `write-surface/helpers/handoff-transport.ts`, `write-surface/__schemas/write-surface.schemas.ts`
  - Verification: ac-07, ac-23, ac-30
- [ ] **Task 2.1.2**: `lucaHandoffSendTool`. Input is `payload`, already parsed (the leaf owns the file
  read, B5). `inputSchema` IS the strip-and-stamp allowlist — accepts only `target`, `intent`,
  `acceptanceCriteria`, `context`, `callback`; STAMPS `schemaVersion`, `id`, `createdAt`/`updatedAt`,
  `status: 'pending'`, `statusHistory: []`, `origin` (cwd + `sessionId` + phase slug + branch).
  - Files: `write-surface/handlers/luca-handoff-send.ts`
  - Verification: ac-08, ac-09, ac-10, ac-11.1, ac-11.2, ac-12, ac-27
- [ ] **Task 2.1.3**: `lucaHandoffListTool`. Inputs `status`, `targetRepo` (DEFAULT `ctx.cwd`),
  `allTargets`, `json`; `targetRepo` + `allTargets` together is refused. Annotates `autoAcceptable`
  from `ctx.cwd`'s `handoff.autoAcceptFrom` ONLY, `false` for non-cwd targets (B6).
  - Files: `write-surface/handlers/luca-handoff-list.ts`
  - Verification: ac-13.1, ac-13.2, ac-13.3, ac-14, ac-15.1, ac-15.2, ac-28, ac-29
- [ ] **Task 2.1.4**: Leaf group `handoffCommand` carrying `send` + `list` only; `send` declares
  `--file`, calls `readJsonPayload`, passes the result as `payload`. Barrel exports; `handoff` in
  `CLI_SUBCOMMANDS` (reg. point 1).
  - Files: `commands/write-surface/handoff.ts`, `write-surface/index.ts`, `cli.ts`
  - Verification: ac-01, ac-05, ac-30
- [ ] **Task 2.1.5**: Reg. points 2+3 for wave-1 verbs: `'handoff send': []` + `'handoff list': []` in
  `WRITE_COMMAND_PHASES`; `handoff: new Set(['send', 'list'])` in `LUCA_NOUN_VERBS` (`list` is already
  a `LUCA_READ_VERBS` member; `send` deliberately is not).
  - Files: luca-core `state/configs/step-artifacts.ts`, `hook/helpers/classify-bash-command.ts`
  - Verification: ac-02, ac-03, ac-05
  - Dependencies: 2.1.4
- [ ] **Task 2.1.6**: Close the luca-cli half of the `homedir` fail-open (phase-1 MF-4): import
  `homedir as osHomedir` from `node:os`; line 110 becomes `opts.homedir || process.env.HOME ||
  osHomedir()`. **Mutation check: deleting `|| osHomedir()` must turn ac-24 red.**
  - Files: `hook/helpers/handle-stage-gate-hook.ts`
  - Verification: ac-24, ac-25, anti-03
- [ ] **Task 2.1.7**: Per-handler tests (ADV-5) for `send` and `list`, each asserting `allowedPhases`
  is undefined, plus the no-`HOME` stage-gate test. Read the envelope back off disk.
  - Files: `handlers/luca-handoff-{send,list}.test.ts`, `hook/helpers/handle-stage-gate-hook.test.ts`
  - Verification: ac-06, ac-24, ac-32
  - Dependencies: 2.1.2, 2.1.3, 2.1.6

#### Wave 2: Widen — the three lifecycle verbs

- [ ] **Task 2.2.1**: `lucaHandoffAcceptTool` (`pending -> accepted`): read the envelope, take
  `updatedAt` as the CAS token, `updateStatus`. `expectedUpdatedAt` overrides that token; `auto`
  refuses unless `isAutoAcceptable`; bare accept is human acceptance (path recorded in `note`).
  - Files: `write-surface/handlers/luca-handoff-accept.ts`
  - Verification: ac-16, ac-17.1, ac-17.2, ac-18.1, ac-18.2, ac-22.1, ac-22.2
- [ ] **Task 2.2.2**: `lucaHandoffCompleteTool`. `HandoffResultSchema.safeParse` the payload **before**
  hop 1 (B3), refusing on failure. From `accepted` it drives `accepted -> in-progress -> complete` as
  two sequential CAS'd calls (second token from hop 1's returned envelope); from `in-progress`, one.
  Export `describeCompleteHopFailure(status)` naming the resulting status plus the re-run recovery.
  - Files: `write-surface/handlers/luca-handoff-complete.ts`
  - Verification: ac-19.1, ac-19.2, ac-19.3, ac-20.1, ac-20.2, ac-31
- [ ] **Task 2.2.3**: `lucaHandoffRejectTool` (`-> rejected`); optional `reason` stored verbatim as the
  `statusHistory` note — UNTRUSTED, echoed only, never interpolated.
  - Files: `write-surface/handlers/luca-handoff-reject.ts`
  - Verification: ac-21.1, ac-21.2
- [ ] **Task 2.2.4**: Widen all registries in lockstep: three subCommands on `handoffCommand`
  (`complete` declares `--file` and calls `readJsonPayload`), three tools in the barrel, three verbs
  in `LUCA_NOUN_VERBS.handoff`, and `'handoff accept' | 'handoff complete' | 'handoff reject': []`.
  - Files: `commands/write-surface/handoff.ts`, `write-surface/index.ts`,
    `hook/helpers/classify-bash-command.ts`, luca-core `state/configs/step-artifacts.ts`
  - Verification: ac-05, anti-04
  - Dependencies: 2.2.1, 2.2.2, 2.2.3
- [ ] **Task 2.2.5**: Per-handler tests for accept/complete/reject, each asserting `allowedPhases` is
  undefined, covering the stale-token conflict and the invalid-payload no-hop path.
  - Files: `handlers/luca-handoff-{accept,complete,reject}.test.ts`
  - Verification: ac-06, ac-32
  - Dependencies: 2.2.4

#### Wave 3: Registration point 4 + gates

- [ ] **Task 2.3.1**: Add a `### handoff` section to the luca-write-surface skill: all five verbs, the
  `.luca/tmp/<kebab>.json` payload shape, human-vs-`--auto`, the cwd target default, and that
  `autoAcceptable` is always about `ctx.cwd`.
  - Files: `packages/luca-tools/src/artifacts/skills/luca-write-surface/index.ts`
  - Verification: ac-04
- [ ] **Task 2.3.2**: Run the full gate set; record results in `execute/summary.md`.
  - Files: `.luca/phases/02-luca-handoff-cli-noun-with-five-verbs/execute/summary.md`
  - Verification: ac-07, ac-26, anti-01, anti-02, anti-05
  - Dependencies: 2.3.1

## Risks & Mitigations

- **Registry straddle.** Invariant 2 is exact-equality; mitigated by keeping 2.1.5 / 2.2.4 atomic.
- **Confused-deputy via `send`.** Mitigated by 2.1.2's strip-and-stamp inputSchema (ac-10, ac-11.x, ac-27).
- **Stranded `in-progress` envelope.** Pre-validation removes the preemptable cause; a residual
  `io-error` at hop 2 is surfaced with its recovery (ac-31).
- **Unbounded `bun test` froze this machine.** Every test criterion is `timeout 120 bun test <paths>`.

## Decisions (all 2026-07-21)

- All five verbs are phase-agnostic (`[]`) in `WRITE_COMMAND_PHASES`; phase 3's SessionStart hook
  fires at `pipelineStep=idle`. Reviewer confirmed `[]` adds no exposure.
- CLI reads the CAS token internally; `expectedUpdatedAt` is an optional override. **Semantics
  (ADV-3):** in default mode the token is read microseconds before the write, so the guard degrades to
  last-writer-wins over whichever edge is legal from the freshly-read status — it prevents acting on a
  *stale* status, not concurrent overwrite. No new race class beyond `transport-contract.ts:40-51`.
- `complete` drives `accepted -> in-progress -> complete` (reviewer-adjudicated SOUND); payload
  validated BEFORE hop 1. **`reject` after a half-failed `complete` is intentionally unreachable** —
  `in-progress` has no edge to `rejected` and phase 2 ships no `failed`/`cancelled` verb; recovery is
  re-running `complete`, and rollback is impossible (no edge back to `accepted`).
- `remove`/`prune` is DEFERRED to phase 5: it needs an edit inside the fenced handoff module, and
  phase 5 adds the second implementer that would bear the cost.
- The stage-gate `homedir` fallback uses `||` not `??`, so an EMPTY-string `HOME` also falls back.
  `homedir` is threaded through `ToolContext`, NOT a tool input, so no `--homedir` flag exists (ac-30).
- `autoAcceptable` comes from `ctx.cwd`'s config only; reading config out of a self-declared
  `target.repoPath` would be an unauthenticated read driven by untrusted data. `targetRepo` +
  `allTargets` together are REFUSED — either precedence silently discards an explicit instruction.
- **Lint deviation, upheld by the reviewer:** `anti-01`/`anti-02`/`anti-05` stay conjunctive — the
  second conjunct is the FAIL-CLOSED positive control, and splitting reproduces phase 1's failure where
  a non-executing command reported clean. **Limit (ADV-6):** they lint plan.md TEXT, so an executor
  running a name-filtered command ad hoc stays a review responsibility.

## Deliverables

- **D1**: Registration point 1 — `handoff` in `CLI_SUBCOMMANDS` → ac-01, ac-05
- **D2**: Registration point 2 — one `WRITE_COMMAND_PHASES` entry per verb, all `[]` → ac-02, ac-05
- **D3**: Registration point 3 — `LUCA_NOUN_VERBS.handoff`, `list` already a read verb → ac-03, ac-05
- **D4**: Registration point 4 — model-facing docs in the luca-write-surface skill → ac-04
- **D5**: `handoff send --file` builds, validates and sends an envelope → ac-08, ac-09, ac-12
- **D6**: `send` stamps `schemaVersion`, ignores caller-supplied fields → ac-10, ac-11.1, ac-11.2, ac-27
- **D7**: `handoff list` is a read verb defaulting to the current repo as target, overridable → ac-13.1, ac-13.2, ac-14, ac-15.1, ac-15.2, ac-28, ac-29
- **D8**: `handoff accept` performs `pending -> accepted` → ac-16
- **D9**: The allowlist vs explicit-human distinction is surfaced on accept and on list → ac-13.3, ac-17.1, ac-17.2, ac-18.1, ac-18.2
- **D10**: `handoff complete --file` reaches `complete`, `result` payload attached → ac-19.1, ac-19.2, ac-20.1, ac-20.2
- **D11**: `handoff reject [--reason]` reaches `rejected`, reason recorded → ac-21.1, ac-21.2
- **D12**: CAS decision (token read internally, override available) is enforced → ac-22.1, ac-22.2
- **D13**: `handle-stage-gate-hook.ts:110` falls back to `os.homedir()` → ac-24, ac-25
- **D14**: `remove`/`prune` deferred, recorded in `## Decisions` → anti-02
- **D15**: Registry-completeness tests pass → ac-05
- **D16**: Gates — typecheck, bounded tests, `luca checks run` → ac-06, ac-07, ac-26
- **D17**: Scope fence held — `packages/luca-core/src/handoff/` untouched → anti-02
- **D18**: The drive-through's partial-failure path is specified, probed → ac-19.3, ac-31
- **D19**: The `homedir` test seam is real, not CLI-reachable → ac-23, ac-30
- **D20**: Handler tests follow the per-handler precedent, assert phase-agnosticism → ac-32

## Verification Criteria

> Probe convention (ADV-1, ADV-7, B2): every `bun -e` probe uses ESM `import { homedir } from 'node:os'`,
> invokes `tool.handler(args, { cwd, homedir: HOME_FAKE })` where `HOME_FAKE = mkdtempSync(...)`, and
> prints the observed value. `list` probes pass `json: true` and read `JSON.parse(result.content[0].text)`.

- **ac-01**: `grep -qF "handoffCommand" packages/luca-cli/src/cli.ts` exits 0 (literal absent at HEAD).
- **ac-02**: `grep -qF "handoff send" packages/luca-core/src/state/configs/step-artifacts.ts` exits 0 (literal absent at HEAD).
- **ac-03**: `grep -qF "handoff: new Set" packages/luca-cli/src/hook/helpers/classify-bash-command.ts` exits 0 (literal absent at HEAD).
- **ac-04**: `grep -qF "luca handoff send" packages/luca-tools/src/artifacts/skills/luca-write-surface/index.ts` exits 0 (literal absent at HEAD).
- **ac-05**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` exits 0.
- **ac-06**: `timeout 120 bun test` over the five explicit paths `packages/luca-cli/src/write-surface/handlers/luca-handoff-{send,list,accept,complete,reject}.test.ts` exits 0.
- **ac-07**: `bunx --bun tsc --noEmit` exits 0.
- **ac-08**: `bun -e` probe: invoke the `send` handler passing `homedir: HOME_FAKE`; `existsSync(join(HOME_FAKE, '.luca/handoff', id + '.json'))` is `true`.
- **ac-09**: Same probe: the on-disk `schemaVersion` equals `1`.
- **ac-10**: Same probe, payload carrying `"status": "complete"`: the on-disk `status` reads exactly `"pending"`.
- **ac-11**: [SPLIT → ac-11.1, ac-11.2]
- **ac-11.1**: Probe, payload carrying `"id": "../../evil"`: the on-disk `id` matches `/^[A-Za-z0-9_-]+$/`.
- **ac-11.2**: Same probe: `dirname(writtenPath)` equals `join(HOME_FAKE, '.luca/handoff')`.
- **ac-12**: Same probe: the on-disk `origin.repoPath` equals the `cwd` passed in `ToolContext`.
- **ac-13**: [SPLIT → ac-13.1, ac-13.2, ac-13.3]
- **ac-13.1**: `bun -e` probe: send two envelopes carrying different `target.repoPath`; `list` (no target input, `json: true`) from `cwd = A` yields a parsed array of length exactly 1.
- **ac-13.2**: Same probe: that entry's `target.repoPath` equals A.
- **ac-13.3**: `bun -e` probe: `.luca/config.json` at `cwd` carrying `handoff.autoAcceptFrom: [<origin.repoPath>]` yields a parsed entry whose `autoAcceptable` is `true`; the same probe run with that key absent yields `false`.
- **ac-14**: Same probe: `list` passed `allTargets: true`, `json: true` yields a parsed array of length exactly 2.
- **ac-15**: [SPLIT → ac-15.1, ac-15.2]
- **ac-15.1**: Same probe: `list` passed `status: 'accepted'`, `allTargets: true`, `json: true` yields a parsed array of length exactly 0.
- **ac-15.2**: Same probe: `list` passed `status: 'pending'`, `allTargets: true`, `json: true` yields a parsed array of length exactly 2.
- **ac-16**: `bun -e` probe: `accept` on a pending envelope, then re-read from disk — `status` equals `"accepted"`.
- **ac-17**: [SPLIT → ac-17.1, ac-17.2]
- **ac-17.1**: Probe passing `auto: true`, `cwd` config carrying NO `handoff.autoAcceptFrom`: the result is `isError: true`.
- **ac-17.2**: Same probe: the on-disk `status` is still `"pending"`.
- **ac-18**: [SPLIT → ac-18.1, ac-18.2]
- **ac-18.1**: Probe passing `auto: true`, `origin.repoPath` present in `cwd`'s `handoff.autoAcceptFrom`: the result is not an error.
- **ac-18.2**: Same probe: the on-disk `status` equals `"accepted"`.
- **ac-19**: [SPLIT → ac-19.1, ac-19.2, ac-19.3]
- **ac-19.1**: `bun -e` probe: accept then `complete` an envelope; the on-disk `statusHistory` has length 3.
- **ac-19.2**: Same probe: `statusHistory[1].status` equals `"in-progress"`.
- **ac-19.3**: `bun -e` probe: `complete` on an `accepted` envelope, payload failing `HandoffResultSchema` (e.g. `{ outcome: 'nope' }`), yields `isError: true` while the on-disk `status` is still `"accepted"` — proving hop 1 never ran.
- **ac-20**: [SPLIT → ac-20.1, ac-20.2]
- **ac-20.1**: Same probe: the on-disk `result.outcome` equals the value supplied in the payload.
- **ac-20.2**: Same probe: the on-disk `result.phaseSlug` equals the value supplied in the payload.
- **ac-21**: [SPLIT → ac-21.1, ac-21.2]
- **ac-21.1**: `bun -e` probe: `reject` passing `reason: "declined by operator"`; the on-disk `status` equals `"rejected"`.
- **ac-21.2**: Same probe: the last `statusHistory` entry's `note` equals `"declined by operator"` verbatim.
- **ac-22**: [SPLIT → ac-22.1, ac-22.2]
- **ac-22.1**: `bun -e` probe: `accept` passing `expectedUpdatedAt: "1999-01-01T00:00:00.000Z"` yields `isError: true` whose text contains `conflict`.
- **ac-22.2**: Same probe: the on-disk `status` is still `"pending"`.
- **ac-23**: `bun -e` probe: `resolveHandoffTransport().mailboxDir` strictly equals `join(homedir(), '.luca/handoff')` using ESM-imported `homedir` — a printed positive observation over a real returned value, replacing revision 1's unobservable path assertion (B2).
- **ac-24**: `bun -e` probe: `delete process.env.HOME`; call `handleStageGateHook` with a `Write` to `${homedir()}/.claude/settings.json`, `cwd` = a temp repo whose `.luca/state.json` carries `pipelineStep: 'execute'`, passing NO `opts.homedir`; `result.decision` equals `'block'`. Fix-sensitive by construction (B1): pre-fix `homedir` is undefined → the step-5 home-deny is skipped → the path is not `.luca/` so no step-6 backstop applies → class `code` → `EXECUTING['code-write'] === true` → allow → RED. Deleting `|| osHomedir()` must turn it red again.
- **ac-25**: `grep -qF "osHomedir" packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts` exits 0 (literal absent at HEAD).
- **ac-26**: `luca checks run --file .luca/tmp/checks.json` exits 0.
- **ac-27**: `bun -e` probe: `send` given a payload carrying a fabricated `statusHistory` array plus a `result` object yields an on-disk `statusHistory` of length exactly 0 (ADV-2).
- **ac-28**: `bun -e` probe: `list` passed an explicit `targetRepo` equal to envelope B's target, `json: true`, from `cwd = A` yields a parsed array whose single entry's `target.repoPath` equals B.
- **ac-29**: `bun -e` probe: `list` passed BOTH `targetRepo` and `allTargets: true` yields `isError: true`.
- **ac-30**: `luca handoff send --file <p> --homedir /tmp/x` exits 1 with text naming the unknown flag `--homedir`.
- **ac-31**: `bun -e` probe: `describeCompleteHopFailure('in-progress')` returns text containing the substring `in-progress`, plus text containing the substring `luca handoff complete`.
- **ac-32**: `bun -e` probe: `[send,list,accept,complete,reject].map((t) => t.allowedPhases)` deep-equals `[undefined, undefined, undefined, undefined, undefined]`.

### Anti-criteria (regression guards)

- **anti-01**: MUST NOT verify by test-name filter. Probe (fails closed): `bun -e` reads `plan.md`, throws if the file is empty, prints the count of criteria lines matching `/^- \*\*ac-/` (must be > 0), and asserts that the count of those lines matching `/(--test-name-pattern|\stest\s+-t\s)/` is exactly 0.
- **anti-02**: MUST NOT modify `packages/luca-core/src/handoff/`. Probe (fails closed): `bun -e` runs `git diff --name-only 8916d6f36 -- packages/luca-core/src/handoff/` and asserts the result is `[]`, AND runs the same command for `packages/luca-cli/src` asserting a NON-empty result — proving git and the pinned sha actually resolved.
- **anti-03**: MUST NOT weaken the `~/.luca/` home-deny. Probe: `bun -e` asserts `classifyWritePath(join(homedir(), '.luca/handoff/x.json'), { homedir: homedir() }).class === 'denied'` (positive observation, printed).
- **anti-04**: MUST NOT ship a sixth verb. Probe: `bun -e` imports `handoffCommand` and asserts `Object.keys(subCommands).sort()` deep-equals `['accept','complete','list','reject','send']` (positive observation, printed).
- **anti-05**: MUST NOT depend on PCRE or null-separated grep. Probe (fails closed): `bun -e` reads `plan.md`, asserts the count of `/^- \*\*ac-/` lines containing the token `grep` is > 0, and asserts the count of those lines matching `/grep[^\n]*\s-[A-Za-z]*[Pz]/` is exactly 0.
