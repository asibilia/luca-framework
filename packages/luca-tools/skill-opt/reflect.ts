/**
 * Reflect: read the worst rollouts of a step and propose bounded skill edits.
 * Generic over the task — the caller supplies the task's analyst system prompt
 * and the already-rendered worst-rollout lines. The optimizer's "learning
 * rate" is the edit budget L (SkillOpt gradient-clip / edit-budget control).
 */
import type { ChatFn } from './backend.ts'
import type { Patch } from './types.ts'
import { PatchSchema } from './types.ts'
import { extractJson } from './json.ts'

export async function reflect(
    chat: ChatFn,
    analystSystem: string,
    skillBody: string,
    worstRendered: string[],
    editBudget: number
): Promise<Patch> {
    const user = [
        '## Current Skill Document',
        skillBody,
        '',
        `## Worst Rollouts This Step (${worstRendered.length})`,
        worstRendered.join('\n\n'),
        '',
        `You may propose AT MOST ${editBudget} edits. Focus on the single most common failure pattern.`,
    ].join('\n')

    const raw = await chat({
        system: analystSystem,
        user,
        stage: 'analyst',
        skill: skillBody,
    })
    const parsed = PatchSchema.safeParse(extractJson(raw))
    if (!parsed.success) return { reasoning: 'unparseable analyst patch', edits: [] }

    // Enforce the edit budget (the textual learning rate).
    return {
        reasoning: parsed.data.reasoning,
        edits: parsed.data.edits.slice(0, editBudget),
    }
}
