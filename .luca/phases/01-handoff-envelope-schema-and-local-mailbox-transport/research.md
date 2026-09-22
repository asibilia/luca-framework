# Research — Phase 01: Handoff envelope schema and local mailbox transport

Complexity: CRITICAL · Package: `luca-core` · Phase 1 of 5

## Feature context

Let an agent running a Luca pipeline in repo A emit a scoped **work order** to an agent in
repo B (different Claude Code session, same machine). B triages it into its **own** roadmap
as its own phase and signals completion back to A. Two sovereign pipelines, loosely coupled —
explicitly *not* a shared pipeline baton.

Locked before research: work-order+callback semantics; on-disk mailbox is the source of truth;
a Bun hub daemon (phase 5) is an optional accelerator only; Bun-only, no Python/relay/vendored
dependency; remote transport stubbed this phase.

Phase 1 scope: envelope schema, `HandoffTransport` interface + `LocalMailboxTransport` +
`RemoteTransport` stub, and the mailbox location decision.

---

## DECISIONS

### A. Mailbox location — `~/.luca/handoff/`, no carve-out (HIGH)

**The pivotal finding: `classifyWritePath` never sees CLI-internal writes.**

Both call sites are inside the stage-gate hook and are driven by *harness tool input*, not by
CLI file I/O:

- `packages/luca-cli/src/hook/helpers/handle-stage-gate-hook.ts:201` — `classifyWritePath(targetPath, …)`
  where `targetPath` comes from `tool_input.file_path` of a `Write`/`Edit`/`NotebookEdit` call (176–188).
- `handle-stage-gate-hook.ts:262` — over `bashResult.targetPaths` from `classifyBashCommand`.

For a `luca <noun> <verb>` Bash invocation, `classify-bash-command.ts:579` returns
**`targetPaths: []`**. So `luca handoff send …` yields zero paths for `classifyWritePath` to
judge; it classifies as `luca-write` (line 370), allowed by the matrix in every non-IDLE phase.

**Decisive precedent:** `luca init` already writes into `~/.claude/` — an always-denied
`HOME_DENIED_SUBDIRS` entry (`classify-write-path.ts:61`) — via plain `node:fs` at
`packages/luca-cli/src/init/helpers/install-skills.ts:73-75`. No carve-out exists or was needed.
The deny rules govern the *agent's* write surface only.

`classifyWritePath` rule enumeration (`classify-write-path.ts`):

| # | Rule | Line | Result |
|---|------|------|--------|
| 1 | `GIT_DIR_PATTERN` `.git/` anywhere | 60, 219 | denied |
| 2 | `SHARED_TMP_LUCA_PATTERN` `/tmp/luca-*` | 73, 230 | denied |
| 3 | `isEphemeralOsTemp` | 79, 107, 243 | ephemeral |
| 4 | `SYSTEM_DIR_PATTERN` | 59, 248 | denied |
| 5 | `HOME_DENIED_SUBDIRS = ['.claude','.luca']` | 61, 256–272 | denied |
| 6 | `.luca/tmp/previews/<name>` | 284 | ephemeral |
| 6b | `AUDIT_PATH_PATTERN` | 135, 288 | planning-audit |
| 6c | any other `.luca/…` | 279–291 | planning-general |
| 7 | `CHANGESET_FILE_PATTERN` | 94, 299 | release-artifact |
| 8 | fallback | 304 | code |

Candidates:

| Candidate | Blocks agent Write? | Blocks `luca handoff` CLI? | Carve-out? | Blast radius |
|---|---|---|---|---|
| **(i) `~/.luca/handoff/`** | Yes (rule 5) — *desirable* | **No** | **None** | Zero |
| (ii) `~/.luca-handoff/` | No → `code`, matrix-governed | No | None | Zero, but weaker: agent could hand-forge an envelope |
| (iii) `$XDG_STATE_HOME/luca/handoff` | Depends on value | No | None | Adds env-resolution branch; no `XDG_` precedent in `packages/` |
| (iv) repo-local `.luca/handoff/` | Yes — `artifactPathGate` (`handle-stage-gate-hook.ts:435-442`) | No | `LUCA_DIR_CONTRACT` extension | High — contract + `isValidLucaPath` + shadow scanner |

**Chosen: (i).** The always-deny is a feature — it forces every envelope through the
`luca handoff` CLI (schema-validated, atomically written, status-machine-checked), mirroring how
`.luca/state.json` is CLI-only. Do **not** weaken `HOME_DENIED_SUBDIRS`. `~/.luca/` does not yet
exist on disk; phase 1 creates it with mode `0o700`.

### B. Transport interface — Result-style, factory closures (HIGH)

