# Plan Review — Phase 01: Handoff envelope schema and local mailbox transport

Complexity CRITICAL · 2 revision rounds · **STATUS: APPROVED** · Blocking: 0 · Advisory: 1 (carried to execute)

## Provenance

Three reviews informed this plan:

1. The `luca: Architect` agent spawned its **own** reviewer during planning, which returned
   APPROVED/CONVERGED. That verdict was **overruled** — see round 1 below.
2. **Round 1** — independent cold plan-reviewer, orchestrator-spawned. NEEDS_REVISION, 4 blocking.
3. **Round 2** — independent cold plan-reviewer, fresh context. NEEDS_REVISION, 4 new blocking.

Round 3 verification was performed by the orchestrator directly rather than by a fourth reviewer:
the remaining fixes were mechanical and each claim was independently re-run against the codebase.

**Process finding worth carrying to `learn`:** the architect's self-review converged to APPROVED on
a plan in which 12 of 22 verification criteria would have passed whether or not the code existed.
An agent grading its own work is not a substitute for cold review. This is a Luca-level finding, not
a phase-level one.

---

## Round 1 — NEEDS_REVISION (4 blocking, 8 advisory)

| id | sev | finding | disposition |
|---|---|---|---|
| B1 | HIGH | 12 of 22 criteria were vacuous `bun test -t "<substring>"` probes — a `-t` filter matching zero tests exits 0. Each was the *sole* evidence for a locked decision. Contradicted an already-codified repo guard (G-DX-003, `archive/02-cost-per-outcome-report/plan-review.md:20`; `archive/03-pr-outcome-writeback/plan.md:84` anti-05). The architect's self-review had declared this "closed" because task prose *mandates* test names — invalid: violating the directive still leaves the criterion passing. | CLOSED r1 |
| B2 | HIGH | The result `reason` union could not express three required outcomes: duplicate-id `wx` rejection, `schemaVersion` mismatch, and fs failure (the cited `verification-result.ts:112-118` precedent **rethrows**, but the contract is never-throws). | CLOSED r1 — union fixed at 8 members |
| B3 | HIGH | No `target`/recipient field. In a flat machine-global mailbox, repo B's `list` would return every repo's envelopes including those meant for repo C. A regression against the original design sketch, which carried `to: {repoPath}`. | CLOSED r1 — `target.repoPath` + `targetRepoPath` filter |
| B4 | HIGH | `updateStatus(id, to, opts)` — `opts` unnamed and untyped while carrying two distinct payloads (CAS token, completion `result`). The one signature phases 2-5 all call. | CLOSED r1 — `UpdateStatusOptions` named, typed, exported |

Advisories A1-A8 (same-file concurrency hazard, deferred-probe annotation, `git status` vs committed
changes, line-based destructuring regex, unsound ac-03 substitution, incomplete barrel probe, narrow
anti-01/02 regexes, missing E4/D3 guards) — all applied in round 1.

## Round 2 — NEEDS_REVISION (4 blocking, 8 advisory)

All four round-1 blockers verified genuinely closed. ID stability and scope fence verified intact.
Four **new** blockers surfaced:

| id | sev | finding | disposition |
|---|---|---|---|
| G-DX-001 | HIGH | **ac-19 passed on an untouched tree.** `grep -qF "handoff"` already matched at `classify-write-path.test.ts:94` and `:184`. ac-25 (whole-file) also passed at HEAD. Both probes for D11 — the guard that agents cannot hand-forge envelopes, the stated mitigation for risk G1 — would pass if task 1.3.1 were never written. Strictly worse than the `-t` form round 1 removed. **Orchestrator-verified by direct execution.** | CLOSED r2 |
| G-SEC-001 | HIGH | **Path traversal in envelope `id`.** `ENVELOPE_ID_RE` was enforced on the generation side (1.1.4) but never on the consumption side. `read('../../.claude/settings')` resolves to `~/.claude/settings.json` and returns its contents; `updateStatus` on the same id atomically **overwrites** it. Phase 2's CLI feeds `id` straight from argv. This inverts the L4 rationale (context.md:22-23) — the CLI becomes a confused deputy with write access to the exact directory `HOME_DENIED_SUBDIRS` exists to protect. | CLOSED r2 |
| G-ARCH-001 | HIGH | `send`'s validation contract unmade, and the "exhaustive" 8-member union had no member for *invalid input envelope*. Executor forced to either skip validation (killing the schema-validated invariant that justifies the whole design) or invent a 9th member against instruction. | CLOSED r2 — `send` parses first, parse failure → `corrupt`, union stays at 8 |
| — | MED→HIGH | `list` on a **nonexistent mailbox dir** unspecified — the day-one state on every fresh machine, and the single most common first call. Raw `readdirSync` ENOENT would throw, violating never-throws. Promoted to blocking by the orchestrator. | CLOSED r2 — missing dir ⇒ `{ ok:true, envelopes: [] }` |
| G-DX-002 | HIGH | Claimed anti-06 is inert because macOS BSD grep lacks `-P`. | **REFUTED** — orchestrator ran `echo test \| grep -P "t.st"`; it matches on this machine. anti-06 left as-is. |

Round-2 advisories applied: base-sha fence pinned to literal `be715aa4` (the branch is divergent from
`main` and already carries luca-cli commits, so `merge-base HEAD main` would have failed on arrival,
training the executor to waive the fence); ac-31 deferred-probe annotation; `updateStatus` unknown-id
and `→ complete`-without-`result` edges specified; CAS token defined as the envelope's own `updatedAt`
from a prior `read()` (never `statSync` mtime) with every write stamping a strictly-greater value;
anti-07 widened to `--test-name-pattern` and `anti-NN` lines using bracket escapes so it does not match
its own line; anti-08 scoped to creation calls so a docstring may discuss the E4 no-lock decision; the
absent `delete`/`prune` method recorded as a known additive interface change for phase 2.

---

## Round 3 — orchestrator verification (APPROVED)

Each claim re-run directly against the tree:

| check | result |
|---|---|
| `grep -cE '^- \*\*(ac\|anti)-[0-9.]+\*\*:.*( -t \|--test-name-pattern)' plan.md` | **0** — no name-filtered probes; anti-07 self-exempts correctly |
| `grep -rlF "/.luca/handoff/" packages/luca-core/src/luca-dir/` | **no match** — ac-19 now non-vacuous |
| `ls packages/luca-core/src/handoff` | **No such file or directory** — every other `grep -qF` criterion fails today |
| `luca plan lint` | **0 warnings** |
| ac-35..ac-38 | direct runtime `bun -e` probes over a temp homedir for the four sole-evidence locked decisions (E4 `wx`, D1 CAS, L4 `0o700`, G5 corrupt-skip) — unfakeable by an empty test body |
| ID stability | ac-01..ac-31 keep numbers and meanings (ac-19's *probe* changed, its meaning did not); ac-32..ac-38, D20..D23 appended; nothing renumbered or deleted |
| scope fence | every `Files:` line under `packages/luca-core/`; zero luca-cli, zero luca-tools |

### The generalizable lesson

Round 1 replaced vacuous `-t` probes with source-presence greps. But **a `grep -qF` is only
non-vacuous if the literal is absent at HEAD** — ac-19's was already present, reintroducing the same
always-passes failure in a new shape. The plan now records that every grep literal was checked for
HEAD-absence. This belongs alongside G-DX-003 as a standing repo guard, and is carried to `learn`.

---

## Carried to execute (advisory, non-blocking)

**ac-35 is not runnable as literally written.** It references `globalThis.__e` with a
`/*valid envelope*/` placeholder, and ac-36/37/38 inherit "same harness". The executor must
substitute a real envelope literal. This must be fixed **up** — by constructing a valid envelope —
and never **down** by weakening the probe to something that passes trivially. Injected into the
executor's prompt at the execute step.

## Verdict

**APPROVED.** 15 tasks, 3 waves, 38 acceptance criteria, 8 anti-criteria, D1-D23 deliverables all
mapped. No blocking issues remain.
