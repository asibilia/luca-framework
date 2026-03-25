/**
 * High-level emit functions and singleton emitter for MuninnDB emissions.
 *
 * Provides convenience functions for emitting lifecycle events (session start/end,
 * phase transitions, decisions, errors, agent lifecycle, findings). All functions
 * are fire-and-forget: they never throw, never block, and callers should use
 * `void emitXxx(...)` pattern.
 *
 * The singleton emitter wires together HTTP client, circuit breaker, and batch queue.
 * Config is parsed with `safeParse()` and falls back to schema defaults on failure.
 *
 * @module emitter/emit-functions
 */
import {
  emitterConfigSchema,
  emissionEngramSchema,
  emissionEventSchema,
} from "../__schemas/emitter.schemas";
import type {
  EmitterConfig,
  EmissionEngram,
  EmissionMetadata,
} from "../__schemas/emitter.schemas";
import { createMuninnHttpClient } from "./muninn-http";
import { createCircuitBreaker } from "./circuit-breaker";
import type { CircuitBreakerState } from "./circuit-breaker";
import { createBatchQueue } from "./batch-queue";

// ─── Emitter Instance Type ──────────────────────────────────────────────────

/**
 * Emitter instance returned by `createEmitter()`.
 *
 * Provides `emit()` to enqueue engrams, `flush()` to force-flush,
 * and `getCircuitState()` for observability.
 */
export interface EmitterInstance {
  /** Enqueue an engram for batched emission. Fire-and-forget, never throws. */
  emit: (engram: EmissionEngram) => void;
  /** Force-flush all queued engrams. Used on session end. */
  flush: () => Promise<void>;
  /** Get the current circuit breaker state for observability. */
  getCircuitState: () => CircuitBreakerState;
}

// ─── Emitter Factory ────────────────────────────────────────────────────────

/**
 * Create an emitter instance that wires together HTTP client, circuit breaker,
 * and batch queue.
 *
 * Config is parsed with `safeParse()`. On failure, logs a warning and falls back
 * to schema defaults. The emitter MUST never crash on invalid config.
 *
 * @param rawConfig - Raw configuration object (parsed with emitterConfigSchema)
 * @returns Wired emitter instance
 *
 * @example
 * ```typescript
 * const emitter = createEmitter({
 *   base_url: "http://127.0.0.1:8476",
 *   api_key: "",
 *   vault: "default",
 * });
 * emitter.emit(engram);
 * await emitter.flush();
 * ```
 */
export function createEmitter(rawConfig?: unknown): EmitterInstance {
  // Parse config with safeParse, fallback to defaults on failure
  const parseResult = emitterConfigSchema.safeParse(rawConfig ?? {});
  let config: EmitterConfig;

  if (parseResult.success) {
    config = parseResult.data;
  } else {
    console.warn(
      "[emitter] Invalid config, falling back to defaults:",
      parseResult.error.message,
    );
    config = emitterConfigSchema.parse({});
  }

  // Wire components together
  const httpClient = createMuninnHttpClient({
    base_url: config.base_url,
    api_key: config.api_key,
    timeout_ms: config.timeout_ms,
  });

  const circuitBreaker = createCircuitBreaker(config.circuit_breaker);

  const batchQueue = createBatchQueue({
    flush_interval_ms: config.batch.flush_interval_ms,
    threshold: config.batch.threshold,
    send: (engram: EmissionEngram) =>
      circuitBreaker.execute(() => httpClient.writeEngram(engram)),
  });

  return {
    emit: (engram: EmissionEngram): void => {
      batchQueue.enqueue(engram);
    },
    flush: (): Promise<void> => batchQueue.flush(),
    getCircuitState: (): CircuitBreakerState => circuitBreaker.getState(),
  };
}

// ─── Singleton ──────────────────────────────────────────────────────────────

/** Module-level singleton emitter, lazily initialized on first call. */
let _emitter: EmitterInstance | null = null;

/**
 * Get the singleton emitter instance.
 *
 * Lazily initializes on first call using environment variables for config.
 * Bun auto-loads .env, so `MUNINN_DB_URL` and `MUNINN_DB_API_KEY` are
 * available via `process.env`.
 *
 * Follows the `getMuninnClient()` pattern from `packages/luca-studio/lib/muninn-config.ts`.
 *
 * @returns The singleton EmitterInstance
 *
 * @example
 * ```typescript
 * const emitter = getEmitter();
 * emitter.emit(engram);
 * ```
 */
export function getEmitter(): EmitterInstance {
  if (!_emitter) {
    _emitter = createEmitter({
      base_url: process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476",
      api_key: process.env.MUNINN_DB_API_KEY ?? "",
      vault: "default",
      circuit_breaker: {
        max_failures: 5,
        reset_timeout_ms: 30_000,
        half_open_max: 1,
      },
      batch: { flush_interval_ms: 2_000, threshold: 10 },
    });
  }
  return _emitter;
}

// ─── Tag Builder ────────────────────────────────────────────────────────────

