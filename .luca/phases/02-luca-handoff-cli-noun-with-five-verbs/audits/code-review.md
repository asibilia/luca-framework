# Code Review — Phase 02: `luca handoff` CLI noun with five verbs

Two cold reviewers, parallel, read-only: **security**, **test-quality**.
Tally: **0 CRITICAL · 4 HIGH · 6 MEDIUM · 4 LOW**. Verdict: **loop back to execute** (5 must-fix).

Both reviewers reported **no Bash tool**, so no findings were empirically executed — see the tool-access
note at the end. The orchestrator supplied the empirical half (33/33 checks, two mutation observations).

## The headline: two live bypasses of the core invariant

The mailbox design rests on one claim — `~/.luca/` is home-denied, so agents cannot hand-author
envelopes and **must** go through the schema-validated CLI. Both HIGH security findings break that
claim, by different routes, and neither is theoretical.

## MUST-FIX (5)

### MF-1 [HIGH] — the IDLE short-circuit returns `allow` before any path classification
`handle-stage-gate-hook.ts:168`. The IDLE fast path returns `allow` **before** `classifyWritePath`
runs, so always-denied home paths are not "blocked regardless of phase" as this file's own docstring
(`:64-68`) and the write-surface skill body (`luca-write-surface/index.ts:214-217`) both assert.

At `pipelineStep: 'idle'`, a native `Write` to `<home>/.luca/handoff/x.json` is **allowed outright** —
an agent can forge an envelope with an attacker-chosen `id`, `status: 'accepted'`, and a fabricated
`statusHistory`. The unconditional `.luca/handoff` deny at `classify-write-path.ts:289-296` is
unreachable from there.

**This is exactly the state phase 3's SessionStart triage runs in** (`step-artifacts.ts:113-118`), so
shipping it would hand the next phase a pre-broken trust boundary.

**Fix:** move always-denied path/command evaluation ABOVE the IDLE short-circuit — classify with
`classifyWritePath` / `classifyBashCommand` first, block on `class === 'denied'`, and only then apply
"IDLE is permissive" to the phase/tool matrix. Add a hook test asserting a Write to
`<home>/.luca/handoff/x.json` blocks at `pipelineStep: 'idle'`.
**Note the blast radius:** this changes behavior for every IDLE write in every repo. It is aligning
code with the documented contract, not inventing a new rule — but it is the widest-reaching change in
this phase and deserves an explicit test sweep of the existing hook suite.

### MF-2 [HIGH] — Bash writes escape the deny when the command has no target extractor
`classify-bash-command.ts:705`. `classifySubcommand` populates `targetPaths` only for redirects,
`git add`/git mutates, `cp`/`mv`/`ln`, `sed -i`, and `playwright-cli --filename`. Everything else —
`tee`, `touch`, `install`, `dd`, `bun -e`, `python -c` — falls to the unknown-command default with
`targetPaths: []`. The hook's deny loop (`handle-stage-gate-hook.ts:267-275`) then sees nothing, and
`bash-mutate` is **allowed in EXECUTING** (`stage-tool-matrix.ts:90`).

So `echo '<forged envelope>' | tee ~/.luca/handoff/x.json` — or `bun -e "Bun.write(...)"` — writes an
arbitrary envelope during a normal execute wave. Literal `~` and `$HOME` spellings *are* caught for
extractor-covered commands (`classify-write-path.ts:257,289`), which is precisely why the gap is the
missing extraction rather than the path matching.

**Fix:** add a mailbox-specific token scan independent of per-command extraction — in
`classifyBashCommand` before the per-subcommand loop, push any token matching
`/(^|\/)\.luca\/handoff(\/|$)/` or `^~\/\.luca\/handoff/` into `targetPaths` so the existing deny check
fires regardless of binary. Add `tee` and `install` extraction while there.

### MF-3 [MEDIUM] — `accept --auto` never checks the envelope is addressed to this repo
`luca-handoff-accept.ts:109`. It reads by id and consults only `isAutoAcceptable`, which checks
`status === 'pending'` and `origin.repoPath ∈ allowlist` (`is-auto-acceptable.ts:29-33`) — **nothing
about `target.repoPath`**. An unattended agent in repo B whose allowlist names repo A will auto-accept
an **A→C** envelope (ids are discoverable via `luca handoff list --all-targets`), forging an `accepted`
status plus an AUTO_NOTE audit entry on a work order never addressed to B, and silently denying C its
pending item.

The sibling handler already enforces this boundary — `luca-handoff-list.ts:139-143` reports
`autoAcceptable: false` when `target.repoPath !== ctx.cwd` — so **the annotation the operator sees and
the rule the mutation enforces disagree.**

**Fix:** in the `args.auto` branch, refuse before calling `isAutoAcceptable` when
`envelope.target.repoPath !== ctx.cwd`, naming the actual target. Leave the bare human `accept` path
unchanged if cross-repo human acceptance is intended — but document that explicitly.

### MF-4 [MEDIUM] — `target.repoPath` is sender-controlled free text rendered into the triage view
`luca-handoff-list.ts:82`. `HandoffTargetSchema.repoPath` is only `z.string().min(1)` (`schemas.ts:106-111`)
— no absolute-path, length, or control-character constraint — and `summarize()` renders it **verbatim**.

That output is the deliberately low-exposure triage surface: `intent` and `acceptanceCriteria` are
correctly withheld from it (only `--json` exposes them). A sender setting `target.repoPath` to a
multi-line string reintroduces attacker-authored, instruction-shaped lines into exactly the surface
designed to exclude them — and the receiving agent reads that stdout straight into context.
`describeAutoRefusal` (`luca-handoff-accept.ts:82-87`) renders the same class of value.

