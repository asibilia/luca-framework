# Pi Extension Security Model

## Overview

Luca's Pi extensions execute shell commands via Node.js `execSync` to provide verification, build, and task-loop capabilities to Pi's LLM agent. This document describes the accepted risk model for command execution and the defense layers that mitigate it.

Two extensions contain command injection vectors that are **design-inherent** — the tools exist specifically to run commands. The risk is accepted and mitigated by Pi's permission model, which requires explicit user approval for every tool execution.

## Authentication Requirements

Anthropic enforces server-side restrictions on OAuth subscription tokens (`sk-ant-oat01-*`) for third-party API calls (as of Jan–Feb 2026). Extensions that make Anthropic API calls require a Console API key (`sk-ant-api03-*` from console.anthropic.com) set via `ANTHROPIC_API_KEY`.

| Extension     | Needs Console API Key? | Reason                                             |
| ------------- | ---------------------- | -------------------------------------------------- |
| luca-harness  | No                     | Local shell commands only (bun test, tsc)          |
| luca-tilldone | No                     | Local shell commands only (iterative verification) |
| luca-state    | No                     | Local file I/O (.planning/ directory)              |
| luca-memory   | No                     | Local file I/O (MEMORY.md, WORKING.md)             |
| query-experts | **Yes**                | Spawns sub-agents via Anthropic API                |
| chain         | **Yes**                | Delegates tasks via Anthropic API                  |
| teams         | **Yes**                | Multi-agent orchestration via Anthropic API        |

If the `ANTHROPIC_API_KEY` environment variable is not set (or contains an OAuth token), API-calling extensions will fail with: `400 bad request: Personal Access Tokens are not supported for this endpoint`.

## Affected Extensions

| Extension     | File                                       | Function       | Line | Risk                |
| ------------- | ------------------------------------------ | -------------- | ---- | ------------------- |
| luca-harness  | `src/hooks/pi-extensions/luca-harness.ts`  | `runCheck()`   | L88  | CRITICAL (accepted) |
| luca-tilldone | `src/hooks/pi-extensions/luca-tilldone.ts` | `runCommand()` | L50  | CRITICAL (accepted) |

## Three Defense Layers

### Layer 1: Pi Permission Layer (Primary)

Pi's runtime requires explicit user approval before any tool execution. When the LLM calls `luca_verify` or `luca_tilldone`, the user sees the exact command and must approve it. This is the primary mitigation for command injection risk.

- **Scope**: All tool invocations, including shell commands
- **Enforcement**: Pi runtime (external to Luca)
- **User control**: Approve, deny, or modify each command before execution
- **Bypass risk**: None — Pi enforces this at the runtime level

### Layer 2: Input Validation Layer (Secondary)

Each extension applies its own input constraints:

#### luca-harness.ts

- **Command source**: Commands originate from `.planning/config.json`, which is developer-controlled and checked into version control
- **`checks` parameter**: The tool's `checks` parameter filters by check **name** only (e.g., `"test"`, `"typecheck"`), not by arbitrary command strings. The LLM cannot inject commands through this parameter — it can only select from pre-configured checks
- **Default commands**: When no config exists, defaults to `bun test` and `bunx --bun tsc --noEmit`

#### luca-tilldone.ts

- **Command source**: The `command` parameter is LLM-provided and arbitrary **by design**. This tool exists to run whatever command the LLM specifies as part of a verification-driven loop
- **Output truncation**: Command output is truncated to `MAX_OUTPUT_LENGTH` (1500 characters) to prevent exfiltration of large payloads
- **Iteration cap**: `max_iterations` defaults to 5, preventing infinite loops
- **Timeout**: Per-attempt timeout (default 120s) prevents runaway processes

### Layer 3: Blast Radius Limitation (Tertiary)

Both extensions limit the impact of any command execution:

- **Working directory**: Commands execute in `process.cwd()` (the project root), not system-wide
- **Output capture**: `stdio: ["pipe", "pipe", "pipe"]` captures all output rather than streaming to terminal
- **Output truncation**: Results are truncated (2000 chars for harness, 1500 chars for tilldone)
- **Timeout enforcement**: All commands have configurable timeouts that kill runaway processes
- **No privilege escalation**: Commands run with the same permissions as the parent Pi process (user-level)

## Risk Assessment Matrix

| Vector                             | luca-harness                                   | luca-tilldone                             |
| ---------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Command source                     | `.planning/config.json` (developer-controlled) | LLM parameter (arbitrary by design)       |
| Can LLM inject arbitrary commands? | No (selects by check name only)                | Yes (by design — tool's purpose)          |
| Primary mitigation                 | Pi permission layer + config file trust        | Pi permission layer                       |
| Output exfiltration risk           | Low (2000 char truncation)                     | Low (1500 char truncation)                |
| Runaway process risk               | Low (configurable timeout)                     | Low (configurable timeout, iteration cap) |
| Risk classification                | CRITICAL (accepted)                            | CRITICAL (accepted)                       |

## What Is Sanitized vs What Relies on Pi's Permission Model

| Concern                     | Sanitized by Extension                     | Relies on Pi Permission Model                 |
| --------------------------- | ------------------------------------------ | --------------------------------------------- |
| Which command runs          | harness: yes (config-driven); tilldone: no | tilldone: yes (user approves each invocation) |
| Command arguments           | No                                         | Yes                                           |
| Execution environment (cwd) | Yes (locked to project root)               | No                                            |
| Output size                 | Yes (truncated)                            | No                                            |
| Execution duration          | Yes (timeout)                              | No                                            |
| Number of retries           | tilldone: yes (iteration cap)              | No                                            |
| File system access          | No                                         | Yes                                           |
| Network access              | No                                         | Yes                                           |

## Complementary Hardening (Planned)

- **PLAN-66-B**: Input validation hardening — add command allowlist patterns and argument sanitization where feasible without breaking design intent
- **PLAN-66-C**: Runtime sandboxing exploration — evaluate feasibility of restricting `execSync` capabilities (e.g., `--no-network`, restricted `PATH`)

## Decision Record

**Date**: 2026-02-27
**Decision**: Accept CRITICAL risk classification for `execSync` usage in both extensions
**Rationale**: These tools exist to execute shell commands — that is their core purpose. Removing `execSync` would eliminate the tools' functionality entirely. Pi's permission layer provides sufficient mitigation because every command execution requires explicit user approval.
**Review cadence**: Re-evaluate when Pi's permission model changes or when extensions are deployed outside Pi's runtime.
