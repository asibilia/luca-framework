PERSPECTIVE: independence
VERDICT: REQUEST_CHANGES

## Verdict

REQUEST_CHANGES — the temp-index snapshot mechanism itself is sound (verified: real index/worktree untouched, unborn-branch fallback, consume-once on every diff branch, fail-safe `ambiguous` on missing/unparsable/mismatched payload). But the changed-set ∩ cite-set intersection has four independent ways to produce a **false `zero-overlap`/`empty`** — each one violates the hard constraint that the gate must never skip a re-review that could have caught something.

## MUST-FIX

- [MUST-FIX] Rename detection erases cited old paths from the changed set. `git diff <prior> <current> --name-only` runs with git's default rename detection (on since 2.9, and further user-configurable via `diff.renames`). A detected rename emits only the NEW path, so when the executor "addresses" a finding by renaming the cited file and editing it, the cited old path never appears in `changed_paths` → intersection is empty → false `zero-overlap` → skip. Behavior is also config-dependent across machines (`diff.renames=copies` etc.), so the same worktree state can gate differently.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:278
  Suggestion: invoke as `git -c diff.renames=false diff --no-renames <prior> <current> --name-only` so a rename surfaces as delete(old)+add(new) and both paths enter the changed set, independent of user config.
  Cross-phase: false

- [MUST-FIX] `core.quotepath` breaks the string intersection for non-ASCII paths. With the default `core.quotepath=true`, git prints e.g. `"src/caf\303\251.ts"` (quoted, escaped) in `--name-only` output. The cite parsed from the audit is the literal `src/café.ts`, so `citeSet.has(path)` at luca-snapshot-diff.ts:359 can never match — a changed cited file counts as changed-but-uncited → false `zero-overlap`. (Also weakens the `.luca/` exclusion at :158-160 for quoted `.luca` paths, though that direction is conservative.)
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:278
  Suggestion: add `-c core.quotepath=false` to the diff invocation, or use `-z` and split on NUL.
  Cross-phase: false

- [MUST-FIX] Cites that parse "successfully" but are unmatchable are silently dropped from the intersection. `CITE = /^(.+):(\d+)$/` (luca-snapshot-diff.ts:52,103-110) accepts absolute paths (`/Users/.../src/a.ts:12`), `./`-prefixed paths, and multi-path lines like `File: a.ts:12, b.ts:30` (captured path becomes the garbage string `a.ts:12, b.ts`). None of these can ever equal a repo-relative git path, so the cite is effectively deleted without triggering the parse-failure→`ambiguous` fail-safe — the executor edits `a.ts` and the gate returns `zero-overlap`. This is not hypothetical drift: the prior-wave audit `.luca/phases/01-reduce-per-phase-review-fan-out-cost-precomputed-diff-gated-convergence-re-review-320/audits/independence-auditor.md:45` already carries a `File:` line with a parenthetical suffix (real reviewers deviate), and the shared subagent prefix instructs "always absolute" paths in reviewer output, actively pushing toward the absolute-path failure mode.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:103
  Suggestion: after parsing, validate every cite path resolves in the prior tree, the current tree, or the worktree (`git ls-tree`/`cat-file -e <tree>:<path>`); normalize a leading `./` and strip a `<cwd>/` prefix from absolute paths; any cite that still resolves nowhere → return `{ ok: false }` so the handler falls to `ambiguous`. This also covers case-mismatch cites on case-insensitive filesystems.
  Cross-phase: false

- [MUST-FIX] An actionable finding with no `File:` cite is silently unrepresented, making `zero-overlap` unprovable by the handler's own contract. The doc at luca-snapshot-diff.ts:26-32 defines `zero-overlap` as "PROVABLY no changed path is cited" and `ambiguous` as "anything that prevents a proof". A `- [MUST-FIX]` bullet with zero `File:` lines (e.g. a repo-wide or cross-cutting finding) parses OK and contributes nothing to `citeSet`; if any other finding has a cite, `citePaths` is non-empty, the :351 empty-cite fail-safe never fires, and the gate returns `zero-overlap` while an uncited MUST-FIX — which any change could relate to — goes un-re-reviewed. Tests only exercise audits where every actionable finding is cited (luca-snapshot-diff.test.ts:86-104).
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:75
  Suggestion: in `parseAuditCitePaths`, track cites-per-finding while in `collect` mode; when a MUST-FIX/SHOULD-FIX finding closes (next bullet or EOF) with zero parsed cites, return `{ ok: false, error: 'actionable finding without a File: cite' }` → `ambiguous`.
  Cross-phase: false

