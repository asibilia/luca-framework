# Phase 165 Context: Hook Contract Validation

## Goal

Validate all 16 hook implementations end-to-end by running each hook's TypeScript implementation with mock stdin JSON and verifying stdout JSON + exit codes match the Claude Code hook contract.

## Approach

Create a validation script that:

1. Constructs mock stdin JSON payloads matching what Claude Code sends for each hook event type
2. Pipes the payload to each hook's TypeScript implementation via `bun src/hooks/impl/<hook>.ts`
3. Captures stdout, stderr, and exit code
4. Validates:
   - Exit code is 0 (success) or 2 (block) as appropriate
   - stdout is valid JSON with expected fields (systemMessage, statusMessage, etc.)
   - No crashes or unhandled exceptions
   - Async hooks complete within timeout

## Hook Contract Reference

Claude Code hooks receive stdin JSON and may output stdout JSON:

**Input (stdin):** `{ "session_id": "...", "workspace": { "current_dir": "..." }, ... }`

- PostToolUse hooks also receive: `tool_name`, `tool_input`, `file_path`
- PreToolUse hooks also receive: `tool_name`, `tool_input`
- Stop hooks receive: `stop_hook_reason`, `transcript_path`

**Output (stdout):** `{ "systemMessage": "...", "statusMessage": "..." }` (all fields optional)

**Exit codes:** 0 = success/allow, 2 = block (PreToolUse only)

## 16 Hooks to Validate

| Hook                    | Event Type  | Exit Code | Has stdout?                         |
| ----------------------- | ----------- | --------- | ----------------------------------- |
| post-edit-format        | PostToolUse | 0         | No (runs Prettier silently)         |
| post-edit-typecheck     | PostToolUse | 0         | Yes (systemMessage with errors)     |
| snapshot-sync           | PostToolUse | 0         | No                                  |
| statusline              | PostToolUse | 0         | Yes (statusMessage)                 |
| pre-commit-gate         | PreToolUse  | 0 or 2    | Yes (systemMessage on block)        |
| pre-commit-drift-check  | PreToolUse  | 0 or 2    | Yes (systemMessage on block)        |
| context-monitor         | Stop        | 0         | Yes (systemMessage)                 |
| session-persist         | PostToolUse | 0         | No                                  |
| session-compact-restore | PostToolUse | 0         | Yes (systemMessage)                 |
| session-start           | PostToolUse | 0         | Yes (systemMessage)                 |
| context-check-throttled | PostToolUse | 0         | Yes (systemMessage + statusMessage) |
| pre-compact-checkpoint  | PostToolUse | 0         | Yes (systemMessage)                 |
| user-prompt-submit      | PostToolUse | 0         | No                                  |
| subagent-stop           | PostToolUse | 0         | No                                  |
| post-tool-use-failure   | PostToolUse | 0         | No                                  |

## Wave Structure

Single wave — all validation is read-only testing, no code changes needed.

## Notes

- Hooks that call MuninnDB will get connection refused (MuninnDB may not be running) — this is expected and should be handled gracefully (fire-and-forget pattern)
- Hooks that call luca-bridge may fail if bridge isn't built — verify graceful degradation
- The validation script itself should NOT be committed as a test file (per no-tests rule) — it runs as a one-time validation and results go in SUMMARY.md