**Fix:** constrain at the phase-2 send boundary (absolute path, max length, no control characters)
and/or single-line-escape `origin.repoPath` / `target.repoPath` before rendering.

### MF-5 [HIGH, test] — `origin` forging is untested, and it is what the allowlist matches on
`luca-handoff-send.test.ts:118`. The strip-and-stamp block covers forged `status`, `id`,
`statusHistory` and `result` — but **not `origin`**, the one stripped field with a security
consequence. A caller who could inject `origin: { repoPath: '<victim-allowlisted-path>' }` would obtain
unattended `--auto` acceptance in a repo that never trusted them.

Today that is blocked **only implicitly**, by Zod's default unknown-key stripping — a property no test
pins. Adding `origin` to the schema, or a future `.passthrough()`, reopens it silently.

**Fix:** add a sibling test passing a forged `origin` and asserting the persisted envelope's
`origin.repoPath === cwd` and `origin.runId` is the stamped value — i.e. the forgery was discarded,
not merged.

## Also fix — cheap, do not loop for them

- **The `:507` HOME-unset test is a vacuous mutation guard** (`handle-stage-gate-hook.test.ts:507`).
  It targets `~/.luca/handoff/evil.json`, but `classify-write-path.ts:289` denies that path
  *unconditionally* — so deleting `|| osHomedir()` leaves it green. It is filed under "homedir
  fail-closed" and proves nothing about the HOME fallback. **`:489` is the real guard** (targets
  `~/.claude/settings.json`, no `.luca/` segment). Move `:507` into the mailbox-deny block and rename
  it to what it actually guards. This is the vacuity failure mode in its fifth disguise.
- **`in-progress` single-hop recovery has zero coverage** (`luca-handoff-complete.test.ts:133`). The
  block is named for it but drives to `complete` and asserts a second call is refused — exercising the
  else-branch with status `complete`, never `in-progress`. Gutting the handler so any non-`accepted`
  status errors would leave it green while destroying the only route out of a stranded envelope.
- **`describeCompleteHopFailure` wiring is untested** (`:234`). Asserted only as a pure function; no
  test reaches hop-2 failure with `droveThrough === true`, so deleting the recovery sentence from the
  handler leaves every test green.
- **`ac-11.2` tautology** (`luca-handoff-send.test.ts:79`) — `dirname(mailboxPath(id))` is
  `join(home,'.luca/handoff')` by construction, for any implementation including one that wrote
  nowhere. Delete it; the traversal property is better covered by the `../../evil` test at `:128`.
- **`list` fail-closed config branch and corrupt-envelope branch untested** (`luca-handoff-list.ts:132-134`,
  `:120-127`). Replacing the fail-closed ternary with a fail-OPEN read keeps all seven list tests green.
- **`expectedUpdatedAt` survives from the `--file` payload** when the flag is omitted
  (`handoff.ts:189`) — bounded impact (a wrong token can only cause a `conflict` refusal, never make a
  stale write succeed), but it contradicts the docstring. Strip it unconditionally like `id`.
- **Residual empty-homedir path** (`handle-stage-gate-hook.ts:116`) — if `os.homedir()` itself returns
  `''`, `classify-write-path.ts:263` skips the home-deny and `~/.claude/settings.json` classifies as
  `code`. One-line guard makes the fail-closed comment true.
- `accept` "writes nothing" and `reject` `not-found` coverage are asymmetric with their siblings.

## Verified CLEAN (recorded as evidence)

- **`send` strip-and-stamp is airtight** — `inputSchema` declares only the five author fields; Zod
  strips unknown keys; `HandoffTarget/Context/Callback` schemas have no `.passthrough()`; lifecycle
  fields are stamped ahead of author fields in the literal; `id` comes from `generateEnvelopeId`
  (sanitized to `ENVELOPE_ID_RE`), so no traversal.
- **`complete`'s `id` is spread AFTER the payload** (`handoff.ts:187-188`) — a payload key cannot
  shadow the flag.
- **No `--homedir` reaches any schema** — `ToolContext.homedir` is optional context only,
  `runWriteHandler` constructs `{ cwd }` with no homedir, and `rejectUnknownFlags` exits 1 on any
  undeclared flag.
- **`accept --auto` fails closed** on absent/empty allowlist and non-`pending` status; `readAllowlist`
  uses `safeParse` defaulting to `[]`.
- **`complete` validates before hop 1** (`:123-148`); hop 2's token comes from hop 1's returned
  envelope; the transport stamps a strictly-greater `updatedAt`, so the drive-through cannot
  self-conflict.
- **No existence oracle** — an id failing `ENVELOPE_ID_RE` returns plain `not-found`.
- **No envelope free text is interpolated into instruction-shaped text** anywhere in phase 2; the skill
  body is a static template.
- **Tests: no empty bodies, no `-t` filters, no grep-only probes.** Temp-homedir hygiene is clean —
  `mkdtemp` in all five files, threaded via `ctx.homedir`; the real `~/.luca/handoff/` is never touched.
  Lifecycle assertions re-read from disk via `readFileSync`, so a handler returning success text without
  writing would go red.
- **The `:489` HOME-unset test is a real mutation guard** — confirmed by static branch analysis.

## Tool-access disclosure

Both reviewers had **Read/Grep/Glob only, no Bash**. Neither could run `git diff` or the test suite;
all findings are read-derived, and the mutation questions were answered by static branch analysis
rather than by executing a mutant. This is the second phase in a row where reviewers lacked execution
access — already logged as `convention:reviewer-tool-access-disclosure`. The empirical half came from
the orchestrator: 33/33 checks, the ac-24 RED→GREEN observation, and the ac-19.3 mutation run.
