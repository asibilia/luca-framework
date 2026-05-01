/**
 * Token budget monitoring for context window management.
 *
 * Uses character-count heuristic (~1 token per 4 chars, conservative)
 * to estimate context utilization. Fires callbacks at configurable
 * thresholds to trigger mid-conversation interventions.
 */

export interface BudgetState {
    totalInputTokens: number
    totalOutputTokens: number
    turnsCompleted: number
    toolCallsCompleted: number
    /** Estimated context utilization 0.0-1.0 */
    estimatedUtilization: number
}

export const THRESHOLDS = {
    /** Inject compact reminders at 30% utilization */
    INJECT_REMINDERS: 0.3,
    /** Warn orchestrator at 65% utilization */
    WARNING: 0.65,
    /** Block non-essential operations at 90% utilization */
    BLOCK: 0.9,
} as const

export type ThresholdName = keyof typeof THRESHOLDS
export type ThresholdCallback = (
    threshold: ThresholdName,
    state: BudgetState
) => void

/** Conservative estimate: ~1 token per 4 characters */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

export class TokenBudgetMonitor {
    private state: BudgetState = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        turnsCompleted: 0,
        toolCallsCompleted: 0,
        estimatedUtilization: 0,
    }

    /** Track which thresholds have already fired to avoid duplicate callbacks */
    private firedThresholds = new Set<ThresholdName>()

    private callbacks: ThresholdCallback[] = []

    /**
     * @param contextWindowSize Estimated total context window in tokens (default: 200K for Claude)
     */
    constructor(private readonly contextWindowSize: number = 200_000) {}

    /** Register a callback for threshold crossings. */
    onThresholdCrossed(callback: ThresholdCallback): void {
        this.callbacks.push(callback)
    }

    /** Record input tokens (e.g., from a user message or system prompt). */
    recordInput(text: string): void {
        this.state.totalInputTokens += estimateTokens(text)
        this.updateUtilization()
    }

    /** Record output tokens (e.g., from an assistant response). */
    recordOutput(text: string): void {
        this.state.totalOutputTokens += estimateTokens(text)
        this.updateUtilization()
    }

    /** Record a completed tool call. */
    recordToolCall(): void {
        this.state.toolCallsCompleted += 1
    }

    /** Record a completed turn (agent_end event). */
    recordTurn(): void {
        this.state.turnsCompleted += 1
    }

    /** Get current budget state. */
    getState(): Readonly<BudgetState> {
        return { ...this.state }
    }

    /** Check if a threshold has been crossed. */
    isAboveThreshold(threshold: ThresholdName): boolean {
        return this.state.estimatedUtilization >= THRESHOLDS[threshold]
    }

    /**
     * Clear a specific fired threshold so it can fire again.
     * Use on mode changes so each mode can receive its own reminder.
     */
    clearThreshold(name: ThresholdName): void {
        this.firedThresholds.delete(name)
    }

    /** Reset the monitor (e.g., on mode change or new conversation). */
    reset(): void {
        this.state = {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            turnsCompleted: 0,
            toolCallsCompleted: 0,
            estimatedUtilization: 0,
        }
        this.firedThresholds.clear()
    }

    private updateUtilization(): void {
        const totalTokens =
            this.state.totalInputTokens + this.state.totalOutputTokens
        this.state.estimatedUtilization = Math.min(
            1,
            totalTokens / this.contextWindowSize
        )

        // Check thresholds in order
        for (const [name, value] of Object.entries(THRESHOLDS) as [
            ThresholdName,
            number,
        ][]) {
            if (
                this.state.estimatedUtilization >= value &&
                !this.firedThresholds.has(name)
            ) {
                this.firedThresholds.add(name)
                for (const cb of this.callbacks) {
                    try {
                        cb(name, this.getState())
                    } catch {
                        // Threshold callbacks must not break the monitor
                    }
                }
            }
        }
    }
}
