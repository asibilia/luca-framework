import type { PluginTheme } from "@getpaseo/plugin";
import { usageLevel } from "../shared/board";

/**
 * Plan usage color, shared by B's usage line and C's rows so the two views match:
 * green below 60%, yellow from 60% to 85%, red above 85% (thresholds in shared/board.ts).
 */
export function usageColor(percent: number, theme: PluginTheme): string {
  switch (usageLevel(percent)) {
    case "ok":
      return theme.colors.statusSuccess;
    case "warn":
      return theme.colors.statusWarning;
    case "high":
      return theme.colors.statusDanger;
  }
}
