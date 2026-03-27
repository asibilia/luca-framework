/**
 * Singleton pub/sub module for compile lifecycle events in Luca Studio.
 *
 * Uses a `globalThis` guard to survive Next.js HMR dev-server restarts
 * (module scope re-executes but globalThis persists), following the same
 * singleton pattern as `lib/file-watcher.ts`.
 *
 * **IMPORTANT:** Subscriptions MUST be registered inside `ReadableStream
 * start()` callbacks only. Subscribing outside a stream lifecycle risks
 * leaked listeners that are never cleaned up when the SSE connection closes.
 *
 * @example
 * ```typescript
 * import { subscribeCompile, publishCompileEvent } from "~/lib/compile-events";
 *
 * // Inside a ReadableStream start() callback:
 * const unsub = subscribeCompile((event) => {
 *   console.log(event.type, event.domain, event.name);
 * });
 *
 * // On SSE disconnect:
 * unsub();
 *
 * // From the compile route:
 * publishCompileEvent({
 *   type: "compile:start",
 *   domain: "agents",
 *   name: "lu-router",
 *   timestamp: new Date().toISOString(),
 * });
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Discriminated union for compile lifecycle events.
 *
 * @property type      - The event discriminator.
 * @property domain    - Entity domain being compiled (agents, skills, rules).
 * @property name      - Entity name being compiled (e.g. "lu-router").
 * @property timestamp - ISO-8601 timestamp of when the event occurred.
 * @property error     - Error message (present only for `compile:error`).
 */
export type CompileEvent = {
  type: "compile:start" | "compile:complete" | "compile:error";
  domain: string;
  name: string;
  timestamp: string;
  error?: string;
};

/** Callback signature for compile-event subscribers. */
export type CompileEventListener = (event: CompileEvent) => void;

// ---------------------------------------------------------------------------
// Singleton state (survives HMR via globalThis)
// ---------------------------------------------------------------------------

interface CompileEventState {
  listeners: Set<CompileEventListener>;
}

const GLOBAL_KEY = "__luca_studio_compile_events__" as const;

/**
 * Retrieve (or create) the module-scoped singleton state attached to
 * `globalThis` so it survives Next.js HMR module re-evaluation.
 */
function getState(): CompileEventState {
  const g = globalThis as unknown as Record<
    string,
    CompileEventState | undefined
  >;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { listeners: new Set() };
  }
  return g[GLOBAL_KEY];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Publish a compile lifecycle event to all active subscribers.
 *
 * Called by the compile route to broadcast `compile:start`, `compile:complete`,
 * or `compile:error` events.
 *
 * @param event - The compile event to broadcast.
 */
export function publishCompileEvent(event: CompileEvent): void {
  const state = getState();
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch {
      // Swallow per-listener errors so one broken subscriber cannot
      // prevent others from receiving the event.
    }
  }
}

/**
 * Subscribe to compile lifecycle events.
 *
 * Returns an unsubscribe function that removes the listener when called.
 *
 * **IMPORTANT:** Call this ONLY inside a `ReadableStream start()` callback.
 * Subscribing outside a stream lifecycle risks leaked listeners that are
 * never cleaned up when the SSE connection closes.
 *
 * @param listener - Callback invoked for every compile event.
 * @returns A cleanup function that removes the listener.
 *
 * @example
 * ```typescript
 * const stream = new ReadableStream({
 *   start(controller) {
 *     const unsub = subscribeCompile((event) => {
 *       controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
 *     });
 *
 *     request.signal.addEventListener("abort", () => unsub(), { once: true });
 *   },
 * });
 * ```
 */
export function subscribeCompile(listener: CompileEventListener): () => void {
  const state = getState();
  state.listeners.add(listener);

  return () => {
    state.listeners.delete(listener);
  };
}
