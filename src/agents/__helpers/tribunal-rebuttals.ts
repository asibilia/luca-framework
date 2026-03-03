/**
 * Tribunal rebuttals — re-exported from shared (T0).
 *
 * The canonical implementation lives in ~/shared/__helpers/tribunal-rebuttals.ts.
 * This file preserves the agents barrel's public API so existing consumers
 * (including tests under __tests__/src/agents/) continue to work unchanged.
 */

export {
  buildRebuttalPrompts,
  resolveRebuttals,
  buildTribunalResult,
} from "~/shared/__helpers/tribunal-rebuttals";

export type { RebuttalPromptPair } from "~/shared/__helpers/tribunal-rebuttals";