- [MUST-FIX] Double-create clobber nullifies the gate with no trace. `luca snapshot create` unconditionally overwrites an existing unconsumed payload (luca-snapshot-create.ts:176-181), and the classifier registers `snapshot create` as `luca-write` legal in every non-IDLE phase (classify-bash-command.ts:270) with no allowedPhases on the handler. Any agent that runs `create` during review re-entry — after fixes, before `diff` (a one-line prose-ordering hallucination away, and invocable by any subagent) — resets the baseline to the current worktree, guaranteeing `empty` → skip, with nothing in the payload to detect it. The prose delegates "ALL validation" to the CLI (lu-review/index.ts:29), but the CLI cannot validate the one thing that matters here: that the snapshot predates the fixes.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.ts:176
  Suggestion: make `create` refuse (isError, "unconsumed snapshot payload exists — run `luca snapshot diff` to consume it first") when the payload file already exists; legitimate loop-backs always consume via `diff` before the next Route B `create`, so the guard costs nothing on the happy path. Alternatively (or additionally) stamp `reviewIteration` into the payload and have `diff` reject a payload minted in the current review pass.
  Cross-phase: false

## SHOULD-FIX

- [SHOULD-FIX] phase-execute's G-ARCH-001 "accepted limitation" claim is wrong for one branch: it states the `--quality-fixes` path "always takes the full re-review" because the empty cite set yields `ambiguous` — but an empty cite set with an empty changed set yields `empty` (luca-snapshot-diff.ts:343-350), which SKIPS. A fix round that changed nothing outside `.luca/` skips round-2 on that path despite unresolved inline findings and no parseable audits.
  File: packages/luca-tools/src/artifacts/skills/phase-execute/index.ts:892
  Suggestion: either correct the prose, or have the CLI return `ambiguous` for empty-changed + empty-cite (empty cite set means the gate has no evidence either way).
  Cross-phase: true

- [SHOULD-FIX] A thrown exception in the diff handler after payload consumption (e.g. `Bun.spawn` ENOENT when git is missing, or fs errors inside `buildWorktreeSnapshotTree` outside its try) escapes as a crash instead of the `ambiguous` verdict envelope, breaking the "always returns a verdict" contract the prose relies on.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:253
  Suggestion: wrap the post-consumption body in try/catch → `diffResult('ambiguous', …)`.
  Cross-phase: false

- [SHOULD-FIX] Snapshot-arming inconsistency across paths: lu-review creates the snapshot only "If there are MUST-FIX findings" while review-mode Route B creates it for MUST-FIX **or** SHOULD-FIX. A SHOULD-FIX-only loop-back via lu-review re-enters with no payload → ABSENT → full re-review (safe but defeats the optimization this phase exists to enable, and the two prose bodies contradict each other).
  File: packages/luca-tools/src/artifacts/skills/lu-review/index.ts:65
  Suggestion: align lu-review's create trigger with review.ts Route B ("MUST-FIX or SHOULD-FIX").
  Cross-phase: true

- [SHOULD-FIX] Gitignored-but-cited files are invisible to both snapshot trees (`add -A` honors ignore rules for untracked files), so edits to a cited ignored file can yield `empty`/`zero-overlap`. Same class: cites inside a submodule can never match (the changed set contains only the submodule root gitlink path).
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-create.ts:103
  Suggestion: the cite-resolution check from MUST-FIX 3 handles both (an ignored/submodule-interior cite resolves in no tree → `ambiguous`); at minimum document the limitation in the handler doc comment.
  Cross-phase: false

## Notes

- [NOTE] classify-bash-command.test.ts:288 asserts on `luca snapshot diff --json`, but the CLI rejects `--json` via `rejectUnknownFlags` (snapshot.ts:52) — the classifier result is correct, the fixture just exercises a flag that doesn't exist.
- [NOTE] Temp-index lifecycle is otherwise clean: unique `randomUUID()` names prevent cross-process collisions, `GIT_INDEX_FILE` is scoped to exactly the three capture spawns, and `finally` removes both the index and its `.lock`. SIGKILL leaves only uniquely-named tmpdir litter.
- [NOTE] The create→diff race (concurrent processes) degrades safely: a partial payload read fails JSON.parse → `ambiguous`; a lost consume race → `missing` → `ambiguous`.
- [NOTE] Sparse-checkout, CRLF/.gitattributes drift, and mode-change edge cases are self-consistent because create and diff build both trees with the identical mechanism — divergence only ever enlarges the changed set (conservative direction).
- [NOTE] Verified sound: consume-once delete before any branch (luca-snapshot-diff.ts:196-202); phase-mismatch staleness guard (:244-251); tree-object verification via `rev-parse --verify` peeling (:253-266); empty-cite + non-empty-change → `ambiguous` no-vacuous-skip rule (:351-358); index/worktree non-mutation covered by tests (luca-snapshot-create.test.ts:88-115, luca-snapshot-diff.test.ts:283-308); unborn-branch capture (luca-snapshot-create.test.ts:117-135).

