/**
 * Shared formatting utilities for display strings.
 *
 * Consolidates timestamp and character-count formatters previously
 * duplicated across components.
 */

/**
 * Format an ISO timestamp to a locale date-time string.
 *
 * Used by planning/overview components that show full date + time.
 *
 * @param ts - ISO 8601 timestamp string
 * @returns Formatted locale date-time or "--" on empty / invalid input
 */
export function formatDateTime(ts: string): string {
  if (!ts) return "--";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

/**
 * Format an ISO timestamp to a compact locale time string (HH:MM:SS).
 *
 * Used by transition logs and timeline components that only need time.
 *
 * @param ts - ISO 8601 timestamp string
 * @returns Formatted time string or "--" on empty / invalid input
 */
export function formatTime(ts: string): string {
  if (!ts) return "--";
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

/**
 * Format a character count for compact display (e.g. "12.3k").
 *
 * Used by context-usage bars and similar metrics displays.
 *
 * @param chars - Number of characters
 * @returns Compact display string
 */
export function formatChars(chars: number): string {
  if (chars === 0) return "0";
  if (chars < 1000) return chars.toString();
  if (chars < 100_000) return `${(chars / 1000).toFixed(1)}k`;
  return `${(chars / 1000).toFixed(0)}k`;
}

/**
 * Format a character count with "chars" suffix for display (e.g. "12.3k chars").
 *
 * Used by working-sections and similar components showing content size.
 *
 * @param chars - Number of characters
 * @returns Display string with "chars" suffix
 */
export function formatSize(chars: number): string {
  if (chars === 0) return "0 chars";
  if (chars < 1000) return `${chars} chars`;
  return `${(chars / 1000).toFixed(1)}k chars`;
}
