---
id: 01-handoff-envelope-schema-and-local-mailbox-transport
title: Handoff envelope schema and local mailbox transport
wave: 3
tasks: 15
---

# Plan: Handoff envelope schema and local mailbox transport

## Objective

Build the luca-core foundation for cross-repo handoff: versioned envelope schema, status transition
registry, and a `HandoffTransport` interface with a `LocalMailboxTransport` over `~/.luca/handoff/`
plus a `RemoteTransport` stub. No CLI noun, no daemon, no skills.

## Context

Design is LOCKED by `context.md` (L1-L4, E1-E4, D1-D3) and `research.md`. Plan the work only. Correction found while planning: `classify-write-path.ts` + test live in
**luca-core** (`src/luca-dir/helpers/`), not luca-cli — phase 1 touches zero luca-cli and zero luca-tools files. `generateRunId` supplies the id charset; no ULID dep.
Every behavior pairs a whole-file runtime gate with a source-presence grep; name-filtered test runs are banned as probes (they exit 0 on zero matches — anti-07). Every grep
literal was checked ABSENT at HEAD: `packages/luca-core/src/handoff/` does not exist, so every literal targeting it fails today; `/.luca/handoff/` returns 0 matches in
`classify-write-path.test.ts` (bare `handoff` matches twice there — :94, :184 — so it is unusable). The four sole-evidence locked decisions also get direct runtime probes
(ac-35..ac-38), since a source grep plus a whole-file run both pass on an empty test body.

## Phases

### Phase 1: luca-core handoff module

#### Wave 1: Foundation — types, registry, paths, public export

- [ ] **Task 1.1.1**: Create `constants.ts` with `HANDOFF_DIR_NAME`, `HANDOFF_SCHEMA_VERSION`, `ENVELOPE_ID_RE` (`/^[A-Za-z0-9_-]+$/`), `MAILBOX_DIR_MODE = 0o700`.
  - Files: `packages/luca-core/src/handoff/constants.ts`
  - Verification: ac-01

- [ ] **Task 1.1.2**: Create `schemas.ts`. `HandoffStatus` enum const + shadowing type; `HandoffEnvelopeSchema` (research field table, every default in the schema, plus
      **required `target.repoPath`** — the mailbox is machine-global and flat, so envelopes must be addressed); `HandoffResultSchema` `{ outcome, phaseSlug, notes, evidence }`; `HandoffFilterSchema` `{ status?, targetRepoPath? }`. Docstrings MUST record that `intent`/`acceptanceCriteria` are untrusted input never interpolated into instruction text (context D3), and that `origin.repoPath` is self-declared.
      The failure `reason` union is EXHAUSTIVELY `'not-found' | 'corrupt' | 'illegal-transition' | 'conflict' | 'duplicate-id' | 'schema-version-mismatch' | 'io-error' | 'not-implemented'` — the executor invents no members. `.superRefine` cross-field invariants; unknown keys stripped; `schemaVersion` mismatch rejected, never folded.
      Test block names MUST contain `defaults`, `invariant`, `unknown keys`, `schemaVersion`, `reason union`.
  - Files: `packages/luca-core/src/handoff/schemas.ts`, `schemas.test.ts`
  - Verification: ac-05, ac-06, ac-07, ac-08, ac-23, ac-26, ac-29, ac-30
  - Dependencies: 1.1.1

- [ ] **Task 1.1.3**: Create `configs/handoff-transitions.ts` — `HANDOFF_TRANSITIONS` + `isLegalHandoffTransition`, shape-copied from `state/configs/pipeline-transitions.ts:12-33`.
      Test follows `classify-bash-command-registry.test.ts` — `test.each` over the derived key list asserting (a) every `HandoffStatus` is a key, (b) every value is a valid member, (c) terminals map to `[]`, (d) no unreachable status, via `expect({status,registered}).toEqual({status,registered:true})`.
  - Files: `packages/luca-core/src/handoff/configs/handoff-transitions.ts`, `handoff-transitions.test.ts`
  - Verification: ac-09
  - Dependencies: 1.1.2

