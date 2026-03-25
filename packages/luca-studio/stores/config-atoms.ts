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
// Implementation uses a two-atom pattern to avoid circular `set()` calls:
// 1. A private primitive atom holds the draft override (`null` = not yet set).
// 2. A derived atom reads from the private atom when set, otherwise falls
//    through to the server state atom. Writing targets the private atom only.
// ---------------------------------------------------------------------------

/** @internal Private primitive backing `configDraftAtom`. `null` = not overridden. */
const _configDraftPrimitiveAtom = atom<Record<string, unknown> | null>(null);

/**
 * Writable draft copy of `configAtom`.
 *
 * `get` returns the draft override when present, otherwise the server state.
 * `set` writes only to the private primitive -- never self-referencing.
 */
export const configDraftAtom = atom(
  (get) => get(_configDraftPrimitiveAtom) ?? get(configAtom),
  (_get, set, value: Record<string, unknown> | null) => {
    set(_configDraftPrimitiveAtom, value);
  },
);

/** @internal Private primitive backing `routingDraftAtom`. `null` = not overridden. */
const _routingDraftPrimitiveAtom = atom<Record<string, unknown> | null>(null);

/**
 * Writable draft copy of `routingTableAtom`.
 *
 * Same two-atom pattern as `configDraftAtom` -- derives from server state and
 * becomes independently writable without circular `set()` calls.
 */
export const routingDraftAtom = atom(
  (get) => get(_routingDraftPrimitiveAtom) ?? get(routingTableAtom),
  (_get, set, value: Record<string, unknown> | null) => {
    set(_routingDraftPrimitiveAtom, value);
  },
);
