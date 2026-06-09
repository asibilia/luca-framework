/**
 * In-phase terseness directive — scoped caveman for the `/lu` pipeline's
 * USER-FACING orchestration surfaces (the `lu` command + the
 * `phase-execute` / `phase-plan` / `phase-discuss` skills).
 *
 * Why this exists: the caveman COMMUNICATION directive was only ever
 * placed on the seven mode-agents (architect, execute, fast, finalize,
 * research, review, triage). But the `/lu`-driven pipeline narrates to
 * the user through the COMMAND + SKILL surfaces, which run in the main
 * session and carried no terseness instruction at all. Result: the
 * interstitial "going through each phase" progress narration stayed
 * fully verbose even though caveman shipped.
 *
 * This directive is SCOPED (unlike the always-on mode-agent version):
 * it compresses the interstitial progress prose emitted BETWEEN waves,
 * loop iterations, and pipeline steps, while explicitly preserving
 * normal prose for step-end summaries, the `━━━` banner/status tables,
 * safety warnings, and any code/commit/PR text. Step-end summaries are
 * the one place verbosity is wanted, per the product decision.
 *
 * Authoring contract: interpolate `${INPHASE_TERSENESS_DIRECTIVE}` near
 * the top of each orchestration-surface body (after the role/intro
 * paragraph). The full ruleset lives in the `caveman` skill; this
 * directive carries enough of the essence to self-apply even if the
 * skill body is never loaded into context mid-pipeline.
 */
export const INPHASE_TERSENESS_DIRECTIVE = `> **COMMUNICATION (in-phase terseness)**: Apply caveman mode (full) to all interstitial progress narration — the prose you emit between waves, loop iterations, and pipeline steps as work proceeds. Activate the \`caveman\` skill and follow its rules: drop articles, filler, hedging, and pleasantries; fragments are fine; technical terms exact; code blocks unchanged. EXCEPTIONS — keep normal prose for step-end summaries, the \`━━━\` banner/status tables, security or destructive-action warnings, and any code/commit/PR text.`
