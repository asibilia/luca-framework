/**
 * Mutable references wired up after `createMastraCode()` initializes.
 *
 * These break the chicken-and-egg problem: tools and agent factories are
 * registered _before_ the harness is created, but need access to harness
 * capabilities at runtime. The refs are populated in index.ts after init.
 *
 * Extracted to a separate module to avoid circular imports between
 * index.ts and tool modules.
 */

type ResolveModelFn = (modelId: string) => any;
type SwitchModeFn = (modeId: string) => Promise<void>;

/**
 * Reference to Mastra Code's `resolveModel` function.
 * Used by mode agent factories for OAuth-aware model resolution.
 */
export const resolveModelRef: { current: ResolveModelFn | null } = {
  current: null,
};

/**
 * Reference to `harness.switchMode()`.
 * Used by the workflowState tool for direct mode transitions.
 * We can't use harness state for this because the built-in Zod stateSchema
 * strips unknown keys (our custom fields get silently removed).
 */
export const switchModeRef: { current: SwitchModeFn | null } = {
  current: null,
};

/**
 * Reference to `harness.followUp()`.
 * Used by the pipeline guard to send corrective messages when a pipeline
 * agent completes its turn without calling switch-mode.
 */
type FollowUpFn = (opts: { content: string }) => Promise<void>;
export const followUpRef: { current: FollowUpFn | null } = {
  current: null,
};

/**
 * Reference to the McpManager instance.
 * Used by mode agent dynamic tools to merge MCP tools at request time,
 * and by subagent definitions for MCP-aware subagents.
 */
type McpManagerLike = { getTools(): Record<string, any> };
export const mcpManagerRef: { current: McpManagerLike | null } = {
  current: null,
};

/**
 * Reference to the TokenBudgetMonitor instance.
 * Used by context-refresher to check utilization thresholds
 * and by tools to make budget-aware decisions.
 */
type TokenBudgetMonitorLike = {
  recordInput(text: string): void;
  recordOutput(text: string): void;
  recordToolCall(): void;
  recordTurn(): void;
  getState(): { estimatedUtilization: number; turnsCompleted: number; toolCallsCompleted: number };
  isAboveThreshold(threshold: string): boolean;
  onThresholdCrossed(callback: (threshold: string, state: any) => void): void;
  reset(): void;
};
export const tokenBudgetRef: { current: TokenBudgetMonitorLike | null } = {
  current: null,
};

/**
 * Reference to the ContextRefresher instance.
 * Used by the workflowState tool to call setMode() on mode transitions.
 */
type ContextRefresherLike = {
  setMode(modeId: string): void;
};
export const contextRefresherRef: { current: ContextRefresherLike | null } = {
  current: null,
};
