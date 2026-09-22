/**
 * `record-recall` — the shared telemetry directive injected into every mode
 * body that performs a MuninnDB recall.
 *
 * ## Why this is a shared constant and not five hand-copied blocks
 *
 * `.luca/telemetry/` was narrowed to the recall family alone. That makes these
 * directives the **only** local telemetry producers left, and therefore the
 * only remaining source of the `slug` / `wave` stamps that `trace-insights`
 * Stage A5 keys its ledger↔telemetry join on (see
 * `luca-core/src/telemetry/schemas.ts` "Scope — the MINIMAL sink", reason 2).
 *
 * When the same directive was copy-pasted into five mode bodies, the
 * attribution flags silently went missing from all five at once: the records
 * still landed, the CLI still exited 0, and the join input was dead — every
 * interval degrading to "attribution unavailable" with nothing failing. One
 * source of truth makes that drift structurally impossible: a flag can only be
 * dropped here, and the compiled-body guard
 * (`artifacts/modes/record-recall.test.ts`) pins it here.
 *
 * ## The join contract
 *
 * Stage A5 builds `(runId, pipelineStep, phase slug, wave)` per interval.
 * `runId` + `pipelineStep` come from `.luca/ledger.jsonl`; **`slug` and `wave`
 * can only come from a telemetry record.** `complexity` and `oversight` are
 * the `luca-telemetry-report` Run Inventory / bucketing columns. All four are
 * plain CLI flags on `luca telemetry emit` — they are never inferred from
 * state by the CLI (`luca-cli/src/commands/telemetry.ts` builds its
 * `TelemetryContext` purely from flags), so an unflagged emit writes
 * `slug: null, wave: null, complexity: null, oversight: null`.
 */

/**
 * The attribution flags every join-able recall emit carries, in fixed order.
 *
 * Rendered into the runnable command line, so the literal placeholder text is
 * part of the prompt contract — the guard test pins this exact fragment.
 */
export const RECALL_ATTRIBUTION_FLAGS =
    '--slug <currentPhaseSlug> --complexity <level> --oversight <oversight>'

/** The `--wave` flag, appended only where a wave index is actually in scope. */
export const RECALL_WAVE_FLAG = '--wave <waveIndex>'

/** The `--meta` payload shared by `recall.hit` / `recall.miss`. */
const RECALL_HIT_META =
    `--meta '{"query":"<recall query>","resultCount":<N>,` +
    `"verifiedCount":<M>,"vault":"<vault>",` +
    `"callerMode":"<semantic|recent|balanced|deep>","durationMs":<D>,` +
    `"recalledIds":["<recalled concept ULID>", "..."]}'`

/**
 * Where each attribution value comes from.
 *
 * `<level>` deliberately does NOT say "`luca state read` → `complexity`":
 * nothing on the CLI write surface ever SETS top-level `state.complexity`
 * (`luca state advance` takes no such flag), so that field is normally
 * `undefined`. The values that actually exist are the orchestrator's triage
 * classification and the per-phase roadmap entry — naming the empty field
 * would have sent every agent to a null read and back to a placeholder.
 */
const ATTRIBUTION_SOURCES =
    '`<currentPhaseSlug>` from `luca phase current` → `slug` (that command ' +
    'returns `{ active: false }` when no phase is active — then OMIT ' +
    '`--slug`); `<level>` is this run\'s triage complexity, which the `/lu` ' +
    'orchestrator passes into your prompt — if it is not there, read the ' +
    'active phase\'s roadmap entry (`luca roadmap read` → ' +
    '`roadmap[currentPhase - 1].complexity`) and omit the flag if that is ' +
    'unset too; `<oversight>` from `luca state read` → `oversight` (always ' +
    'present — it defaults to `full-auto`)'

const WAVE_SOURCE =
    '; `<waveIndex>` is the current wave index — the same value the ' +
    'confidence journal logs as `wave`'

/**
 * The non-negotiable trailer. States WHY the flags matter (a dropped flag is
 * silent, not loud) and forbids the two tempting failure modes: inventing a
 * value, or leaving the literal `<placeholder>` in the command.
 */
const ATTRIBUTION_MANDATE = (withWave: boolean): string =>
    '**The attribution flags are NOT optional.** `recall.*` is the only ' +
    'telemetry the pipeline still writes locally, so these records are the ' +
    'ONLY producer of the `slug`/`wave` stamps the `trace-insights` Stage A5 ' +
    'ledger↔telemetry join keys on. An unstamped record still writes and ' +
    'still exits 0 — it just joins to nothing, silently degrading per-phase ' +
    'cost attribution to "unavailable". Resolve the values once per step and ' +
    `reuse them: ${ATTRIBUTION_SOURCES}${withWave ? WAVE_SOURCE : ''}. If a ` +
    'value is genuinely unresolvable, OMIT that flag — never pass a guess, a ' +
    'placeholder, or the literal `<...>` text.'

