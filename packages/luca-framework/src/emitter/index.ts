/**
 * MuninnDB emission layer barrel index.
 *
 * Re-exports all public API surface for the emitter module.
 * This file contains ONLY re-export statements per project conventions.
 *
 * @module emitter
 */

// ─── Schemas and Types ──────────────────────────────────────────────────────

export {
  circuitBreakerConfigSchema,
  batchQueueConfigSchema,
  emitterConfigSchema,
  emissionMetadataSchema,
  emissionEventSchema,
  emissionEngramSchema,
} from "./__schemas/emitter.schemas";

export type {
  CircuitBreakerConfig,
  BatchQueueConfig,
  EmitterConfig,
  EmissionMetadata,
  EmissionEvent,
  EmissionEngram,
} from "./__schemas/emitter.schemas";

// ─── HTTP Client ────────────────────────────────────────────────────────────

export { createMuninnHttpClient } from "./__helpers/muninn-http";

export type { MuninnHttpClient } from "./__helpers/muninn-http";

// ─── Circuit Breaker ────────────────────────────────────────────────────────

export { createCircuitBreaker } from "./__helpers/circuit-breaker";

export type {
  CircuitState,
  CircuitBreakerState,
  CircuitBreakerInstance,
} from "./__helpers/circuit-breaker";

// ─── Batch Queue ────────────────────────────────────────────────────────────

export { createBatchQueue } from "./__helpers/batch-queue";

export type {
  BatchQueueConfig as BatchQueueFactoryConfig,
  BatchQueueInstance,
} from "./__helpers/batch-queue";

// ─── Emit Functions ─────────────────────────────────────────────────────────

export {
  createEmitter,
  getEmitter,
  emitSessionStart,
  emitSessionEnd,
  emitStateTransition,
  emitPhaseStart,
  emitPhaseComplete,
  emitDecision,
  emitError,
  emitAgentSpawn,
  emitAgentComplete,
  emitFinding,
} from "./__helpers/emit-functions";

export type { EmitterInstance } from "./__helpers/emit-functions";
