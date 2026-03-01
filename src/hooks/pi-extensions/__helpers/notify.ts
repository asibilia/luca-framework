/**
 * Safe UI notification wrappers for Pi extensions.
 *
 * Provides non-throwing wrappers for ctx.ui.notify and ctx.ui.confirm
 * so callers don't need repetitive try/catch guards.
 *
 * Source: src/hooks/pi-extensions/__helpers/notify.ts
 */
import type { PiExtensionContext } from "../__types/pi-context";

/**
 * Safe ctx.ui.notify wrapper — never throws.
 *
 * @param ctx - Pi context object (may be null/undefined)
 * @param message - Notification message
 * @param level - Notification level (e.g., "info", "warn", "error")
 */
export function notifySafe(
  ctx: PiExtensionContext | null | undefined,
  message: string,
  level?: string,
): void {
  try {
    ctx?.ui?.notify?.(message, level as "info" | "warn" | "error");
  } catch {
    /* non-fatal */
  }
}

/**
 * Safe ctx.ui.confirm wrapper — returns false if UI unavailable.
 *
 * @param ctx - Pi context object (may be null/undefined)
 * @param title - Confirmation dialog title
 * @param body - Confirmation dialog body text
 * @returns true if user confirms, false if UI unavailable or user declines
 */
export function confirmSafe(
  ctx: PiExtensionContext | null | undefined,
  title: string,
  body: string,
): Promise<boolean> {
  if (!ctx?.ui?.confirm) return Promise.resolve(false);
  return ctx.ui.confirm(title, body).catch(() => false);
}
