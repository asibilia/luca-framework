# Phase 30 Research: Dogfood Build Stability

**Phase:** 30
**Phase Name:** Dogfood Build Stability
**Goal:** Consume own plugin during development without mid-session breakage. Freeze plugin artifacts during active sessions.
**Researcher:** lu-phase-researcher
**Date:** 2026-02-14

---

## 1. Current Build System Architecture

### 1.1 Build Pipeline (`scripts/build-all.ts`)

The unified build script follows a three-stage pipeline:

1. **Generate all outputs in memory** via `generateAllOutputs()` from `scripts/build-shared.ts`
2. **Clean stale files** from output directories (`.claude/`, `.cursor/`, `dist/plugin/`)
3. **Write all generated content to disk** from the in-memory Map

`generateAllOutputs()` produces a `Map<string, string>` of relative file paths to content strings. It compiles every entity from four registries (`agentRegistry`, `skillRegistry`, `ruleRegistry`, `hookRegistry`) through three format compilers (CLAUDE, CURSOR, PLUGIN).

### 1.2 Output Directories

| Directory                        | Contents                    | Consumed By                             |
| -------------------------------- | --------------------------- | --------------------------------------- |
| `.claude/agents/*.md`            | Compiled agent prompts      | Claude Code (reads at agent invocation) |
| `.claude/skills/<name>/SKILL.md` | Compiled skill definitions  | Claude Code (reads when skill invoked)  |
| `.claude/rules/*.md`             | Compiled rules              | Claude Code (reads as project rules)    |
| `.claude/hooks/*.sh`             | Hook shell scripts          | Claude Code (executes on tool events)   |
| `.claude/settings.json`          | Hook config + permissions   | Claude Code (reads at session start)    |
| `.cursor/agents/*.md`            | Compiled agent prompts      | Cursor IDE                              |
| `.cursor/skills/<name>/SKILL.md` | Compiled skill definitions  | Cursor IDE                              |
| `.cursor/rules/*.mdc`            | Compiled rules (MDC format) | Cursor IDE                              |
| `.cursor/hooks/*.sh`             | Hook shell scripts          | Cursor IDE                              |
| `.cursor/hooks.json`             | Hook config                 | Cursor IDE                              |
| `dist/plugin/`                   | Complete plugin package     | External consumers                      |

### 1.3 Build Invocation

The build is **manually triggered** only:

```bash
bun run build:all    # Full rebuild via package.json script
```

There are **no file watchers**, no `--watch` mode for builds, no chokidar, no nodemon, no automatic rebuild triggers. The `test:watch` script (`bun test --watch`) only watches test files, not build outputs.

### 1.4 Current File Counts

- 309 total output files across all three directories
- 26 agents (x3 formats = 78 files)
- 45 skills (x3 formats = 135 files)
- 18 rules (x2 formats = 36 files)
- 7 hook scripts (x2 platforms = 14 files)
- Plus plugin metadata (commands, manifest, README, hooks.json)

---

## 2. Current Rebuild Triggers

### 2.1 What Triggers Rebuilds

| Trigger                | Mechanism                              | When                                                                   |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `bun run build:all`    | Manual command                         | Developer explicitly runs                                              |
| Harness check          | `.planning/config.json` harness config | `build` check enabled, runs `bun run build:all` as phase boundary gate |
| Pre-commit drift check | `pre-commit-drift-check.sh` hook       | Detects drift but does NOT rebuild -- just blocks commit               |

### 2.2 What Does NOT Trigger Rebuilds

- Editing `src/` files does NOT auto-rebuild
- No file watchers exist for build output
- `post-edit-format.sh` and `post-edit-typecheck.sh` do NOT trigger rebuilds
- Saving or editing `.claude/` or `.cursor/` files does NOT trigger rebuilds

### 2.3 Pre-Commit Drift Detection

The `pre-commit-drift-check.sh` hook intercepts commit commands and:

1. Checks if staged files include output directories (`.claude/`, `.cursor/`, `dist/plugin/`) or source directories (`src/agents/`, `src/skills/`, etc.)
2. If relevant files are staged, runs `bun run ./scripts/check-drift.ts`
3. `check-drift.ts` regenerates all outputs in memory and compares against committed files
4. If drift detected, **blocks the commit** with exit code 2
5. Developer must run `bun run build:all` to fix