Precedent: `packages/luca-cli/src/runner/protocol.ts` — discriminated request union (29), flat
response with `ok` + `kind` discriminator (36–54), sentinel `interface Unreachable { unreachable: true }`
(57–59) narrowed via `'unreachable' in ping` (`daemon.ts:88`), and `sendRequest` that
"NEVER throws: a down daemon is a normal, expected condition (anti-06)" (66–67).

```ts
export interface HandoffTransport {
    send(env: HandoffEnvelope): Promise<HandoffSendResult>
    list(filter?: HandoffFilter): Promise<HandoffListResult>
    read(id: string): Promise<HandoffReadResult>
    updateStatus(id: string, to: HandoffStatus): Promise<HandoffStatusResult>
}
export function createLocalMailboxTransport(opts): HandoffTransport
export function createRemoteTransport(opts): HandoffTransport
```

Per-method result union: `{ ok: true; … } | { ok: false; reason: 'not-found'|'illegal-transition'|'conflict'|'not-implemented'; message: string }`.
Modeled on `AcquireResult`/`ReleaseResult`/`ForceUnlockResult` (`pipeline-lock.ts:143-150, 208-210, 244-250`),
documented "Never throws on contention" (161).

**No classes** — confirmed: `class ` appears once in all of `packages/luca-core/src`, inside a test
(`utils/stringify-error.test.ts:11`). Canonical adapter precedent is `createPipelineActorHandle`
(`state/machine/actor-handle.ts:61-86`): an `interface` of plain methods returned from a factory
closure over private state, deliberately narrow so the dependency doesn't leak (docstring 41–44).

### C. Concurrency + placement — one file per envelope, `wx` create, atomic rename (HIGH)

Package boundary is explicit: `packages/luca-core/src/claim-verifier/claim-verifier.ts:362-364` —
*"that helper is private to luca-cli and luca-core must not import from it."* Grep confirms zero
`@alecsibilia/luca-cli` imports in luca-core.

So these luca-cli helpers are **unavailable** and must not be reached for:
- `writeAtomicFile` — `write-atomic.ts:19-32` (mkdir → sibling `.tmp` → `rename`).
- `withStateLock`/`mutateState` — `mutate-state.ts:69-80, 127-166`; lock `.luca/state.json.lock`,
  `open(…,'wx')`, `LOCK_TIMEOUT_MS=5000`, `LOCK_POLL_MS=40`, `STALE_LOCK_MS=15000`.

Available in luca-core: `pipeline-lock.ts` (`acquire` via `openSync(p,'wx')` 166-196; `isPidAlive`
103-115) — but hard-bound to `.luca/lock.json` via `lockPath(cwd)` (78-80), not reusable as written.
**The right precedent is `verification/verification-result.ts:110-118`**, which re-implements atomic
write inline in luca-core with `node:fs` (`writeFileSync` tmp → `renameSync` → `rmSync` on error).

Model — **no lock file**:
- One file per envelope: `~/.luca/handoff/<envelope-id>.json`. IDs are unique per origin, so two
  repos never target the same filename — the cross-repo write collision does not exist.
- Create with `openSync(path, 'wx')` so a duplicate id fails loudly rather than clobbering.
- Status mutation races only between the origin and target repo on one file: use atomic
  tmp+rename plus an optimistic `updatedAt`/`version` compare-and-set returning
  `{ ok: false, reason: 'conflict' }`. A lock file is over-engineering for two low-frequency writers.
- **Reject a single-index-file design** — it recreates exactly the shared-mutable-file collision
  that `SHARED_TMP_LUCA_PATTERN` was added to prevent (`classify-write-path.ts:63-72`).

### D. Module layout — `packages/luca-core/src/handoff/` (HIGH)

Two conventions exist in luca-core: flat (`verification/`: `index.ts` + `schemas.ts` + domain +
colocated tests) and helpers-style (`luca-dir/`, `vault/`: `index.ts` + `schemas.ts` +
`constants.ts` + `configs.ts` + `helpers/<verb>-<noun>.ts` with sibling tests).

Handoff has both a path contract and a transition table, so follow the `luca-dir` shape:

```
packages/luca-core/src/handoff/
  index.ts                              # barrel: values, then `export type`
  schemas.ts                            # HandoffEnvelopeSchema, HandoffStatus
  constants.ts                          # HANDOFF_DIR_NAME, ENVELOPE_ID_RE, SCHEMA_VERSION
  configs/handoff-transitions.ts        # HANDOFF_TRANSITIONS + isLegalHandoffTransition
  helpers/mailbox-path-for.ts (+.test)
  helpers/create-local-mailbox-transport.ts (+.test)
  helpers/create-remote-transport.ts (+.test)
```

