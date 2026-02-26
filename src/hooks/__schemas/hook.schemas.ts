/**
 * Hook registry Zod schemas and TypeScript types for the Luca Framework.
 *
 * Defines the structure for hook definitions including event types,
 * matchers, script references, and platform-specific configuration.
 */

import { z } from "zod";

export const HookDefinitionSchema = z.object({
  /** Claude Code hook event name (PascalCase) */
  event: z.string(),
  /** Cursor hook event name (camelCase) */
  cursorEvent: z.string(),
  /** Regex matcher for Claude Code tool name filtering (undefined = always fire) */
  matcher: z.string().optional(),
  /** Regex matcher for Cursor filtering (undefined = always fire) */
  cursorMatcher: z.string().optional(),
  /** Shell script filename in src/hooks/scripts/ */
  script: z.string(),
  /** Timeout in seconds */
  timeout: z.number().positive(),
  /** Run asynchronously in background (Claude Code only, ignored by Cursor) */
  async: z.boolean(),
  /** Status message shown while hook runs (Claude Code only) */
  statusMessage: z.string().optional(),
});
export type HookDefinition = z.infer<typeof HookDefinitionSchema>;

/** Sentinel value for hooks with no matcher constraint. */
export const NO_MATCHER_SENTINEL = "__no_matcher__" as const;
