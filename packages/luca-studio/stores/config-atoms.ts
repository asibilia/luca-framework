import { atom } from "jotai";

// ---------------------------------------------------------------------------
// Layer 1 -- Server State (read-only mirrors)
//
// These atoms hold the latest server-side state, populated by fetch hooks or
// SSE event handlers. They start as `null` (not yet loaded) and are set once
// the corresponding API response arrives.
// ---------------------------------------------------------------------------

/**
 * Mirrors `config.json` from GET `/api/config`.
 *
 * Holds the full Luca planning config. `null` until the first successful fetch.
 * Consumers should treat this atom as read-only -- edits go through
 * `configDraftAtom`.
 */
export const configAtom = atom<Record<string, unknown> | null>(null);

/**
 * Mirrors the agent registry from GET `/api/entities/agents`.
 *
 * Each entry is a summary object with agent name and frontmatter.
 * `null` until the first successful fetch.
 */
export const agentRegistryAtom = atom<Record<string, unknown>[] | null>(null);

/**
 * Mirrors the MODEL_ROUTING_TABLE from GET `/api/routing-table`.
 *
 * Contains the mapping of agent names to model tiers per complexity level.
 * `null` until the first successful fetch.
 */
export const routingTableAtom = atom<Record<string, unknown> | null>(null);

/**
 * Mirrors `state.json` from GET `/api/state`.
 *
 * Contains the workflow state machine snapshot. `null` until the first
 * successful fetch.
 */
export const stateAtom = atom<Record<string, unknown> | null>(null);

// ---------------------------------------------------------------------------
// Layer 2 -- Config Draft State (writable copies)
//
// Draft atoms derive their initial value from the corresponding server state
// atom. Once set, they become independently writable -- edits modify only the
// draft, leaving the server state atom untouched until a save round-trip.
//
// When the server state atom updates (e.g., after save or SSE push), the draft
// atom resets to the new server value *unless* the draft is dirty.
// ---------------------------------------------------------------------------

/**
 * Writable draft copy of `configAtom`.
 *
 * Initialised from the live server state. The `set` callback makes the draft
 * independently writable so edits accumulate locally without touching the
 * server state atom.
 */
export const configDraftAtom = atom(
  (get) => get(configAtom),
  (_get, set, value: Record<string, unknown> | null) => {
    set(configDraftAtom, value);
  },
);

/**
 * Writable draft copy of `routingTableAtom`.
 *
 * Same semantics as `configDraftAtom` -- derives from server state and becomes
 * independently writable.
 */
export const routingDraftAtom = atom(
  (get) => get(routingTableAtom),
  (_get, set, value: Record<string, unknown> | null) => {
    set(routingDraftAtom, value);
  },
);