Public export: add `"./handoff": "./src/handoff/index.ts"` to `packages/luca-core/package.json`
`exports` (siblings at 13–32, e.g. `"./luca-dir"` line 16). Only wiring required — no build step;
`main` is `src/index.ts` (33), everything is raw TS. All filenames kebab-case.

---

## Schema conventions and envelope design

House style (`packages/luca-core/src/state/schemas.ts`):

- `z.enum([...])` assigned to a PascalCase const, then `export type X = z.infer<typeof X>`
  **shadowing the const name** (9-16, 18-23, 35-42, 46-53).
- Object schemas suffixed `…Schema`; type derived without the suffix (`RoadmapPhaseSchema` →
  `RoadmapPhase`, 59-65). Same in `verification/schemas.ts:14-77`, `pipeline-lock.ts:65-72`.
- **Defaults live in the schema, never in destructuring** — confirmed: `deps: z.array(z.string()).default([])`
  (60), `status: PhaseStatus.default('pending')` (61), 15 `.default()` calls across `lucaStateSchema`
  (87-139). Optionality is `.optional()` with no fallback.
- Legacy folds use `z.preprocess` — `PipelineStep` maps `LEGACY_PIPELINE_STEP_MAP` before the enum
  (27-32). This is the schema-versioning lever.
- Cross-field invariants use `.superRefine` + `ctx.addIssue({ code, path, message })`
  (`verification/schemas.ts:51-76`); messages are instructional.
- Tolerant read variant via `.passthrough()` (`schemas.ts:147`).

Proposed envelope fields:

| Field | Type | Why B needs it |
|---|---|---|
| `schemaVersion` | `z.number().default(1)` | Forward-compat; preprocess fold hook |
| `id` | `z.string()` | Filename key; idempotency; callback correlation |
| `createdAt` / `updatedAt` | `z.string()` ISO | Staleness reaping |
| `origin.repoPath` | `z.string()` | B writes the callback back; can read A's artifacts |
| `origin.repoName` | `z.string()` | Human-readable in B's roadmap entry |
| `origin.runId` | `z.string()` | Correlates to A's `state.sessionId` (`state/schemas.ts:96`); ledger join key |
| `origin.phaseSlug` | `z.string()` | Provenance; validate with `PhaseSlugSchema` (`luca-dir/index.ts:4`) |
| `origin.branch` | `z.string().optional()` | Mirrors `state.branchName` (112) |
| `intent` | `z.string()` | The work order itself — B triages this into a phase |
| `acceptanceCriteria` | `z.array(z.string()).default([])` | B's phase needs verifiable ACs |
| `context.vault` / `context.concepts` | `z.string().optional()` / `z.array().default([])` | B recalls A's reasoning; `resolveProjectVault` at `vault/index.ts:5` |
| `context.issueRefs` / `context.prRefs` | `z.array(z.string()).default([])` | GitHub is the cross-repo discussion surface |
| `callback.transport` | `z.enum(['local-mailbox','remote']).default('local-mailbox')` | Routing; `remote` is the stub |
| `callback.address` | `z.string()` | Where B writes completion |
| `status` | `HandoffStatus.default('pending')` | State machine below |
| `statusHistory` | `z.array(...).default([])` | Audit + CAS conflict detection |
| `result` | optional `{ outcome, phaseSlug, notes, evidence }` | B's completion signal back to A |

Status machine — copy the `PIPELINE_TRANSITIONS` pattern verbatim
(`state/configs/pipeline-transitions.ts:12-33`: a `Record<Status, Status[]>` plus a 3-line
`isLegalTransition`):

```ts
export const HANDOFF_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
    pending:       ['accepted', 'rejected', 'cancelled'],
    accepted:      ['in-progress', 'rejected', 'cancelled'],
    'in-progress': ['complete', 'failed', 'cancelled'],
    complete:      [],
    rejected:      [],
    failed:        ['in-progress'],
    cancelled:     [],
}
```

Enforce inside `updateStatus` (the sole write path), returning `{ ok: false, reason: 'illegal-transition' }`.
Do **not** enforce in the schema — `PIPELINE_TRANSITIONS` is likewise a config consulted by the
write handler, not a Zod refinement.

---

## Testing

Runner is `bun test` (`packages/luca-core/package.json:36`); tests are **colocated** `<file>.test.ts`
(e.g. `luca-dir/helpers/phase-path-for.test.ts`). Imports: `import { describe, expect, test } from 'bun:test'`.

Registry-completeness model (`packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts`):
5 numbered invariants using `test.each` over a derived key list, with
`expect({ noun, registered }).toEqual({ noun, registered: true })` so the failure diff *names the
offender* (85-87); also asserts registries are pairwise disjoint (136-158).

Phase 1 coverage:

