/**
 * Pre-register built-in adapters (Claude, API) in the adapter registry.
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

registerAdapter(createClaudeAdapter());
registerAdapter(createApiAdapter());
