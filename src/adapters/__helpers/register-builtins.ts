/**
 * Pre-register built-in adapters in the adapter registry.
 *
 * Import this module for its side effect:
 *
 * ```typescript
 * import "~/adapters/__helpers/register-builtins";
 * ```
 *
 * After import, the registry contains:
 * - "claude" -- Claude Code adapter (default)
 * - "api" -- API/headless adapter via Claude Agent SDK
 * - "cursor" -- Cursor IDE adapter
 * - "windsurf" -- Windsurf (Codeium) adapter
 * - "vscode" -- VS Code / GitHub Copilot adapter
 *
 * This file is NOT re-exported from the barrel (index.ts) because
 * barrel imports should not have side effects. Consumers must
 * explicitly import this module when they need built-in adapters.
 *
 * @module
 */
import { registerAdapter } from "./adapter-registry";
import { createClaudeAdapter } from "../claude/claude-adapter";
import { createApiAdapter } from "../api/api-adapter";
import { createCursorAdapter } from "../cursor/cursor-adapter";
import { createWindsurfAdapter } from "../windsurf/windsurf-adapter";
import { createVscodeAdapter } from "../vscode/vscode-adapter";

registerAdapter(createClaudeAdapter());
registerAdapter(createApiAdapter());
registerAdapter(createCursorAdapter());
registerAdapter(createWindsurfAdapter());
registerAdapter(createVscodeAdapter());
