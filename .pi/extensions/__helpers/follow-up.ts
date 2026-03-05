/**
 * Shared follow-up message helper for Pi extensions.
 *
 * Extracts the repeated pi.sendMessage + try/catch pattern used
 * in luca-subagents.ts, luca-teams.ts, and luca-purpose-gating.ts.
 *
 * Source: src/hooks/pi-extensions/__helpers/follow-up.ts
 */
import type { PiExtensionAPI } from "../__types/pi-context";

/**
 * Send a follow-up message via Pi's sendMessage API.
 *
 * Wraps pi.sendMessage({ customType, content, details }, { deliverAs: "followUp" })
 * in a try/catch so callers don't need to handle session-ended errors.
 *
 * @param pi - Pi ExtensionAPI instance
 * @param opts - Message options
 * @param opts.customType - Custom message type identifier
 * @param opts.content - Human-readable message content
 * @param opts.display - Whether to display the message (default: true)
 * @param opts.details - Structured metadata for the message
 */
export function sendFollowUp(
  pi: PiExtensionAPI,
  opts: {
    customType: string;
    content: string;
    display?: boolean;
    details: Record<string, unknown>;
  },
): void {
  try {
    pi.sendMessage?.(
      {
        customType: opts.customType,
        content: opts.content,
        display: opts.display ?? true,
        details: opts.details,
      },
      { deliverAs: "followUp" },
    );
  } catch {
    /* sendMessage may fail if session ended — non-fatal */
  }
}