- [ ] **Task 1.1.4**: Create `helpers/generate-envelope-id.ts` — `<sanitized repoName>_<generateRunId()>`, reusing the same-package `generateRunId`; output satisfies `ENVELOPE_ID_RE`.
  - Files: `packages/luca-core/src/handoff/helpers/generate-envelope-id.ts`, `.test.ts`
  - Verification: ac-11
  - Dependencies: 1.1.1

- [ ] **Task 1.1.5**: Create `helpers/mailbox-path-for.ts` — pure, homedir-parameterized (`{ homedir }` arg, never an implicit `homedir()`), returning `<homedir>/.luca/handoff/<id>.json`.
      **Returns `null` when `!ENVELOPE_ID_RE.test(id)`** — ids reach this from argv in phase 2, and `../../.claude/settings` would otherwise resolve into the exact directory `HOME_DENIED_SUBDIRS` protects. Test block names MUST contain `traversal`.
  - Files: `packages/luca-core/src/handoff/helpers/mailbox-path-for.ts`, `.test.ts`
  - Verification: ac-10, ac-32
  - Dependencies: 1.1.1

- [ ] **Task 1.1.6**: Create `index.ts` barrel (values first, then `export type`), add `"./handoff": "./src/handoff/index.ts"` to `packages/luca-core/package.json` exports after
      `"./orchestration"`, plus `export * from './handoff/index.ts'` in `packages/luca-core/src/index.ts` (every submodule barrel is re-exported there).
  - Files: `packages/luca-core/src/handoff/index.ts`, `packages/luca-core/package.json`, `packages/luca-core/src/index.ts`
  - Verification: ac-01, ac-04, ac-21
  - Dependencies: 1.1.2, 1.1.3, 1.1.4, 1.1.5

#### Wave 2: Transports and accept policy

- [ ] **Task 1.2.1**: Implement `helpers/create-local-mailbox-transport.ts` as a factory closure returning `HandoffTransport`. Methods are `async` and RESOLVE results while fs
      calls stay synchronous (no async fs layer; the Promise surface is what phase 5 needs). `send` creates the dir at `0o700` and the file via `openSync(path,'wx')` — `EEXIST` maps to `reason:'duplicate-id'`, any other fs throw maps to `reason:'io-error'` (never rethrow, unlike `verification-result.ts:112-118`). Mutations use inline atomic tmp → `renameSync` → `rmSync`-on-error.
      `send` parses its argument through `HandoffEnvelopeSchema` FIRST — a parse failure resolves `{ ok:false, reason:'corrupt', message: <zod issue summary> }` and writes nothing (schema-validated writes are the invariant that justifies the CLI-only mailbox, context.md:22).
      `send`/`read`/`updateStatus` short-circuit to `reason:'not-found'` when `mailboxPathFor` returns `null`, never revealing whether the traversal target exists.
  - Files: `packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.ts`
  - Verification: ac-01, ac-35 (other behavioral probes green at 1.2.4)
  - Dependencies: 1.1.6

- [ ] **Task 1.2.2**: Make `updateStatus(id, to, opts: UpdateStatusOptions)` the SOLE write path and sole enforcer of `HANDOFF_TRANSITIONS`. Define and export
      `UpdateStatusOptions = { expectedUpdatedAt: string; result?: HandoffResult; note?: string }` — `expectedUpdatedAt` is the CAS token, `result` the completion payload.
      Illegal target → `reason:'illegal-transition'`; `expectedUpdatedAt` mismatch → `reason:'conflict'`; unknown id → `reason:'not-found'`; a `→ complete` transition with
      `result` omitted → `reason:'corrupt'` (the invalid-input channel, message naming the missing field). Completion mutates the original envelope in place with `result` and
      appends to `statusHistory` (context D1). The CAS token is the envelope's own `updatedAt` as returned by a prior `read()` — never a `statSync` mtime — and every write
      stamps a **strictly greater** `updatedAt` (bump by 1ms on collision) so two calls in the same millisecond cannot both pass CAS.
  - Files: `packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.ts`
  - Verification: ac-01, ac-36 (other behavioral probes green at 1.2.4; ac-31 green at 1.2.7)
  - Dependencies: 1.2.1

