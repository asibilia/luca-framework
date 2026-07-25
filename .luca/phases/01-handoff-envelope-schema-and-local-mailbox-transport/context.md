# Context — Phase 01: Handoff envelope schema and local mailbox transport

Complexity: CRITICAL · Package: `luca-core` · Phase 1 of 5
Companion: `research.md` (file:line evidence + DECISIONS section)

---

## Locked before research (do not revisit)

| # | Decision | Source |
|---|---|---|
| L1 | **Work order + callback** semantics. Repo B triages the incoming order into its OWN roadmap as its own phase. Explicitly NOT a shared pipeline baton — two sovereign pipelines, loosely coupled. Sidesteps cross-repo phase-numbering conflicts. | user |
| L2 | **On-disk mailbox is the source of truth.** The Bun hub daemon (phase 5) is an optional accelerator only, mirroring daemon-if-up / cold-if-down routing in `luca state advance` and the `Unreachable` sentinel in `packages/luca-cli/src/runner/protocol.ts`. Hub down must degrade, never lose. | user |
| L3 | **Bun only.** No Python, no `retalk`, no external relay, no vendored dependency. Remote transport is STUBBED this phase. | user |
| L4 | **Mailbox at `~/.luca/handoff/`, mode `0o700`, no write-path carve-out.** | user + research |

On L4 — research overturned the pre-research assumption that a carve-out or sibling directory
would be needed. `classifyWritePath` governs only *agent* `Write`/`Edit` tool calls routed through
the stage-gate hook (`handle-stage-gate-hook.ts:201, 262`); `luca <noun> <verb>` Bash invocations
return `targetPaths: []` (`classify-bash-command.ts:579`). Precedent: `luca init` already writes
into `~/.claude/`, an always-denied `HOME_DENIED_SUBDIRS` entry, via plain `node:fs`
(`install-skills.ts:73-75`). The always-deny is a **feature** here: it forces every envelope through
the schema-validated CLI, exactly as `.luca/state.json` is CLI-only. `HOME_DENIED_SUBDIRS` must NOT
be weakened.

---

## Settled by research evidence

| # | Decision | Rationale |
|---|---|---|
| E1 | `RemoteTransport` **resolves** `{ ok: false, reason: 'not-implemented' }` — it does not throw. | Every luca-core precedent returns a value rather than throwing for an expected condition: `AcquireResult`/`ReleaseResult` (`pipeline-lock.ts:143-150`, "Never throws on contention" 161), `Unreachable` (`runner/protocol.ts:57-59`), `readVerificationResult → null` (`verification-result.ts:70`). **DEVIATION** from the original brief's "throws NotImplemented" — deliberate, recorded here. |
| E2 | Mailbox layout is **flat**: `~/.luca/handoff/<id>.json`, status stored in-file. | Status-as-directory turns a transition into a rename, letting two writers both "win". Flat + in-file status keeps the transition the atomic unit. |
| E3 | Phase 1 is **luca-core only**. No `handoff` entry in `CLI_SUBCOMMANDS`, `classify-bash-command.ts`, or `WRITE_COMMAND_PHASES` this phase. | The registry-completeness test (`classify-bash-command-registry.test.ts`) fails the instant those registries straddle a phase boundary. All four registration points land together in phase 2. |
| E4 | No lock file. One file per envelope, created with `openSync(path, 'wx')`; mutations via atomic tmp+rename. | IDs are unique per origin, so two repos never target the same filename — the cross-repo create collision does not exist. Re-implement atomic write inline in luca-core per `verification-result.ts:110-118`; **luca-core must not import from luca-cli** (`claim-verifier.ts:362-364`). |

---

## Decided this step

### D1 — Callback shape: mutate the original envelope in place

Repo B transitions the **same** envelope file to `complete` and attaches a `result` object
`{ outcome, phaseSlug, notes, evidence }`. `statusHistory` carries the audit trail.

- One file *is* the exchange → `list` and correlation are trivial (no join, no `replyTo` chain).
- Keeps `HANDOFF_TRANSITIONS` meaningful. The rejected append-only alternative would have made the
  status machine largely vestigial, since envelopes would be immutable.
- Race handling: optimistic **compare-and-set on `updatedAt`**, returning
  `{ ok: false, reason: 'conflict' }`. Contention is near-zero in practice — A writes once at send
  and then mostly reads; B is the only other writer.

Rejected: separate reply-envelope with `replyTo: <id>`. Strictly append-only and CAS-free, but
doubles envelope count, forces correlation-by-id on every read, and expands the transport surface.

### D2 — Trust model: allowlist auto-accept

Repo B may auto-accept (`pending → accepted`) an envelope whose `origin.repoPath` appears on a
user-configured allowlist; everything else requires explicit human acceptance.

- Allowlist lives in the **receiving** repo's `.luca/config.json` under `handoff.autoAcceptFrom`
  (array of absolute repo paths). Absent or empty ⇒ every envelope needs a human.
