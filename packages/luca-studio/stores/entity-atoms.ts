import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { withHistory } from "jotai-history";

// ---------------------------------------------------------------------------
// Per-Entity Draft Atoms (Layer 2 -- Entity Drafts)
//
// Each entity type (agent, skill, rule) gets an `atomFamily` that creates an
// independent writable draft atom keyed by entity name. This enables
// concurrent multi-entity editing without atom key collisions -- each entity
// gets its own isolated atom tree.
//
// Entity shapes use `Record<string, unknown>` as the generic draft type until
// API routes define strict Zod schemas (expected in Phase 4-5). At that point
// the generic type parameter will be tightened to the inferred schema type.
// ---------------------------------------------------------------------------

/** Shape of an individual entity draft before schemas are locked down. */
type EntityDraft = Record<string, unknown>;

/**
 * Per-agent writable draft atom, keyed by agent name.
 *
 * Usage: `agentDraftAtom("lu-router")` returns an atom holding that agent's
 * draft config. Each name produces an independent atom instance.
 *
 * @example
 * ```ts
 * const draft = useAtom(agentDraftAtom("lu-router"));
 * ```
 */
export const agentDraftAtom = atomFamily((name: string) =>
  atom<EntityDraft>({}),
);

/**
 * Per-skill writable draft atom, keyed by skill name.
 *
 * @example
 * ```ts
 * const draft = useAtom(skillDraftAtom("git-commit"));
 * ```
 */
export const skillDraftAtom = atomFamily((name: string) =>
  atom<EntityDraft>({}),
);

/**
 * Per-rule writable draft atom, keyed by rule name.
 *
 * @example
 * ```ts
 * const draft = useAtom(ruleDraftAtom("no-classes"));
 * ```
 */
export const ruleDraftAtom = atomFamily((name: string) =>
  atom<EntityDraft>({}),
);

// ---------------------------------------------------------------------------
// Per-Entity History Atoms (Undo / Redo)
//
// Each history atom wraps the corresponding draft atom with `withHistory`
// from `jotai-history`, capping at 50 entries. The returned atom provides
// `canUndo` / `canRedo` indicators and accepts UNDO, REDO, RESET actions.
//
// Usage:
//   import { UNDO, REDO } from "jotai-history";
//   const [history, dispatch] = useAtom(agentHistoryAtom("lu-router"));
//   dispatch(UNDO); // undo last edit
//   history.canUndo // boolean
// ---------------------------------------------------------------------------

/** Max undo/redo entries per entity. */
const HISTORY_LIMIT = 50;

/**
 * Per-agent undo/redo history, keyed by agent name.
 *
 * Wraps `agentDraftAtom(name)` with a 50-entry history stack.
 */
export const agentHistoryAtom = atomFamily((name: string) =>
  withHistory(agentDraftAtom(name), HISTORY_LIMIT),
);

/**
 * Per-skill undo/redo history, keyed by skill name.
 *
 * Wraps `skillDraftAtom(name)` with a 50-entry history stack.
 */
export const skillHistoryAtom = atomFamily((name: string) =>
  withHistory(skillDraftAtom(name), HISTORY_LIMIT),
);

/**
 * Per-rule undo/redo history, keyed by rule name.
 *
 * Wraps `ruleDraftAtom(name)` with a 50-entry history stack.
 */
export const ruleHistoryAtom = atomFamily((name: string) =>
  withHistory(ruleDraftAtom(name), HISTORY_LIMIT),
);