- [ ] **Task 1.2.3**: `list` skips unparseable envelope files instead of throwing (`verification-result.ts:70, 81-83`) and honors both `HandoffFilter` keys (`status`,
      `targetRepoPath`); `read` returns `reason:'not-found'` on a missing file, `reason:'corrupt'` on an unparseable one, `reason:'schema-version-mismatch'` on an unknown version.
      A **missing mailbox directory** resolves `{ ok:true, envelopes: [] }` — `send` is the only thing that creates it, so `list` before any send is the day-one call on every
      fresh machine and must not throw ENOENT.
  - Files: `packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.ts`
  - Verification: ac-01, ac-38 (other behavioral probes green at 1.2.4)
  - Dependencies: 1.2.2

- [ ] **Task 1.2.4**: Write `create-local-mailbox-transport.test.ts` over a temp homedir — the green boundary for 1.2.1-1.2.3. Test block names MUST contain the literal
      substrings `round-trip`, `duplicate-id`, `illegal-transition`, `conflict`, `corrupt`, `0o700`, `status filter`, `target filter`, `read corrupt`, `send invalid`, `empty mailbox`.
  - Files: `packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts`
  - Verification: ac-12, ac-13, ac-14, ac-15, ac-16, ac-20, ac-22, ac-24, ac-27, ac-28, ac-33, ac-34
  - Dependencies: 1.2.3

- [ ] **Task 1.2.5**: Implement `helpers/create-remote-transport.ts` — same factory shape, every method RESOLVES `{ ok:false, reason:'not-implemented' }`, never throws (E1).
  - Files: `packages/luca-core/src/handoff/helpers/create-remote-transport.ts`, `.test.ts`
  - Verification: ac-17
  - Dependencies: 1.1.6

- [ ] **Task 1.2.6**: Implement `helpers/is-auto-acceptable.ts` — pure `(envelope, allowlist)` → boolean; empty/absent allowlist denies all. Docstring: convenience-not-security,
      because `origin.repoPath` is self-declared (context D2).
  - Files: `packages/luca-core/src/handoff/helpers/is-auto-acceptable.ts`, `.test.ts`
  - Verification: ac-18
  - Dependencies: 1.1.6

- [ ] **Task 1.2.7**: Extend the barrel to export the three helpers plus the `HandoffTransport` and `UpdateStatusOptions` types.
  - Files: `packages/luca-core/src/handoff/index.ts`
  - Verification: ac-03, ac-31
  - Dependencies: 1.2.4, 1.2.5, 1.2.6

#### Wave 3: Guards and gates

- [ ] **Task 1.3.1**: Add a guard test asserting `classifyWritePath('<home>/.luca/handoff/x.json', { homedir })` still classifies `denied`, beside the home-deny test (113-125).
      The assertion MUST contain the literal path fragment `/.luca/handoff/`; the bare word `handoff` is NOT a usable marker (it already matches at :94 and :184).
  - Files: `packages/luca-core/src/luca-dir/helpers/classify-write-path.test.ts`
  - Verification: ac-19, ac-25, anti-05
  - Dependencies: 1.1.6

- [ ] **Task 1.3.2**: Run the gates: `bunx --bun tsc --noEmit`, bounded `timeout 120 bun test packages/luca-core/src/handoff`, and the subpath resolution probe.
  - Files: (none — verification only)
  - Verification: ac-01, ac-02, ac-03, anti-01, anti-02, anti-03, anti-04, anti-06, anti-07, anti-08
  - Dependencies: 1.2.7, 1.3.1

## Risks & Mitigations

- G1 unauthenticated machine-global mailbox → `0o700` (ac-37), explicit `pending → accepted`, context D3 docstring contract (ac-29), id-charset traversal rejection (ac-32).
- G4 schema drift → `schema-version-mismatch` (ac-08). G5 crash mid-rename → `list` skips, `read` returns `corrupt` (ac-38, ac-27). E3 straddle → anti-03/04 vs the phase base sha.

## Decisions