## Round 2

Convergence re-review of the fix wave (packages/luca-cli only; prose untouched). Each claimed resolution re-verified adversarially against the updated sources — I attempted to construct a false-skip input through every new guard.

### Resolved — confirmed with evidence

- **R1 MF-1 (rename detection): RESOLVED.** `--no-renames` is on the diff spawn (packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:326-334, rationale comment :320-325). The command-line flag overrides any `diff.renames` config value (including `copies`, since copy detection requires rename detection), so behavior is machine-independent. Regression test luca-snapshot-diff.test.ts:160-176 renames a cited file with identical content (the exact-rename case detection would collapse) and asserts BOTH `tracked.txt` (old, cited) and `renamed.txt` appear in `changed_paths` with verdict `overlap`.
- **R1 MF-2 (core.quotepath): RESOLVED.** `-c core.quotepath=false` precedes the `diff` subcommand (luca-snapshot-diff.ts:327-329 — correct `-c` placement). Test luca-snapshot-diff.test.ts:178-194 creates `ä.ts` and asserts the emitted changed path is unquoted and literal.
- **R1 MF-4 (cite-less actionable findings): RESOLVED.** `uncitedActionable` tracking (luca-snapshot-diff.ts:99-157) fails parsing when a MUST-FIX/SHOULD-FIX bullet closes with zero cites, checked at both the next-bullet boundary (:107-112) and EOF (:152-157). Probed adversarially: last-finding-uncited (EOF path — test :447-450), uncited SHOULD-FIX followed by cited MUST-FIX (:452-457), uncited-actionable-then-NOTE (the bullet branch checks the flag before severity dispatch — caught), multiple `File:` lines per finding (first clears the flag), `File:` lines while in skip mode (flag cannot be set in skip mode — consistent). NOTE bullets (:459-463) and empty `## MUST-FIX` sections (:465-471) correctly exempt. Integration test :304-318 confirms `ambiguous` end-to-end.
- **R1 MF-3 (unmatchable cite forms): PARTIALLY RESOLVED — residual below.** `isPlainRepoRelativePath()` (luca-snapshot-diff.ts:63-69) rejects absolute POSIX paths, Windows drive paths, backslashed paths, and `.`/`..` segments → parse failure → `ambiguous` (end-to-end tests luca-snapshot-diff.test.ts:272-302; unit tests :432-445). Those routes are closed.

### Residual MUST-FIX (carryover from R1 MF-3, narrowed — not new)

- [MUST-FIX] Colon/whitespace-embedded cite strings still pass the new guard and silently drop the real cite from the intersection. `CITE = /^(.+):(\d+)$/` strips only the TRAILING `:NN`, and `isPlainRepoRelativePath()` checks only absolute/backslash/dot-segment shapes. Two accepted-garbage forms remain constructible: (a) `File: src/a.ts:12:5` — the common grep/tsc `path:line:col` style — parses to citeSet entry `src/a.ts:12`; (b) `File: src/a.ts:12 and src/b.ts:30` — multi-path prose — parses to `src/a.ts:12 and src/b.ts`. Both strings contain no backslash, no leading `/`, and no `.`/`..` segment, so they are ACCEPTED into `citeSet`, where they can never equal a git changed path. Executor edits `src/a.ts` → intersection at luca-snapshot-diff.ts:415 is empty → false `zero-overlap` → skip. Same silent-cite-deletion class the wave set out to close; the shape check closed the prefix routes but not the embedded-separator routes.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:63
  Suggestion: extend the guard to reject any extracted cite path containing `:` or whitespace (fail-safe → `ambiguous`; colons/spaces in real repo paths are vanishingly rare, and the cost of a false reject is only a full re-review). Or adopt the R1 suggestion outright: resolve each cite against the prior tree, current tree, or worktree (`git cat-file -e <tree>:<path>`) and map any unresolvable cite → `ambiguous` — which also closes case-mismatch cites on case-insensitive filesystems, still unhandled by the shape check.
  Cross-phase: false

