# Decision: Sub-agent session lock bypass via LUCA_SESSION_ACTIVE

**Date:** 2026-03-06
**Status:** Accepted
**Scope:** `scripts/build-all.ts`, `src/hooks/scripts/session-start.sh`

## Context

The `session-start.sh` hook creates `.claude/.session-lock` at session start to prevent concurrent `bun run build:all` invocations from overwriting generated output mid-session. However, sub-agents spawned by phase-execute (lu-executor, lu-verifier, etc.) run _inside_ the same session and inherit its environment.

When a sub-agent calls `bun run build:all` (e.g., to rebuild generated output after editing source files), the build script sees the parent session's lock and exits with code 1. The sub-agent handles the error and reports "Done", but the build didn't actually run. In some cases, the error handling or retry logic adds latency that contributes to orchestrator freezes.

## Decision

1. `session-start.sh` exports `LUCA_SESSION_ACTIVE=1` via `CLAUDE_ENV_FILE`
2. `build-all.ts` checks for this env var before the lock guard
3. If `LUCA_SESSION_ACTIVE=1`, the lock is silently bypassed (no warning, no `--force` needed)

This is safe because:

- Sub-agents are part of the same session that created the lock
- The lock exists to prevent _external_ concurrent builds, not _internal_ ones
- Sub-agents inherit the env var automatically — no configuration needed

## Alternatives Considered

- **Always use `--force` in sub-agents**: Requires updating every skill/agent that might call build. Fragile — new agents would need to remember this.
- **Remove the lock entirely**: Loses protection against external concurrent builds during a session.
- **PID-based lock checking**: Compare lock PID with current process tree. More complex, platform-dependent, and Bun's `process.pid` for sub-agents may differ.

## Consequences

- Sub-agents can now build without friction during active sessions
- External `bun run build:all` calls (from a terminal while a session is active) still get blocked as intended
- The env var is session-scoped — it doesn't persist after the session ends
