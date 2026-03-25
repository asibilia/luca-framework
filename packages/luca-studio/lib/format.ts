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

/**
 * Format a relative timestamp (e.g. "2h ago") from a Unix epoch or Date.
 *
 * Accepts epoch seconds, epoch milliseconds, or a Date object.
 * Returns a human-readable relative time string.
 *
 * @param input - Unix epoch (seconds or ms) or Date object
 * @returns Relative time string or "" if input is falsy
 */
export function relativeTime(input: number | Date | undefined | null): string {
  if (!input) return "";

  let ms: number;
  if (input instanceof Date) {
    ms = input.getTime();
  } else {
    // Normalize: if value looks like seconds (< 1e12), convert to ms
    ms = input < 1e12 ? input * 1000 : input;
  }

  const diffMs = Date.now() - ms;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Resolve a context zone name to a CSS custom property color token.
 *
 * Maps the four quality degradation zones (peak, good, degrading, stop)
 * to the project's CSS custom property color system.
 *
 * @param zone - Zone name string from CheckpointData
 * @returns CSS color token name (without "var(--color-)" wrapper)
 */
export function zoneColor(zone: string): string {
  switch (zone) {
    case "peak":
      return "success";
    case "good":
      return "info";
    case "degrading":
      return "warning";
    case "stop":
      return "destructive";
    default:
      return "muted-foreground";
  }
}

/**
 * Format a checkpoint age in seconds to a human-readable string.
 *
 * Returns "--" for null input (canonical null sentinel for this project).
 *
 * @param seconds - Age in seconds, or null if unknown
 * @returns Human-readable age string (e.g. "5m ago", "2h ago") or "--"
 */
export function formatAge(seconds: number | null): string {
  if (seconds === null) return "--";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Resolve a coherence score (0–1) to a CSS custom property color token.
 *
 * Higher coherence is better:
 * - 0.8+: success (healthy)
 * - 0.5–0.8: info (moderate)
 * - 0.3–0.5: warning (low)
 * - <0.3: destructive (poor)
 *
 * Identical thresholds are used for percentage-based metrics (hit rate,
 * precision) since all three are 0–1 fractions.
 *
 * @param score - Coherence/quality score between 0 and 1
 * @returns CSS color token name (without "var(--color-)" wrapper)
 */
export function coherenceColor(score: number): string {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "info";
  if (score >= 0.3) return "warning";
  return "destructive";
}

/**
 * Format a byte count to a human-readable string (e.g. "1.2 MB").
 *
 * Uses SI-style binary units: B, KB, MB, GB, TB.
 * Displays up to one decimal place; whole numbers omit the decimal.
 *
 * @param bytes - Number of bytes
 * @returns Human-readable size string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1,
  );
  const value = bytes / Math.pow(k, i);

  // Use toFixed(1) but strip trailing ".0" for clean display
  const formatted = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[i]}`;
}