This is a **detection** mechanism, not an automatic rebuild. The critical insight is: drift detection runs `generateAllOutputs()` in memory, which means it runs all compilers. This takes a few seconds but does NOT write to disk.

---

## 3. Artifact Consumption Model

### 3.1 How Claude Code Reads Artifacts

Claude Code reads `.claude/` artifacts in several ways:

1. **`CLAUDE.md` (project instructions)**: Read once at session start and included in system context. This file is hand-authored, not build-generated.

2. **`.claude/rules/*.md`**: Read by Claude Code as project rules. Loaded at session start and cached. These are **build-generated** from `src/rules/`.

3. **`.claude/skills/<name>/SKILL.md`**: Read when a skill is invoked via `/skill-name`. These are **build-generated** from `src/skills/`.

4. **`.claude/agents/*.md`**: Read when an agent is spawned (e.g., by `lu-cognition` reading frontmatter from compiled agent .md files at runtime). These are **build-generated** from `src/agents/`.

5. **`.claude/hooks/*.sh`**: Executed on tool events (PostToolUse, PreToolUse, Stop, SessionStart, SessionEnd). These are **build-generated** from `src/hooks/scripts/`.

6. **`.claude/settings.json`**: Read at session start for hook configuration and permissions. Partially build-generated (hooks section).

7. **`.claude/settings.local.json`**: Permissions config, hand-authored, NOT build-generated.

### 3.2 When Are Artifacts Read?

| Artifact                           | Read When              | Caching                     |
| ---------------------------------- | ---------------------- | --------------------------- |
| Rules (`.claude/rules/`)           | Session start          | Cached for session duration |
| Skills (`.claude/skills/`)         | On skill invocation    | Read fresh each time        |
| Agents (`.claude/agents/`)         | On agent spawn         | Read fresh each time        |
| Hooks (`.claude/hooks/`)           | On matching tool event | Read fresh each time        |
| Settings (`.claude/settings.json`) | Session start          | Cached for session duration |

### 3.3 Self-Referential Consumption

This project is self-referential: it uses its **own compiled output** during development.

- When developing Luca, Claude Code reads `.claude/rules/*.md` (which are compiled from `src/rules/`)
- When running `/lu` skill, Claude Code reads `.claude/skills/lu/SKILL.md` (compiled from `src/skills/`)
- When hooks fire (format, typecheck, commit gate), they execute `.claude/hooks/*.sh` (compiled from `src/hooks/scripts/`)

**The breakage scenario**: If a developer runs `bun run build:all` mid-session after editing `src/` files, the compiled outputs in `.claude/` change underneath Claude Code. Skills, agents, and hooks could become inconsistent with what was loaded at session start.

---

## 4. Session Lifecycle

### 4.1 Session Start

1. `session-start.sh` hook fires (SessionStart event)
2. Creates/validates `.planning/` directory (BRAIN.md, MEMORY.md, WORKING.md, STATE.md, ROADMAP.md, config.json)
3. Detects runtime (bun vs node)
4. Sets environment variables (`LUCA_RUNTIME`, `LUCA_PLANNING_DIR`)

### 4.2 During Session

- `post-edit-format.sh` fires on every Edit/Write (synchronous)
- `post-edit-typecheck.sh` fires on every Edit/Write (async, non-blocking)
- `pre-commit-gate.sh` fires on commit commands (test + typecheck gate)
- `pre-commit-drift-check.sh` fires on commit commands (drift detection)

### 4.3 Session End

- `context-monitor.sh` fires on Stop events
- `session-persist.sh` fires on SessionEnd (updates WORKING.md timestamp)

### 4.4 No Session-Aware Build Gating

Currently, there is **no mechanism** to:

- Detect whether a session is active
- Prevent builds during active sessions
- Snapshot artifacts at session start
- Lock artifacts during a session

---

## 5. Existing Snapshot/Lock Mechanisms

### 5.1 No Existing Mechanisms

There are **no** existing:

- Symlinks or workspace self-references
- Artifact snapshot directories (like `.claude-snapshot/`)
- Build lock files (like `build.lock`)
- Session-aware build guards
- Stable artifact locations separate from `.claude/`

### 5.2 Related Patterns

The closest existing pattern is the **drift detection** in `check-drift.ts`, which generates all outputs in memory and compares them against disk. This demonstrates the ability to generate outputs without writing to the live `.claude/` directory.

---

## 6. Risk Analysis

### 6.1 Current Risks (What Can Break)

| Risk                                     | Likelihood | Impact   | Scenario                                                                       |
| ---------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------ |
| Mid-session skill corruption             | Medium     | High     | `bun run build:all` rewrites `.claude/skills/` while Claude is reading a skill |
| Hook script replacement during execution | Low        | Critical | Hook script replaced while another hook is executing                           |
| Rule changes mid-conversation            | Medium     | Medium   | Rules change mid-session, causing inconsistent behavior                        |
| Agent prompt changes mid-spawn           | Low        | High     | Agent .md file changes while agent is being spawned                            |
| Stale artifacts after src/ edit          | High       | Low      | Developer edits src/ but forgets to rebuild before testing                     |

### 6.2 The Core Problem

The problem is **not** automatic rebuilds (there are none). The problem is:

1. **Manual rebuild timing**: Developer runs `bun run build:all` during an active session
2. **No isolation**: Live `.claude/` directory is both the build output AND the runtime input
3. **No atomicity**: Build process cleans directories first, then writes files. During the clean phase, artifacts are missing.
4. **Harness-triggered rebuild**: The harness check in `config.json` has `build` enabled with command `bun run build:all`. If the harness runs mid-session, it rebuilds live artifacts.

---

## 7. Implementation Recommendations

### 7.1 DOGFOOD-01: Plugin Output as Workspace Self-Reference

**Goal**: Ensure the project consumes its own compiled artifacts as a workspace self-reference.

**Current state**: Already partially achieved. The project's `.claude/` and `.cursor/` directories ARE the compiled output, and they ARE consumed during development. The self-reference loop exists.

**Recommendation**: Formalize this by adding a section to CLAUDE.md or `.planning/config.json` that explicitly declares the self-referential consumption:

```json
{
  "dogfood": {
    "enabled": true,
    "source": "src/",
    "outputs": [".claude/", ".cursor/"],
    "build_command": "bun run build:all"
  }
}
```

**Implementation complexity**: TRIVIAL. This is documentation/config, not code.

### 7.2 DOGFOOD-02: Explicit Rebuild Script with Session Guard

**Goal**: Gate recompilation behind an explicit rebuild script that checks for active sessions.

**Approach A: Session Lock File** (Recommended)

1. `session-start.sh` creates a lock file (e.g., `.claude/.session-lock`) at session start
2. `session-persist.sh` removes the lock file at session end
3. `build-all.ts` checks for the lock file before rebuilding
4. If lock file exists, build warns and offers `--force` override

```bash
# session-start.sh addition
touch "$PROJECT_DIR/.claude/.session-lock"

# session-persist.sh addition (SessionEnd)
rm -f "$PROJECT_DIR/.claude/.session-lock"
```

```typescript
// build-all.ts addition
const lockFile = Bun.file(path.join(process.cwd(), ".claude", ".session-lock"));
if ((await lockFile.exists()) && !process.argv.includes("--force")) {
  console.error(
    "Build blocked: Active session detected (.claude/.session-lock exists)",
  );
  console.error("Run with --force to override, or end the session first.");
  process.exit(1);
}
```

**Approach B: PID-Based Detection** (Alternative)

Check for running Claude Code processes before building. Less reliable (multiple sessions, orphan processes).

**Implementation complexity**: SIMPLE. Lock file creation in hooks + guard check in build script.

### 7.3 DOGFOOD-03: No File Watchers During Active Sessions

**Goal**: Ensure no file watchers trigger plugin recompilation during active sessions.

**Current state**: This requirement is **already satisfied**. There are:

- No file watchers for build output
- No `--watch` mode for `build:all`
- No chokidar, nodemon, or similar tools
- The only "watch" is `bun test --watch` which watches test files, not build output

