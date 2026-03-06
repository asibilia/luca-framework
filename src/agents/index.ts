/**
 * Agent registry for the Luca Framework
 *
 * Pure barrel file — re-exports only. All logic lives in __helpers/.
 */

// Registry
export { agentRegistry } from "./__helpers/build-agent-registry";

// Factory function
export { createAgent } from "./__helpers/create-agent";

// Model resolution
export {
  resolveModel,
  resolveModelWithZone,
  resolveModelWithDecision,
} from "./__helpers/resolve-model";

export type { ModelRoutingDecision } from "./__helpers/resolve-model";

// Types
export type {
  BaseAgent,
  AgentConfig,
  AgentFrontmatter,
  AgentSection,
  ModelRoutingConfig,
} from "./__schemas/agent.schemas";

// Verification tribunal schemas
export {
  T1_STATUSES,
  t1StatusSchema,
  T3_STATUSES,
  t3StatusSchema,
  VERIFICATION_CONFLICT_TYPES,
  verificationConflictTypeSchema,
  conflictSignalSchema,
  CONFLICT_CATEGORIES,
  conflictCategorySchema,
  diagnosticPerspectiveSchema,
  verificationTribunalResultSchema,
} from "./__schemas/verification-tribunal.schemas";

export type {
  T1Status,
  T3Status,
  VerificationConflictType,
  ConflictSignal,
  ConflictCategory,
  DiagnosticPerspective,
  VerificationTribunalResult,
} from "./__schemas/verification-tribunal.schemas";

// Verification tribunal helpers
export {
  detectT1T3Conflict,
  shouldRunVerificationTribunal,
  buildTestWriterDiagnosticPrompt,
  buildVerifierDiagnosticPrompt,
  buildIntegrationDiagnosticPrompt,
  resolveVerificationTribunal,
} from "./__helpers/verification-tribunal";

// Root cause tribunal schemas
export {
  ROOT_CAUSE_CHALLENGE_CATEGORIES,
  rootCauseChallengeCategorySchema,
  proposedFixSignalSchema,
  rootCausePerspectiveSchema,
  rootCauseTribunalResultSchema,
} from "./__schemas/root-cause-tribunal.schemas";

export type {
  RootCauseChallengeCategory,
  ProposedFixSignal,
  RootCausePerspective,
  RootCauseTribunalResult,
} from "./__schemas/root-cause-tribunal.schemas";

// Health check
export {
  checkAgentHealth,
  checkAllAgentsHealth,
} from "./__helpers/health-check";

export type { HealthCheckResult } from "./__helpers/health-check";

// Root cause tribunal helpers
export {
  detectProposedFix,
  shouldRunRootCauseTribunal,
  buildDebuggerDefensePrompt,
  buildVerifierChallengePrompt,
  buildArbiterPrompt,
  resolveRootCauseTribunal,
} from "./__helpers/root-cause-tribunal";

// Interop scanner
export {
  InteropFindingSchema,
  InteropReportSchema,
  scanAgentInterop,
} from "./__helpers/interop-scanner";

export type {
  InteropFinding,
  InteropReport,
} from "./__helpers/interop-scanner";
