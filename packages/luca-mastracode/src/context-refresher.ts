/**
 * Mid-conversation context refresher.
 *
 * Injects `<luca-reminder>` tags at token budget thresholds to
 * combat context rot. Subscribes to TokenBudgetMonitor thresholds
 * and uses followUpRef to inject reminders into the conversation.
 */

import { MODES } from './constants/mode-ids.js'
import { appendLedger } from './session-ledger.js'
import type { ThresholdName, BudgetState } from './token-budget.js'

/** Mode-specific reminder templates, keyed by harness mode ID. */
const MODE_REMINDERS: Record<string, string> = {
    [MODES.triage]:
        '<luca-reminder>You are in triage mode. ≤75 words output. Classify → rationale → next mode.</luca-reminder>',
    [MODES.research]:
        '<luca-reminder>You are in research mode. Budget: MODERATE ≤10, COMPLEX ≤20, CRITICAL ≤30 tool calls. Synthesis ≤200 lines.</luca-reminder>',
    [MODES.architect]:
        '<luca-reminder>You are in architect mode. ≤3 sentences per task. ≤150 lines PLAN.md total. Validate with plan-reviewer before finishing.</luca-reminder>',
    [MODES.execute]:
        '<luca-reminder>You are in execute mode. Run checks within 1 tool call of wave completion. Stalled ≥2 iterations = stop and escalate. No prose between tool calls.</luca-reminder>',
    [MODES.review]:
        '<luca-reminder>You are in review mode (read-only). Maximum 5 MUST-FIX items. MUST-FIX = correctness bugs, security, missing requirements ONLY.</luca-reminder>',
    [MODES.finalize]:
        '<luca-reminder>You are in finalize mode. Check every task in PLAN.md. Report exact completed/total ratio.</luca-reminder>',
    build: '<luca-reminder>You are in build mode. Implement atomically. Run checks after each logical unit.</luca-reminder>',
    fast: '<luca-reminder>Fast mode. Under 100 words. ≤25 words between tool calls.</luca-reminder>',
    plan: '<luca-reminder>Plan mode (read-only). Do NOT make changes. Explore and design only.</luca-reminder>',
    [MODES.discuss]:
        '<luca-reminder>Discuss mode (read-only). Under 300 words per turn. ≤2 clarifying questions.</luca-reminder>',
}

const GENERIC_REMINDER =
    '<luca-reminder>Re-read your mode constraints. No prose between tool calls. Respect mode boundaries.</luca-reminder>'

type FollowUpFn = (opts: { content: string }) => Promise<void>

export class ContextRefresher {
    private currentModeId: string = ''
    private injectedThresholds = new Set<ThresholdName>()

    constructor(private readonly followUp: FollowUpFn) {}

    /** Update the current mode for mode-specific reminders. */
    setMode(modeId: string): void {
        this.currentModeId = modeId
        // Reset injected thresholds on mode change — new context
        this.injectedThresholds.clear()
    }

    /**
     * Handle a threshold crossing from TokenBudgetMonitor.
     * Called via `tokenBudget.onThresholdCrossed(...)`.
     */
    async handleThreshold(
        threshold: ThresholdName,
        _state: BudgetState
    ): Promise<void> {
        // Only inject reminders at INJECT_REMINDERS threshold
        if (threshold !== 'INJECT_REMINDERS') return
        // Don't re-inject for the same threshold in the same mode
        if (this.injectedThresholds.has(threshold)) return

        this.injectedThresholds.add(threshold)

        const reminder = MODE_REMINDERS[this.currentModeId] ?? GENERIC_REMINDER

        try {
            await this.followUp({ content: reminder })
        } catch (err) {
            // followUp failure should not crash the pipeline, but record it
            // so postmortem can attribute missing context refreshes.
            try {
                appendLedger('context-refresher-followup-failed', {
                    threshold,
                    mode: this.currentModeId,
                    error: err instanceof Error ? err.message : String(err),
                })
            } catch {
                // ledger write itself failed — nothing else to do
            }
        }
    }
}