- 2026-07-21 — Envelope id is `<sanitized repoName>_<generateRunId()>`; no ULID dependency added.
- 2026-07-21 — `schemaVersion` mismatch rejects with reason; no `z.preprocess` fold this phase.
- 2026-07-21 — Guard test lives in luca-core (`luca-dir/helpers/classify-write-path.test.ts`); the brief's luca-cli path does not exist, so luca-cli is untouched entirely.
- 2026-07-21 — Auto-accept allowlist is convenience, not a security boundary (`origin.repoPath` is self-declared); recorded in the helper docstring.
- 2026-07-21 — The `reason` union is fixed at 8 members (adding `duplicate-id`, `schema-version-mismatch`, `io-error`, `corrupt` to the four in `context.md:123`) because the never-throws contract needs a channel for each. Phase 2's CLI switches on exactly these.
- 2026-07-21 — `target.repoPath` is REQUIRED on the envelope and filterable. Restores `to:{repoPath}` from the original design sketch, dropped between sketch and research field table. Without it a flat machine-global mailbox cannot answer "what is addressed to me".
- 2026-07-21 — `updateStatus`'s third argument is `UpdateStatusOptions { expectedUpdatedAt, result?, note? }`.
- 2026-07-21 — **Phase 5's hub daemon owns liveness** (fs.watch / poll at the daemon layer). `HandoffTransport` gets NO `watch`/`subscribe` method and NO `since` cursor in v1 — it stays a CRUD surface, consistent with L2 (file is source of truth, hub is an accelerator).
- 2026-07-21 — Name-filtered test runs are banned as criterion probes; every behavior gets a whole-file runtime gate plus a source-presence grep (`archive/03-pr-outcome-writeback/plan.md:84`).
- 2026-07-21 — `mailboxPathFor` returns `null` on an id failing `ENVELOPE_ID_RE`, and all three write/read methods short-circuit to `not-found`. Enforcing the charset only at generation left `read('../../.claude/settings')` able to read, and `updateStatus` able to atomically overwrite, the directory `HOME_DENIED_SUBDIRS` exists to protect.
- 2026-07-21 — `send` validates through `HandoffEnvelopeSchema` and reuses `reason:'corrupt'` for invalid input rather than adding a 9th union member; the same channel covers a `→ complete` transition missing its `result`.
- 2026-07-21 — CAS token is the envelope's own `updatedAt` from a prior `read()` (never `statSync` mtime); writes stamp a strictly greater value so same-millisecond writers cannot both pass. Chosen over a separate `version: number` to keep context D1's wording intact.
- 2026-07-21 — `list` on a missing mailbox dir resolves `{ ok:true, envelopes: [] }` rather than creating the dir; only `send` creates it.
- 2026-07-21 — DEFERRED: `HandoffTransport` has no `delete`/`prune` method. `luca handoff prune` (context.md:144) will need one — a known additive interface change, so phase 2 must not assume it exists.

## Deliverables

`D<n>` are plan deliverables. `context D1/D2/D3` inside tasks means `context.md` decisions.

- **D1**: `packages/luca-core/src/handoff/constants.ts` → ac-01
- **D2**: `packages/luca-core/src/handoff/schemas.ts` (HandoffEnvelopeSchema, HandoffStatus) → ac-05, ac-06, ac-07, ac-08, ac-23
- **D3**: `packages/luca-core/src/handoff/configs/handoff-transitions.ts` (+ `isLegalHandoffTransition`) → ac-09
- **D4**: `packages/luca-core/src/handoff/helpers/mailbox-path-for.ts` (+ test) → ac-10, ac-32
- **D5**: `packages/luca-core/src/handoff/helpers/is-auto-acceptable.ts` (+ test) → ac-18
- **D6**: `packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.ts` (+ test) → ac-12, ac-13, ac-14, ac-15, ac-16, ac-20, ac-22, ac-24, ac-27, ac-28, ac-33, ac-34
- **D7**: `packages/luca-core/src/handoff/helpers/create-remote-transport.ts` (+ test) → ac-17
- **D8**: `packages/luca-core/src/handoff/index.ts` barrel → ac-03
- **D9**: `packages/luca-core/package.json` `"./handoff"` exports entry → ac-04
- **D10**: Envelope id generator resolving planner choice 1 → ac-11
- **D11**: Write-path guard test (agents cannot hand-forge envelopes) → ac-19, ac-25
- **D12**: `bunx --bun tsc --noEmit` clean → ac-01
- **D13**: Bounded `bun test packages/luca-core/src/handoff` green → ac-02
- **D14**: Zero changes under luca-tools / luca-cli → anti-03, anti-04
- **D15**: `packages/luca-core/src/index.ts` root-barrel re-export → ac-21
- **D16**: Complete 8-member failure `reason` union (B2) → ac-26
- **D17**: `target.repoPath` addressing + filter (B3) → ac-28, ac-30
- **D18**: Named and typed `UpdateStatusOptions` (B4) → ac-31
- **D19**: Untrusted-input (context D3) contract recorded in docstrings → ac-29
- **D20**: Path-traversal rejection on the consumption side → ac-32
- **D21**: `send` schema validation before any write → ac-33
- **D22**: `list` tolerates a missing mailbox dir → ac-34
- **D23**: Runtime (not just source-presence) proof of the four sole-evidence locked decisions → ac-35, ac-36, ac-37, ac-38