/** Shared tail describing the meta payload + the required run id. */
const META_NOTE =
    '`recalledIds` is the array of recalled concept ULIDs in scope (REQ-12 ' +
    'recall-time capture). `<runId>` is the run id from pipeline Step 0 ' +
    '(REQUIRED flag).'

const LEAD_IN =
    'After the recall returns, emit `record-recall` telemetry so the ' +
    'aggregator can compute hit/miss + verified-tier rates per mode. Run ' +
    '(use `--kind recall.hit` when results were returned, `--kind ' +
    'recall.miss` when `resultCount` is 0):'

export interface RecordRecallOptions {
    /**
     * Emit site has a resolved wave index (execute only). Adds `--wave`, the
     * second half of the Stage A5 tuple.
     */
    wave?: boolean
}

/**
 * The attributed `record-recall` directive — use at every emit site where a
 * phase is active and triage has classified the run.
 *
 * @param options - `{ wave: true }` where a wave index is in scope.
 * @returns Markdown block: lead-in, fenced runnable command, meta note, mandate.
 *
 * @example
 * ```ts
 * const BODY = `## Step 5\n\n${recordRecallDirective()}\n`
 * ```
 */
export function recordRecallDirective(
    options: RecordRecallOptions = {}
): string {
    const waveFlag = options.wave ? ` ${RECALL_WAVE_FLAG}` : ''
    return [
        LEAD_IN,
        '',
        '```',
        `luca telemetry emit --kind recall.hit --run-id <runId> ` +
            `${RECALL_ATTRIBUTION_FLAGS}${waveFlag} ${RECALL_HIT_META}`,
        '```',
        '',
        META_NOTE,
        '',
        ATTRIBUTION_MANDATE(options.wave === true),
    ].join('\n')
}

/**
 * The UNATTRIBUTED variant — triage Step 1.5 only.
 *
 * Triage recalls before Step 2 classifies complexity, and on a clean run
 * `currentPhase` is 0 so no phase slug exists yet. Rather than emit a
 * placeholder (which would poison the join with a fabricated slug), this
 * variant omits the flags and says so explicitly, so a future reader does not
 * "fix" it back into a guess.
 *
 * @returns Markdown block with the unflagged command + the stated reason.
 */
export function recordRecallDirectiveUnattributed(): string {
    return [
        LEAD_IN,
        '',
        '```',
        `luca telemetry emit --kind recall.hit --run-id <runId> ` +
            RECALL_HIT_META,
        '```',
        '',
        META_NOTE,
        '',
        '**No attribution flags here — deliberately.** Every other ' +
            '`record-recall` emit stamps ' +
            '`--slug`/`--complexity`/`--oversight` for the `trace-insights` ' +
            'Stage A5 join. This one runs BEFORE Step 2 classifies ' +
            'complexity and before a phase is active (`currentPhase` is 0 on ' +
            'a clean triage), so neither key exists yet. A placeholder would ' +
            'poison the join — omit the flags and let this record carry ' +
            '`slug: null`.',
    ].join('\n')
}

/**
 * The `recall.utilization` directive — review Step 8 (learn-step outcome
 * correlation).
 *
 * Carries the same attribution flags as the hit/miss family (it is a join
 * input on equal footing) AND the outcome-valence mapping. The valence rule
 * previously lived only in the retired `signal.satisfaction` block of the `lu`
 * skill; without it inlined here, `meta.outcome` — the join key of the Recall
 * Utilization report section — degrades to free LLM judgment.
 *
 * @returns Markdown block: fenced runnable command + the valence mapping.
 */
export function recallUtilizationDirective(): string {
    return [
        '```',
        'luca telemetry emit --kind recall.utilization --run-id <runId> ' +
            `${RECALL_ATTRIBUTION_FLAGS} ` +
            `--meta '{"recalledIds":["<recalled concept ULID>", "..."],` +
            `"outcome":"<positive|negative|neutral>","step":"<verify|review>"}'`,
        '```',
        '',
        '`outcome` is the terminal valence of the step named in `step` — ' +
            'derive it, never guess it:',
        '',
        '- `checks` — typecheck/tests PASS → `positive`; FAIL (looping back ' +
            'to `execute`) → `negative`.',
        '- `verify` — verifier clean, `recommendation` neither `fix` nor ' +
            '`escalate` → `positive`; gaps found (`fix`) or `escalate` → ' +
            '`negative`.',
        '- `review` — all reviewers approve with no blocking findings → ' +
            '`positive`; any blocking finding → `negative`. An outcome that ' +
            'is neither (e.g. the step was skipped) is `neutral`.',
        '',
        ATTRIBUTION_MANDATE(false),
    ].join('\n')
}