**Risk point**: The harness check in `.planning/config.json` has a `build` check enabled:

```json
{
  "name": "build",
  "command": "bun run build:all",
  "enabled": true,
  "timeout": 120,
  "parser": "generic"
}
```

This means the harness could trigger a rebuild during phase execution. To satisfy DOGFOOD-03:

- Either disable the `build` harness check during active sessions
- Or ensure the build command respects the session lock (from DOGFOOD-02)
- Or change the harness build check to `check:drift` (read-only verification) instead of `build:all` (destructive rebuild)

**Recommendation**: Change the harness `build` check from `bun run build:all` to `bun run check:drift`. This converts it from a rebuild trigger to a read-only verification. If drift is detected, the harness reports it as a failure rather than silently rebuilding.

**Implementation complexity**: TRIVIAL. Config change + documentation.

### 7.4 DOGFOOD-04: Session-Start Snapshot

**Goal**: Snapshot compiled artifacts at session start to a stable location.

**Approach A: Snapshot Directory** (Recommended)

At session start, copy `.claude/` artifacts to a stable snapshot directory:

```bash
# In session-start.sh
SNAPSHOT_DIR="$PROJECT_DIR/.claude-snapshot"
if [ -d "$PROJECT_DIR/.claude/agents" ]; then
  rm -rf "$SNAPSHOT_DIR"
  mkdir -p "$SNAPSHOT_DIR"
  cp -r "$PROJECT_DIR/.claude/agents" "$SNAPSHOT_DIR/agents"
  cp -r "$PROJECT_DIR/.claude/skills" "$SNAPSHOT_DIR/skills"
  cp -r "$PROJECT_DIR/.claude/rules" "$SNAPSHOT_DIR/rules"
  cp -r "$PROJECT_DIR/.claude/hooks" "$SNAPSHOT_DIR/hooks"
  # Do NOT copy settings.json or settings.local.json (live config)
fi
```

**Problem**: Claude Code reads from `.claude/`, not `.claude-snapshot/`. Changing where Claude Code reads artifacts is not under our control -- it's a Claude Code platform behavior.

**Approach B: Build-Time Atomic Write** (More Practical)

Instead of snapshotting, make the build process atomic:

1. Build writes to a staging directory (`.claude-staging/`)
2. Only swap to live `.claude/` when all files are written successfully
3. Use rename operations (atomic on same filesystem) for the swap

```typescript
// build-all.ts modification
const stagingDir = path.join(process.cwd(), ".claude-staging");
// ... write all files to staging ...
// Atomic swap:
await rename(".claude", ".claude-backup");
await rename(".claude-staging", ".claude");
await rm(".claude-backup", { recursive: true });
```

**Problem**: Renaming `.claude/` directory might confuse Claude Code's file watching. The settings.local.json file (permissions) must be preserved.

**Approach C: Lock + Warn (Simplest, Most Reliable)**

Instead of snapshotting, combine the session lock (DOGFOOD-02) with clear warnings:

1. Session start creates lock file
2. Build checks lock file and warns
3. Build only proceeds with `--force`
4. If forced, the build uses atomic writes (write all to temp, then rename)
5. Session end removes lock file

This is the simplest approach and avoids the complexity of snapshot management, directory swaps, or changing Claude Code's artifact resolution paths.

**Approach D: Manifest-Based Freshness Check** (Most Elegant)

Write a manifest file (`.claude/.build-manifest.json`) during each build containing:

- Build timestamp
- Source hash (hash of all src/ files)
- Output file count

At session start, the `session-start.sh` hook reads this manifest and records it in WORKING.md. Before any build, compare the current manifest against the session-start manifest. If they differ, the artifacts changed mid-session.

```json
{
  "built_at": "2026-02-14T00:32:00Z",
  "source_hash": "abc123...",
  "output_count": 309,
  "version": "1.3.3"
}
```

**Implementation complexity**: MODERATE. Manifest generation in build + manifest checking in session hooks.

---

## 8. Recommended Implementation Plan

### Priority Order