### New SHOULD-FIX surfaced by the fix wave

- [SHOULD-FIX] Unicode-normalization mismatch acknowledged but not closed: the new non-ASCII test itself must call `.normalize('NFC')` before comparing (luca-snapshot-diff.test.ts:190-191 — "macOS filesystems may store the name decomposed"). When git emits an NFD changed path (macOS with `core.precomposeunicode` unset/false) and the audit cite is NFC (how text is typically authored), the cite is accepted but unmatchable → same silent-drop class → potential false `zero-overlap`. The quotepath fix made paths literal but not canonical.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:344
  Suggestion: apply `.normalize('NFC')` to both the `changedPaths` entries (:344-348) and the parsed cite paths (:150) before intersecting.
  Cross-phase: false

### Backlog disposition of R1 MF-5 (double-create clobber) — ACCEPTED, with caveat

I challenge-tested the "requires prose misuse, not in-band" claim and it holds. Every prosed `create` site (review.ts Route B step 2, lu-review Aggregate at lu-review/index.ts:65, phase-execute/index.ts:1253) fires strictly BEFORE the loop-back into the fix wave, and every prosed `diff` site fires at re-entry BEFORE any fan-out — no in-band instruction sequence places a `create` between fixes and `diff`. The stranded-payload orderings I could construct (aborted loop-back, crash mid-execute, budget-exhausted exit then a later re-review) all degrade conservatively: an older tree only enlarges the changed set. The residual risk is out-of-band agent drift — real, since the classifier permits `create` from any subagent in any non-IDLE phase (classify-bash-command.ts:273) — but it is a defense-in-depth guard, not an in-band route. Backlog todo `snapshot-gate-guard-against-double-snapshot-create-resetting` is an acceptable disposition. Caveat: the new `prior_tree` envelope field (luca-snapshot-diff.ts:175; test :156) records which tree was consumed, so a clobber is now at least post-hoc auditable when the skip note cites the sha — partially mitigating the "no trace" half of the original finding.

### R1 SHOULD-FIX dispositions

All four remain open (prose untouched by design this wave). R1 SF-2 (crash-after-consumption: an unwrapped `Bun.spawn` throw — e.g. git binary missing — still escapes the handler after the payload is consumed; the body below luca-snapshot-diff.ts:236 remains unguarded) is CLI-side and was in scope for this wave — recommend bundling its try/catch → `ambiguous` wrapper with the residual MUST-FIX fix. R1 SF-1 (phase-execute:892 `empty`-branch prose claim), SF-3 (lu-review:65 arming trigger), and SF-4 (gitignored/submodule cites) carry forward.

### Round 2 notes

- [NOTE] The `prior_tree` envelope addition is additive and satisfies the prose requirement to cite the snapshot tree sha in skip notes; review.ts:94's four-key envelope description is now cosmetically stale (five keys). Fold into the next prose wave.
- [NOTE] `snapshotPayloadSchema` (luca-snapshot-create.ts:24-27) replacing the manual typeof checks is equivalent-or-stricter (`min(1)` on both fields); non-strict object parsing ignores extra keys — fine, since the tree is still independently verified via `rev-parse --verify ^{tree}` (luca-snapshot-diff.ts:293-298).
- [NOTE] The shared `runGit` extraction (luca-snapshot-create.ts:54-69) is behavior-identical to the two prior copies; `GIT_INDEX_FILE` scoping is unchanged (env passed only on the three capture spawns).

### Round 2 verdict

REQUEST_CHANGES — 4 of 5 R1 MUST-FIX routes genuinely closed with regression coverage; 1 residual false-skip route remains constructible through the new cite-shape guard (embedded `:`/whitespace forms). Backlog disposition of the double-create guard accepted.

## Round 3

Final convergence check, scoped to the Round 2 residual MUST-FIX (embedded-separator cite forms) plus the bundled R1 SF-2 fix.

### Residual MUST-FIX (R2): RESOLVED — verified

- `CITE` tightened to `/^([^:\s]+):(\d+)$/` (luca-snapshot-diff.ts:62, rationale comment :56-61): the path group now admits neither colon nor whitespace, so a cite line must be exactly one plain token plus one trailing `:NN`.
- Both Round 2 exhibits now fail to match → unparsable-cite error (:146-152) → `ambiguous`. Verified in tests: `src/a.ts:12:5` (unit luca-snapshot-diff.test.ts:489-492; handler-level end-to-end :304-318) and `src/a.ts:12 and src/b.ts:30` (unit :494-499; handler-level :320-334). Positive anchor `src/a.ts:12` still parses (:501-505), so the guard is not vacuous.
- `isPlainRepoRelativePath` retained with new backslash (:479-482) and Windows-drive (:484-487) unit tests. The layering is genuinely two-tier, not redundant: a backslashed path like `src\dir\a.ts` contains no colon/whitespace and PASSES the tightened regex — only the shape guard rejects it — so retaining the guard is load-bearing.

