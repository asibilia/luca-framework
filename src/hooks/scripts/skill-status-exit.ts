/**
 * skill-status-exit — PostToolUse hook for Skill invocations (INTENTIONAL NO-OP).
 *
 * This hook exists as a registered placeholder but does NOT clear the status
 * bus. Most Luca skills use `disable-model-invocation: true`, which causes
 * the Skill tool to "complete" immediately (triggering PostToolUse) while
 * the LLM continues processing the skill content. Clearing the bus here
 * would erase the skill name before the LLM even starts working.
 *
 * Cleanup is handled by:
 * - The 30-minute staleness timeout in readStatusBus() (stale data ignored)
 * - The next skill's entry hook overwriting with fresh data
 *
 * @module skill-status-exit
 */

import { exitSuccess } from "../__helpers/hook-io.ts";

await exitSuccess();
