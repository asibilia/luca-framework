/**
 * Safe UI dialog wrappers for Pi extensions.
 *
 * Provides non-throwing wrappers for ctx.ui.select and ctx.ui.input
 * so callers don't need repetitive try/catch guards. Returns null
 * on error, UI unavailable, or user cancellation.
 *
 * Follows the same defensive pattern as notify.ts (notifySafe/confirmSafe).
 *
 * Source: src/hooks/pi-extensions/__helpers/dialogs.ts
 */
import type { PiExtensionContext } from "../__types/pi-context";

/**
 * Safe ctx.ui.select wrapper — returns null if UI unavailable or cancelled.
 *
 * Presents a selection dialog to the user via Pi's UI layer. Returns
 * the selected option value, or null if:
 * - ctx or ctx.ui.select is unavailable
 * - The user cancels the dialog
 * - An error occurs during rendering
 *
 * @param ctx - Pi context object (may be null/undefined)
 * @param title - Dialog title displayed to the user
 * @param options - Array of selectable option objects with label and value
 * @returns Selected value string, or null on error/cancel/unavailable
 *
 * @example
 * ```typescript
 * const model = await selectSafe(ctx, "Select model", [
 *   { label: "Haiku (fast)", value: "haiku" },
 *   { label: "Sonnet (balanced)", value: "sonnet" },
 *   { label: "Opus (capable)", value: "opus" },
 * ]);
 * if (model) pi.setModel(model);
 * ```
 */
export async function selectSafe(
  ctx: PiExtensionContext | null | undefined,
  title: string,
  options: Array<{ label: string; value: string }>,
): Promise<string | null> {
  try {
    if (!ctx?.ui?.select) return null;
    const result = await ctx.ui.select(title, options);
    return result ?? null;
  } catch {
    return null;
  }
}

/**
 * Safe ctx.ui.input wrapper — returns null if UI unavailable or cancelled.
 *
 * Presents a text input dialog to the user via Pi's UI layer. Returns
 * the entered string, or null if:
 * - ctx or ctx.ui.input is unavailable
 * - The user cancels the dialog
 * - An error occurs during rendering
 *
 * @param ctx - Pi context object (may be null/undefined)
 * @param prompt - Input prompt displayed to the user
 * @param defaultValue - Optional default value pre-filled in the input
 * @returns User-entered string, or null on error/cancel/unavailable
 *
 * @example
 * ```typescript
 * const value = await inputSafe(ctx, "Enter phase number", "79");
 * if (value) console.log(`Phase: ${value}`);
 * ```
 */
export async function inputSafe(
  ctx: PiExtensionContext | null | undefined,
  prompt: string,
  defaultValue?: string,
): Promise<string | null> {
  try {
    if (!ctx?.ui?.input) return null;
    const result = await ctx.ui.input(prompt, defaultValue);
    return result ?? null;
  } catch {
    return null;
  }
}