1. **DOGFOOD-03** (already satisfied; verify + change harness config) -- TRIVIAL
2. **DOGFOOD-02** (session lock file + build guard) -- SIMPLE
3. **DOGFOOD-01** (config formalization) -- TRIVIAL
4. **DOGFOOD-04** (build manifest + session-start recording) -- MODERATE

### Suggested Approach (Combined)

The most practical implementation combines:

1. **Session lock file** in `session-start.sh` / `session-persist.sh`
2. **Build guard** in `build-all.ts` that checks for lock file
3. **Harness config change**: `build` check uses `check:drift` (read-only) instead of `build:all`
4. **Build manifest** (`.claude/.build-manifest.json`) written at build time
5. **Session manifest check** in `session-start.sh` that records build manifest at session start
6. **.gitignore update** for `.claude/.session-lock` and `.claude-snapshot/` if used
7. **Config formalization** of the dogfood relationship in `.planning/config.json`

### Files to Create or Modify

| File                                          | Action            | Purpose                                                            |
| --------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| `src/hooks/scripts/session-start.sh`          | Modify            | Create session lock + record build manifest                        |
| `src/hooks/scripts/session-persist.sh`        | Modify            | Remove session lock                                                |
| `scripts/build-all.ts`                        | Modify            | Add session lock guard + write build manifest                      |
| `.planning/config.json`                       | Modify            | Change harness build check to `check:drift`; add `dogfood` section |
| `.gitignore`                                  | Modify            | Add `.claude/.session-lock`                                        |
| `scripts/build-manifest.ts`                   | Create (optional) | Manifest generation utility                                        |
| `__tests__/scripts/dogfood-stability.test.ts` | Create            | Tests for lock file guard and manifest                             |

### Test Plan

1. **Lock file creation**: Verify `session-start.sh` creates `.claude/.session-lock`
2. **Lock file removal**: Verify `session-persist.sh` removes `.claude/.session-lock`
3. **Build guard**: Verify `build-all.ts` refuses to build when lock file exists
4. **Build guard override**: Verify `--force` flag overrides lock
5. **Build manifest**: Verify manifest is written after successful build
6. **Harness config**: Verify harness uses `check:drift` not `build:all`
7. **Drift detection still works**: Verify `check-drift.ts` still catches drift
8. **Full integration**: Start session, edit src/, attempt build (should warn), force build, verify no mid-session breakage

---

## 9. Open Questions

1. **Claude Code session detection**: Is there a reliable way to detect active Claude Code sessions beyond the lock file approach? (e.g., `CLAUDE_SESSION_ID` environment variable, process detection)

2. **Multiple concurrent sessions**: If two Claude Code sessions are active in the same project, the lock file approach handles this (both sessions write a lock, build is blocked for both). But is this the desired behavior?

3. **Cursor IDE**: Should the same stability mechanism apply to `.cursor/` artifacts? Cursor may have different artifact caching behavior.

4. **Stale lock files**: What if a session crashes without running `session-persist.sh`? The lock file would persist and block future builds. A TTL-based approach (lock file contains timestamp, expires after N hours) could handle this.

5. **dist/plugin/ stability**: Should `dist/plugin/` also be protected? It is not consumed during development (only during plugin distribution), so it may not need protection.

---

## 10. Summary of Key Findings

1. **No file watchers exist** -- DOGFOOD-03 is largely satisfied by the current architecture. The only risk is the harness `build` check.

2. **The build is manual-only** -- The core problem is developer timing, not automatic triggers.

3. **The self-referential loop exists** -- `.claude/` is both build output and runtime input. This is the fundamental architectural tension.

4. **Build is non-atomic** -- The build process cleans directories first, creating a window where artifacts are missing. This is the highest-severity issue.

5. **Session lifecycle hooks exist** -- `session-start.sh` and `session-persist.sh` provide natural extension points for lock file management.

6. **Drift detection is read-only** -- `check-drift.ts` can verify build freshness without writing to disk. Changing the harness to use this is the simplest safety improvement.

7. **Implementation is SIMPLE to MODERATE** -- Most changes are additions to existing hooks and a guard in `build-all.ts`. No architectural changes needed.

---

_Research completed: 2026-02-14_
_Source files examined: 15+ across scripts/, src/hooks/, .claude/, .planning/_