### Bundled R1 SF-2 (crash-after-consumption): RESOLVED — verified

Post-consumption pipeline extracted to `computeDiffVerdict()` (luca-snapshot-diff.ts:318-322) with the call site wrapped in try/catch (:287-303), mapping any unexpected throw (e.g. `Bun.spawn` ENOENT when the git binary is missing) to a controlled `ambiguous` envelope that carries `prior_tree`. Consume-once ordering preserved: the payload is deleted at :246, before the guarded region.

### Adversarial re-check: remaining unmatchable-cite routes

I attempted to construct a cite that (a) matches the tightened regex, (b) passes `isPlainRepoRelativePath`, and (c) can never equal a git `--name-only` path:

1. **Punctuation wrapped around the path only** — `` File: `src/a.ts`:12 `` or `File: "src/a.ts":12`. Backtick/quote characters are neither colon nor whitespace, so the path group matches, the shape guard passes (no leading `/`, no backslash, no dot-segment), and the string can never equal a real repo path. HOWEVER, the common markdown drift — backticking the whole cite (`` `src/a.ts:12` ``) — ends in a backtick, fails the `\d$` anchor, and correctly falls to `ambiguous`; only the unusual path-only-wrapped hybrid slips through. Filed as SHOULD-FIX below, not MUST-FIX: it requires an idiosyncratic half-formatted cite rather than any common convention, while every common drift form (whole-cite backticks, line ranges `a.ts:12-14`, parentheticals, multi-path prose, line:col, absolute/relative prefixes, backslashes) now fails safe.
2. **Wrong-but-plausible path strings** — typos, case variants on case-insensitive filesystems, NFC/NFD variants. Irreducible under any string-matching design (even tree-resolution cannot distinguish a cite of the wrong existing file); the NFD variant is already filed (Round 2 SHOULD-FIX) and the class stands as a documented accepted limitation.

No remaining route rises to MUST-FIX.

### Over-rejection check

The tightened regex cannot reject a legitimately-citable path under this repo's conventions: filenames are kebab-case ASCII (`[a-z0-9-./]`, enforced by the file-naming rule — no spaces or colons), and both the deep-path anchor (`src/dir/deep/file.test.ts:104`) and the plain anchor (`src/a.ts:12`, test :501-505) parse. Line-range cites (`:12-14`) over-reject to `ambiguous` — the fail-safe direction, and the reviewer format contract mandates single `path:line` anyway. No legitimate skip is lost in-repo.

- [SHOULD-FIX] Path-only punctuation wrapping (`` File: `src/a.ts`:12 ``, `File: "src/a.ts":12`) still yields an accepted-but-unmatchable citeSet entry — the last constructible silent-drop form. Low likelihood (requires wrapping the path while leaving `:line` outside the wrapper), and a one-character-class fix closes it.
  File: packages/luca-cli/src/write-surface/handlers/luca-snapshot-diff.ts:62
  Suggestion: extend the excluded class to also reject backtick and quote characters in the path group (or add them to `isPlainRepoRelativePath`), so wrapped-path cites fail safe to `ambiguous`.
  Cross-phase: false

### Round 3 verdict

APPROVE — the residual embedded-separator route is closed with negative and positive regression coverage at both unit and handler level (luca-snapshot-diff.ts:62; tests :304-334, :479-505), the crash-after-consumption hole is closed (:287-303 via `computeDiffVerdict`), and the only remaining unmatchable-cite constructions require either idiosyncratic path-only punctuation wrapping (filed as a trivial SHOULD-FIX) or wrong-path cite strings that no string- or resolution-based gate can fully exclude (accepted limitation; NFD variant already filed). Verified locations for this approval: luca-snapshot-diff.ts:62 (tightened CITE regex), :63-69 (retained shape guard — load-bearing for backslash forms that pass the regex), :287-303 (post-consumption try/catch), luca-snapshot-diff.test.ts:304-334 and :479-505 (exhibit regressions + positive anchor).

CONSOLIDATED (current open, post-Round 3):
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 5
  NOTE_COUNT: 8
  CROSS_PHASE_COUNT: 2
