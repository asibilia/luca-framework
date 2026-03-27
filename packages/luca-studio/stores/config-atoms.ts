import { atom } from "jotai";

import type { EntitySummary } from "~/lib/entity-route-helpers";

// ---------------------------------------------------------------------------
// Compile Status
// ---------------------------------------------------------------------------

/**
 * Represents the current compilation status as reported by SSE events.
 *
 * - `idle` — No compilation in progress.
 * - `compiling` — A `compile:start` SSE event was received.
 * - `success` — A `compile:complete` SSE event was received.
 * - `error` — A `compile:error` SSE event was received.
 */
export type CompileStatus =
  | { state: "idle" }
  | { state: "compiling"; domain: string; name: string }
  | { state: "success"; domain: string; name: string }
  | { state: "error"; domain: string; name: string; error: string };

/**
 * Atom tracking the latest compile status received via SSE.
 *
 * Updated by the `useSSE` hook in response to `compile:start`,
 * `compile:complete`, and `compile:error` server-sent events.
 * Entity editor components read this atom to show supplementary
 * compile feedback (spinner, success, error indicators).
 */
export const compileStatusAtom = atom<CompileStatus>({ state: "idle" });

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
 * Each entry is an `EntitySummary` with agent name, domain, and frontmatter.
 * `null` until the first successful fetch.
 */
export const agentRegistryAtom = atom<EntitySummary[] | null>(null);

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

/**
 * Stores the full-file ETag from the latest `GET /api/config` response.
 *
 * Used by `usePipelineSave` to send `If-Match` on PUT requests for
 * optimistic concurrency control. Updated on initial hydration, SSE
 * re-fetch, and successful save responses.
 *
 * `null` until the first successful config fetch.
 */
export const configEtagAtom = atom<string | null>(null);

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

/** Setter type for configDraftAtom -- accepts a value or a functional updater. */
type ConfigDraftUpdate =
  | Record<string, unknown>
  | null
  | ((prev: Record<string, unknown> | null) => Record<string, unknown> | null);

/**
 * Writable draft copy of `configAtom`.
 *
 * `get` returns the draft override when present, otherwise the server state.
 * `set` accepts either a direct value or a functional updater `(prev) => next`
 * to avoid stale-closure issues in callbacks.
 */
export const configDraftAtom = atom(
  (get) => get(_configDraftPrimitiveAtom) ?? get(configAtom),
  (get, set, update: ConfigDraftUpdate) => {
    if (typeof update === "function") {
      const current = get(_configDraftPrimitiveAtom) ?? get(configAtom);
      set(_configDraftPrimitiveAtom, update(current));
    } else {
      set(_configDraftPrimitiveAtom, update);
    }
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

// ---------------------------------------------------------------------------
// Layer 3 -- Conflict Resolution
//
// Stores a pending ETag conflict returned by a 409 response from the entity
// PUT endpoint. When non-null, entity pages render the DiffPreview dialog to
// let the user resolve the conflict.
// ---------------------------------------------------------------------------

/**
 * Represents the state of an ETag conflict on entity save.
 *
 * Populated by `useEntitySave` when a PUT returns 409, consumed by entity
 * pages to render the `DiffPreview` dialog. `null` when no conflict exists.
 */
export type ConflictState = {
  /** Entity key in `{type}:{name}` format (e.g. "agent:lu-router") */
  entityKey: string;
  /** The user's local draft content that failed to save */
  localContent: string;
  /** The current server content returned in the 409 response body */
  serverContent: string;
  /** The current server ETag returned in the 409 response body */
  serverEtag: string;
} | null;

/**
 * Atom tracking the current entity conflict state.
 *
 * Set by `useEntitySave` on 409 conflict, cleared by entity pages after
 * the user resolves the conflict via DiffPreview.
 */
export const conflictAtom = atom<ConflictState>(null);
