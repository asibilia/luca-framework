# PROTOTYPE: Luca v1 tracer bullet (#334)

**Throwaway.** Not the engine. No tests, no polish. Delete it once the real engine exists.

It answers one question: does the whole pipeline work for one real ticket? A Bun script drives Claude Code agents through the Claude Agent SDK:

intake → worktree → test-writer → red check → leftover scan → commit → implementer → gates → leftover scan → commit → ticket review (and fix rounds) → push → one draft PR.

## Run

```sh
cd prototypes/tracer-bullet && bun install && cd -

# the spine, debug mode (every role on Haiku, never pushes)
bun prototypes/tracer-bullet/run.ts --spec 351 --haiku

# the final run (every role on Opus 5.5); --open-pr allows the push and one draft PR
bun prototypes/tracer-bullet/run.ts --spec 351 --open-pr

# the guard, MCP, messaging, and bad-result probes (Haiku)
bun prototypes/tracer-bullet/experiments.ts [--only 1a-commit,4-message] [--preflight-only]
```

Journals go to `runs/PROTOTYPE-wipe-me-<run-id>.jsonl`. Run worktrees go to `/tmp/luca-tracer/<run-id>/wt`.

Results: [FINDINGS.md](FINDINGS.md).
