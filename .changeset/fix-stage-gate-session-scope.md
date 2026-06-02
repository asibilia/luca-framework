---
"@alecsibilia/luca": patch
---

Session-scope the stage-gate hook so a pipeline running in one terminal no
longer fences off ad-hoc work in another terminal in the same repo.

Previously the PreToolUse stage-gate read the shared `.luca/state.json` and
enforced the current `pipelineStep` phase/tool matrix against **every**
session in the repo. A separate out-of-workflow terminal doing cleanup would
inherit the pipeline's phase restrictions — e.g. a `flutter test` run blocked
with `stage-gate BLOCK: Bash (category=bash-mutate) is not allowed in
phase=REVIEWING (pipelineStep=learn)` purely because a pipeline was mid-run
elsewhere.

Changes:

- Add `ownerSessionId` to `lucaStateSchema` — the Claude Code `session_id`
  (read from PreToolUse stdin) of the session driving the current run.
  Distinct from `sessionId`, which is the generated pipeline run-id used for
  ledger grouping and the lock `run_id`.
- Add a `luca state claim-owner --session-id=<id>` write-surface command that
  records `ownerSessionId`. The stage-gate hook invokes this handler on every
  `luca state advance` (the orchestrator-only command) rather than writing
  `state.json` directly — so the invariant "`.luca/state.json` is mutated
  solely through the `luca` write surface" is preserved: every `state.json`
  byte-write is owned by a registered write-surface handler. Re-stamping on
  each advance re-homes ownership when a new run starts in a different session.
  Best-effort — a stamp failure never breaks the gate.
- Non-owner ("bystander") sessions are exempted from the phase/tool matrix.
  The exemption runs **after** the always-denied path/command checks
  (`.git/`, `~/.claude/`, pipe-to-shell, …) and after `artifactPathGate`, so
  the security floor and `.luca/` artifact protection still apply to all
  sessions — only the phase-ordering matrix is relaxed.

Failure direction is conservative: unknown owner or unknown session falls
through to full enforcement, so the gate is only ever relaxed for a session
we are confident is a non-owner.

Also hardens two stage-gate classification bugs surfaced by a real run:

- **cwd-robust artifact classification.** `classifyWritePath` resolved the
  `.luca/`-relative path via `relative(cwd, path)`, which only works when the
  hook's `cwd` is the repo root. When a subagent/harness invoked the hook from
  a subdirectory, a legal artifact write (e.g. `verify.json` at the `verify`
  step, `learn.md` at `learn`) normalized to `../../.luca/…`, fell through to
  the `code` class, and the matrix wrongly blocked it during REVIEWING/PLANNING.
  A shared `toLucaRelative` resolver now locates the `.luca/` path segment
  directly, so artifact classification is cwd-independent; the stage-gate hook
  uses it for both classification and the artifact-path gate.
- **bash classifier over-blocking.** Read-only text filters (`sort`, `uniq`,
  `cut`, `tr`, `comm`, `diff`, `jq`, `rg`, `column`, `nl`, `tac`, `rev`,
  `paste`, `fold`, `join`) were missing from the read-only allowlist, so any
  pipeline through one (e.g. `find . | sort`) promoted to `bash-mutate` and was
  blocked in restrictive phases. Recognized top-level `luca` commands
  (`version`/`telemetry`/`rules` as read; `init`/`repair`/`doctor`/`retro`/…
  as `luca-write`) no longer fall through to `bash-mutate` either.