/**
 * Build tag array following CONTEXT.md taxonomy.
 *
 * Always includes `session:<session_id>`.
 * Includes `phase:<N>`, `milestone:<version>` when available in metadata.
 * Includes the provided category tag.
 *
 * @param sessionId - Session identifier
 * @param category - Category tag (e.g., "lifecycle", "decision", "agent")
 * @param metadata - Optional metadata for additional tags
 * @returns Array of tag strings
 */
function buildTags(
  sessionId: string,
  category: string,
  metadata?: EmissionMetadata,
): string[] {
  const tags: string[] = [`session:${sessionId}`, category];

  if (metadata?.phase !== undefined) {
    tags.push(`phase:${metadata.phase}`);
  }
  if (metadata?.milestone) {
    tags.push(`milestone:${metadata.milestone}`);
  }

  return tags;
}

// ─── Engram Builder ─────────────────────────────────────────────────────────

/**
 * Build an EmissionEngram from event parameters.
 *
 * Creates the emission event payload, JSON-stringifies it as content,
 * and builds the engram with concept, tags, and confidence.
 *
 * @param concept - Hierarchical concept ID (e.g., "emit:session:start")
 * @param sessionId - Session identifier
 * @param data - Event-specific payload
 * @param category - Category tag for the emission
 * @param metadata - Optional metadata
 * @returns Validated EmissionEngram
 */
function buildEngram(
  concept: string,
  sessionId: string,
  data: Record<string, unknown>,
  category: string,
  metadata?: EmissionMetadata,
): EmissionEngram {
  const event = emissionEventSchema.parse({
    event_type: concept.replace("emit:", ""),
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    data,
    metadata: metadata ?? {},
  });

  return emissionEngramSchema.parse({
    vault: "default",
    concept,
    content: JSON.stringify(event),
    tags: buildTags(sessionId, category, metadata),
    confidence: 1.0,
  });
}

// ─── Convenience Emit Functions ─────────────────────────────────────────────

/**
 * Emit a session start event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Session start parameters
 */
export function emitSessionStart(params: {
  session_id: string;
  branch?: string;
  complexity?: string;
  milestone?: string;
}): void {
  try {
    const metadata: EmissionMetadata = {
      branch: params.branch,
      complexity: params.complexity,
      milestone: params.milestone,
    };
    const engram = buildEngram(
      "emit:session:start",
      params.session_id,
      {
        branch: params.branch,
        complexity: params.complexity,
        milestone: params.milestone,
      },
      "lifecycle",
      metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit a session end event and flush all pending engrams.
 *
 * Unlike other emit functions, this calls `flush()` to ensure all
 * queued engrams are sent before the session ends.
 * Fire-and-forget. Never throws.
 *
 * @param params - Session end parameters
 */
export function emitSessionEnd(params: {
  session_id: string;
  duration_ms?: number;
  engram_count?: number;
}): void {
  try {
    const engram = buildEngram(
      "emit:session:end",
      params.session_id,
      {
        duration_ms: params.duration_ms,
        engram_count: params.engram_count,
      },
      "lifecycle",
    );
    const emitter = getEmitter();
    emitter.emit(engram);
    // Flush all pending engrams on session end
    void emitter.flush();
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit a state transition event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - State transition parameters
 */
export function emitStateTransition(params: {
  previous_state: string;
  current_state: string;
  event_type: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:state:transition",
      params.session_id,
      {
        previous_state: params.previous_state,
        current_state: params.current_state,
        event_type: params.event_type,
      },
      "lifecycle",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit a phase start event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Phase start parameters
 */
export function emitPhaseStart(params: {
  phase_id: number;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:phase:start",
      params.session_id,
      { phase_id: params.phase_id },
      "lifecycle",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit a phase complete event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Phase complete parameters
 */
export function emitPhaseComplete(params: {
  phase_id: number;
  status: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:phase:complete",
      params.session_id,
      { phase_id: params.phase_id, status: params.status },
      "lifecycle",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit a decision event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Decision parameters
 */
export function emitDecision(params: {
  decision: string;
  rationale: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:decision:made",
      params.session_id,
      { decision: params.decision, rationale: params.rationale },
      "decision",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit an error event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Error parameters
 */
export function emitError(params: {
  error_type: string;
  message: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:error:captured",
      params.session_id,
      { error_type: params.error_type, message: params.message },
      "error",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit an agent spawn event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Agent spawn parameters
 */
export function emitAgentSpawn(params: {
  agent_name: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:agent:spawn",
      params.session_id,
      { agent_name: params.agent_name },
      "agent",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit an agent complete event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Agent complete parameters
 */
export function emitAgentComplete(params: {
  agent_name: string;
  status: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:agent:complete",
      params.session_id,
      { agent_name: params.agent_name, status: params.status },
      "agent",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}

/**
 * Emit a finding event.
 *
 * Fire-and-forget. Never throws.
 *
 * @param params - Finding parameters
 */
export function emitFinding(params: {
  finding_type: string;
  content: string;
  session_id: string;
  metadata?: EmissionMetadata;
}): void {
  try {
    const engram = buildEngram(
      "emit:finding:captured",
      params.session_id,
      { finding_type: params.finding_type, content: params.content },
      "finding",
      params.metadata,
    );
    getEmitter().emit(engram);
  } catch {
    // Fire-and-forget: never throw from emit functions
  }
}