## Verification Criteria

- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `timeout 120 bun test packages/luca-core/src/handoff` exits 0.
- **ac-03**: `cd packages/luca-cli && timeout 60 bun -e "import('@alecsibilia/luca-core/handoff').then(m=>process.exit(m.createLocalMailboxTransport&&m.createRemoteTransport&&m.isAutoAcceptable&&m.HandoffEnvelopeSchema?0:1))"` exits 0 (luca-cli declares `"@alecsibilia/luca-core": "workspace:*"`, so this exercises the real exports map).
- **ac-04**: `grep -q '"./handoff": "./src/handoff/index.ts"' packages/luca-core/package.json` exits 0.
- **ac-05**: `grep -qF "defaults" packages/luca-core/src/handoff/schemas.test.ts` exits 0.
- **ac-06**: `grep -qF "invariant" packages/luca-core/src/handoff/schemas.test.ts` exits 0.
- **ac-07**: `grep -qF "unknown keys" packages/luca-core/src/handoff/schemas.test.ts` exits 0.
- **ac-08**: `grep -qF "schemaVersion" packages/luca-core/src/handoff/schemas.test.ts` exits 0.
- **ac-09**: `timeout 120 bun test packages/luca-core/src/handoff/configs/handoff-transitions.test.ts` exits 0.
- **ac-10**: `timeout 120 bun test packages/luca-core/src/handoff/helpers/mailbox-path-for.test.ts` exits 0.
- **ac-11**: `timeout 120 bun test packages/luca-core/src/handoff/helpers/generate-envelope-id.test.ts` exits 0.
- **ac-12**: `grep -qF "round-trip" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-13**: `grep -qF "duplicate-id" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-14**: `grep -qF "illegal-transition" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-15**: `grep -qF "conflict" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-16**: `grep -qF "corrupt" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-17**: `timeout 120 bun test packages/luca-core/src/handoff/helpers/create-remote-transport.test.ts` exits 0.
- **ac-18**: `timeout 120 bun test packages/luca-core/src/handoff/helpers/is-auto-acceptable.test.ts` exits 0.
- **ac-19**: `grep -qF "/.luca/handoff/" packages/luca-core/src/luca-dir/helpers/classify-write-path.test.ts` exits 0 (verified 0 matches at HEAD).
- **ac-20**: `grep -qF "0o700" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-21**: `grep -q "export \* from './handoff/index.ts'" packages/luca-core/src/index.ts` exits 0.
- **ac-22**: `grep -qF "status filter" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-23**: `timeout 120 bun test packages/luca-core/src/handoff/schemas.test.ts` exits 0.
- **ac-24**: `timeout 120 bun test packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-25**: `timeout 120 bun test packages/luca-core/src/luca-dir/helpers/classify-write-path.test.ts` exits 0.
- **ac-26**: `grep -qF "reason union" packages/luca-core/src/handoff/schemas.test.ts` exits 0 — the named test enumerates the 8-member union.
- **ac-27**: `grep -qF "read corrupt" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-28**: `grep -qF "target filter" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-29**: `grep -qF "untrusted" packages/luca-core/src/handoff/schemas.ts` exits 0.
- **ac-30**: `grep -qF "targetRepoPath" packages/luca-core/src/handoff/schemas.ts` exits 0.
- **ac-31**: `grep -qF "UpdateStatusOptions" packages/luca-core/src/handoff/index.ts` exits 0.
- **ac-32**: `grep -qF "traversal" packages/luca-core/src/handoff/helpers/mailbox-path-for.test.ts` exits 0.
- **ac-33**: `grep -qF "send invalid" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-34**: `grep -qF "empty mailbox" packages/luca-core/src/handoff/helpers/create-local-mailbox-transport.test.ts` exits 0.
- **ac-35**: E4 `wx` duplicate rejection proven at runtime — `cd packages/luca-core && timeout 60 bun -e "import{mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';const h=mkdtempSync(join(tmpdir(),'hx'));const{createLocalMailboxTransport}=await import('./src/handoff/index.ts');const t=createLocalMailboxTransport({homedir:h});const e=/*valid envelope*/globalThis.__e;await t.send(e);const r=await t.send(e);process.exit(r.ok===false&&r.reason==='duplicate-id'?0:1)"` exits 0.
- **ac-36**: D1 CAS conflict proven at runtime — same harness: `read()` once, then call `updateStatus` twice reusing that one `expectedUpdatedAt`; exits 0 only when the second resolves `reason==='conflict'`.
- **ac-37**: L4 `0o700` proven at runtime — same harness: after one `send`, `statSync(join(h,'.luca/handoff')).mode & 0o777` equals `0o700`; exits 0 only on equality.
- **ac-38**: G5 corrupt-skip proven at runtime — same harness: `send` one valid envelope, `writeFileSync` a second `<id>.json` holding `not json`, then `list()`; exits 0 only when the resolved envelope count equals 1.

### Anti-criteria (regression guards)

- **anti-01**: MUST NOT — introduce a class in the handoff module; `grep -rnE "(^|[^A-Za-z])class[[:space:]]+[A-Za-z{]" packages/luca-core/src/handoff` returns no matches (pattern also reaches `export default class`, `const X = class {`).
- **anti-02**: MUST NOT — reach into luca-cli from luca-core; `grep -rnE "from ['\"][^'\"]*luca-cli" packages/luca-core/src/handoff` returns no matches.
- **anti-03**: MUST NOT — touch luca-tools; `git diff --name-only be715aa4..HEAD -- packages/luca-tools` prints nothing. Literal phase-base sha — `merge-base HEAD main` fences from before this branch's existing luca-cli commits, so it would fail on arrival.
- **anti-04**: MUST NOT — touch luca-cli (incl. `CLI_SUBCOMMANDS`, `classify-bash-command.ts`, `WRITE_COMMAND_PHASES`); `git diff --name-only be715aa4..HEAD -- packages/luca-cli` prints nothing.
- **anti-05**: MUST NOT — weaken the home deny list; `grep -q "HOME_DENIED_SUBDIRS = \['.claude', '.luca'\]" packages/luca-core/src/luca-dir/helpers/classify-write-path.ts` exits 0.
- **anti-06**: MUST NOT — set defaults during destructuring; `grep -rzPn "\{[^{}]*?=[^{}=]*?\}\s*=" packages/luca-core/src/handoff --include='*.ts'` returns no matches (`-z` makes the scan multiline, catching formatter-wrapped destructuring).
- **anti-07**: MUST NOT — let any criterion probe be a name-filtered test run; `grep -nE '^- \*\*(ac|anti)-[0-9.]+\*\*:.*( [-]t |--test[-]name-pattern)' .luca/phases/01-handoff-envelope-schema-and-local-mailbox-transport/plan.md` returns no matches (the bracket escapes keep this guard from matching its own line while still matching both real forms).
- **anti-08**: MUST NOT — create a lock file (E4 fixes one file per envelope, `wx` + CAS); `grep -rnE "lockPath|withStateLock|(openSync|writeFileSync|mkdirSync)\([^)]*\.lock" packages/luca-core/src/handoff` returns no matches (scoped to creation so a docstring mentioning the no-lock decision does not trip it).
