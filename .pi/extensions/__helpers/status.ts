/**
 * Shared status formatting utilities for Pi footer widgets.
 *
 * Provides theme-aware color helpers, a unicode separator, and
 * complexity tier mappings used by luca-state and luca-harness
 * extensions to render a unified, readable status line.
 *
 * Source: src/hooks/pi-extensions/__helpers/status.ts
 * Deployed to: .pi/extensions/__helpers/status.ts
 */

/** Unicode box-drawing separator for status segments. */
export const SEP = " \u2502 ";

/** Complexity level → behavioral tier mapping. */
export const COMPLEXITY_TIERS: Record<string, string> = {
  TRIVIAL: "lightweight",
  SIMPLE: "lightweight",
  MODERATE: "standard",
  COMPLEX: "thorough",
  CRITICAL: "thorough",
};

/**
 * Status color functions returned by createStatusFormatter.
 *
 * Each function wraps text with the appropriate theme color when
 * available, or returns plain text as a fallback.
 */
export interface StatusFormatter {
  accent: (text: string) => string;
  success: (text: string) => string;
  error: (text: string) => string;
  warning: (text: string) => string;
  muted: (text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
  hasTheme: boolean;
}

/**
 * Create a safe theme color wrapper from a Pi context.
 *
 * Probes `ctx.ui.theme` for standard color methods (accent, success,
 * error, warning, muted, dim, bold). Returns identity functions for
 * any missing methods, so callers never need null checks.
 *
 * @param ctx - Pi event context (may or may not have ui.theme)
 * @returns StatusFormatter with safe color functions and a hasTheme flag
 */
export function createStatusFormatter(ctx: any): StatusFormatter {
  const theme = ctx?.ui?.theme;
  const hasTheme = Boolean(theme);
  const identity = (text: string) => text;

  return {
    accent: typeof theme?.accent === "function" ? theme.accent : identity,
    success: typeof theme?.success === "function" ? theme.success : identity,
    error: typeof theme?.error === "function" ? theme.error : identity,
    warning: typeof theme?.warning === "function" ? theme.warning : identity,
    muted: typeof theme?.muted === "function" ? theme.muted : identity,
    dim: typeof theme?.dim === "function" ? theme.dim : identity,
    bold: typeof theme?.bold === "function" ? theme.bold : identity,
    hasTheme,
  };
}
