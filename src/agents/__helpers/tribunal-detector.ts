/**
 * Tribunal detector — re-exported from shared (T0).
 *
 * The canonical implementation lives in ~/shared/__helpers/tribunal-detector.ts.
 * This file preserves the agents barrel's public API so existing consumers
 * (including tests under __tests__/src/agents/) continue to work unchanged.
 */

export {
  normalizeFindings,
  detectDisagreements,
  shouldRunTribunal,
} from "~/shared/__helpers/tribunal-detector";