1. **Schema** — defaults materialize; `.superRefine` invariants fire; unknown keys stripped;
   `schemaVersion` preprocess round-trip.
2. **Transition registry completeness** — every `HandoffStatus` member is a key in
   `HANDOFF_TRANSITIONS`; every value is a valid member; terminal statuses have `[]`; no
   unreachable status.
3. **Path helper** — `mailboxPathFor` is homedir-parameterized (never calls `homedir()` implicitly,
   mirroring `pipeline-lock.ts`'s "pure functions over a caller-supplied `cwd`", 30-32) so tests
   use a temp dir.
4. **LocalMailboxTransport** — round-trip send→list→read; duplicate-id `wx` rejection; illegal
   transition → `illegal-transition`; concurrent `updateStatus` → `conflict`; corrupt envelope file
   is skipped by `list`, not thrown (mirroring `readVerificationResult` returning `null` on parse
   failure, `verification-result.ts:70, 81-83`).
5. **RemoteTransport** — every method resolves `not-implemented`, never throws.
6. **Write-path guard** — assert `classifyWritePath('<home>/.luca/handoff/x.json', { homedir })`
   still returns `denied`, locking in the invariant that agents cannot hand-forge envelopes. Add
   beside `classify-write-path.test.ts:114-122`.

---

## Risks

| # | Risk | Severity | Note |
|---|---|---|---|
| G1 | **Machine-global mailbox is an unauthenticated trust boundary.** Any process running as this user can drop an envelope that B's agent triages into its roadmap — a prompt-injection vector into a *different* repo's planning. | **HIGH** | Direct analogue documented at `runner/daemon.ts:26-35` ("UNAUTHENTICATED… do NOT mistake this for hook-enforced governance"). Mitigate: `mkdir(mode: 0o700)` (precedent `daemon.ts:72-75`); require explicit `pending → accepted` in B before any planning; treat `intent` as untrusted input, never auto-execute. |
| G2 | Weakening `HOME_DENIED_SUBDIRS` would expose `~/.claude/settings.json`-class paths to agent Writes. | HIGH if taken | **Avoided entirely** by Decision A. |
| G3 | Stale/orphaned envelopes accumulate (B never runs; A's repo deleted). | MEDIUM | No reaper exists. Stamp `createdAt` + `origin.repoPath` so a later `luca handoff prune` can reap by age or missing repo. `isPidAlive` (`pipeline-lock.ts:103-115`) is the liveness precedent. |
| G4 | Schema drift across luca versions — A on v13.2 writes an envelope B on v13.0 can't parse. | MEDIUM | `schemaVersion` + `z.preprocess` fold. B must reject-with-reason on unknown major, not silently `.default()` past it — cf. `hasRequiredStateKeys` (`mutate-state.ts:101-108, 155-159`), which exists precisely because defaults papered over truncation. |
| G5 | Envelope corruption on crash between write and rename. | LOW | Inherent to tmp+rename; accepted at `write-atomic.ts:13-16`. `list` must skip unparseable files. |
| G6 | `origin.repoPath` leaks an absolute private-repo path readable by anything on the machine. | LOW-MED | 0700 mitigates; flag in the envelope docstring. |
| G7 | Backwards-compat | **NONE** | Purely additive: new dir, new subpath export; no change to existing schemas, contract, matrix, or classifier. |

---

## Open questions for discuss

1. **Throw vs Result for `RemoteTransport`.** Brief said "throws NotImplemented"; every luca-core
   precedent returns a value (`AcquireResult`, `Unreachable`, `readVerificationResult → null`).
   Research recommends Result — a deliberate deviation from stated scope, needs a call.
2. **Envelope id scheme.** ULID vs `<originRepoName>-<runId>-<seq>`. Latter is human-greppable in a
   flat dir and self-documents provenance; former is collision-proof. `RunIdSchema`/`RUN_ID_RE`
   exist (`luca-dir/index.ts:8,17`); unverified whether a generator ships with them.
3. **Mailbox layout.** Flat `handoff/<id>.json` vs `handoff/<status>/<id>.json`. Status-as-directory
   makes `list` cheap but turns transitions into renames, so two writers can both "win". Leaning flat.
4. **Callback shape.** Status+result mutation on the original envelope (assumed) vs a separate
   reply-envelope in A's mailbox. The latter is append-only and sidesteps CAS conflict entirely.
   Genuinely ambiguous; changes the `HandoffTransport` surface.
5. **Phase-boundary hazard.** The registry-completeness test fails the moment a `handoff` noun lands
   in `CLI_SUBCOMMANDS` without matching classifier + `WRITE_COMMAND_PHASES` entries. Phase 1 is
   luca-core-only so it shouldn't bite, but phases 1/2 must not straddle that boundary.