- Evaluation is a **pure helper** in luca-core (`helpers/is-auto-acceptable.ts`) over
  `(envelope, allowlist)` — no implicit `homedir()`/config reads, matching the
  caller-supplied-`cwd` convention in `pipeline-lock.ts:30-32`.

**Accepted risk — the allowlist is convenience, not a security boundary.** Surfaced to the user
before this was recorded:

- `origin.repoPath` is **self-declared by whoever writes the envelope**. Any process able to write
  the mailbox can set it to an allowlisted value. The allowlist therefore does not stop the
  prompt-injection vector it superficially appears to address (risk G1, HIGH).
- Honest threat model: `0o700` means only processes running as this user can write the mailbox. A
  malicious process at that privilege could equally rewrite repo B's `.luca/config.json` to extend
  the allowlist, or just edit repo B's source directly. The allowlist meaningfully prevents
  *accidental* cross-talk between the user's own repos; it does not defend against a hostile local
  process.
- The real control is **D3**, which holds regardless of accept path.

### D3 — `intent` is untrusted input, always

Auto-accept advances status only. It **never** auto-plans and **never** auto-executes. Envelope
`intent`, `acceptanceCriteria`, and all free-text fields are treated as untrusted and must never be
interpolated into instruction text — matching the existing prompt-injection defense in
`build-muninn-instruction.ts` ("free-form strings are never interpolated into instruction text").
Normal oversight, the confidence gate, and the stage-gate hook continue to govern anything B
actually does with the work order.

---

## Implementation shape

Module (follows the `luca-dir` convention — handoff has both a path contract and a transition table):

```
packages/luca-core/src/handoff/
  index.ts                              # barrel: values, then `export type`
  schemas.ts                            # HandoffEnvelopeSchema, HandoffStatus
  constants.ts                          # HANDOFF_DIR_NAME, ENVELOPE_ID_RE, SCHEMA_VERSION
  configs/handoff-transitions.ts        # HANDOFF_TRANSITIONS + isLegalHandoffTransition
  helpers/mailbox-path-for.ts (+.test)
  helpers/is-auto-acceptable.ts (+.test)
  helpers/create-local-mailbox-transport.ts (+.test)
  helpers/create-remote-transport.ts (+.test)
```

Add `"./handoff": "./src/handoff/index.ts"` to `packages/luca-core/package.json` `exports`
(siblings at 13-32). No build step — `main` is `src/index.ts`, everything is raw TS. Filenames
kebab-case. **No classes** — factory closures returning a narrow `interface`, per
`createPipelineActorHandle` (`state/machine/actor-handle.ts:61-86`).

Transport surface:

```ts
export interface HandoffTransport {
    send(env: HandoffEnvelope): Promise<HandoffSendResult>
    list(filter?: HandoffFilter): Promise<HandoffListResult>
    read(id: string): Promise<HandoffReadResult>
    updateStatus(id: string, to: HandoffStatus, opts): Promise<HandoffStatusResult>
}
```

Every method returns `{ ok: true; … } | { ok: false; reason: 'not-found' | 'illegal-transition' | 'conflict' | 'not-implemented'; message: string }`.

Status machine (mirrors `PIPELINE_TRANSITIONS` at `state/configs/pipeline-transitions.ts:12-33`),
enforced in `updateStatus` — the sole write path — not as a Zod refinement:

```ts
pending:       ['accepted', 'rejected', 'cancelled']
accepted:      ['in-progress', 'rejected', 'cancelled']
'in-progress': ['complete', 'failed', 'cancelled']
complete: []   rejected: []   cancelled: []
failed:        ['in-progress']   // retry
```

Schema house style: `z.enum` → PascalCase const → `export type X = z.infer<typeof X>` shadowing the
const; `…Schema` suffix with type derived unsuffixed; **all defaults in the schema, never in
destructuring**; `z.preprocess` for legacy folds; `.superRefine` for cross-field invariants.

---

## Deferred (not this phase)

- `luca handoff prune` reaper for stale/orphaned envelopes (risk G3). Phase 1 only stamps
  `createdAt` + `origin.repoPath` so a reaper is possible later.
- Any authenticated origin proof that would make the allowlist a real security boundary.
- Hub daemon, SSE, SessionStart hook, CLI noun, skills — phases 2-5.

## Open for the planner

- Envelope id scheme: ULID vs `<originRepoName>-<runId>-<seq>`. Latter is human-greppable in a flat
  dir and self-documents provenance; former is collision-proof. `RunIdSchema`/`RUN_ID_RE` exist at
  `luca-dir/index.ts:8,17` — reuse the charset. Planner picks; not user-facing.
- Whether `schemaVersion` mismatch should reject-with-reason (recommended, per `hasRequiredStateKeys`
  strictness at `mutate-state.ts:101-108`) or attempt a preprocess fold.
