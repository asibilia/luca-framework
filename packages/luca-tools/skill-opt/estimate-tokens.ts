/**
 * Rough GPT-style token estimate (~4 chars/token).
 *
 * We only ever use this to form a *ratio* (candidate ÷ baseline) produced by
 * the same estimator, so the char/4 bias cancels. Good enough for a reward
 * signal without pulling in a tokenizer dependency.
 */
export function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.trim().length / 4))
}
