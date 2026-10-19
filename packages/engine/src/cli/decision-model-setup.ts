/**
 * The decision model a real run asks (#534): what its setup holds
 * (`DecisionModelSetup`), and opening it for a run (`openDecisionModel`), off
 * with a journaled reason when there are no credentials.
 */
import { decisionModelOf } from '../config/engine-config'
import { createClefClient, type DecisionModelFetch } from '../jev/clef-client'
import {
    noCredentialsText,
    type DecisionModelCredentials,
} from '../jev/decision-model-credentials'
import { DEFAULT_DECISION_MODEL } from '../jev/jev-schemas'
import type { JevShadow } from '../jev/jev-shadow'
import type { Journal } from '../journal/journal'
import { replayRun } from '../journal/replay'

/**
 * What a real run needs to ask the decision model (#534): its Cloudflare
 * credentials (`loadDecisionModelCredentials`), and for tests a fake
 * `fetch` and a shorter timeout. The model comes from the run's config.
 */
export type DecisionModelSetup = {
    credentials: DecisionModelCredentials
    /** Defaults to the global `fetch`. */
    fetch?: DecisionModelFetch
    /** Defaults to `DEFAULT_JEV_TIMEOUT_MS`. */
    timeout_ms?: number
}

/**
 * The decision model for this run, from `setup` and the model in the run's
 * own config (its `run_started`, so a resume keeps it). With no credentials
 * it is off for the run: one `decision_model_off { reason: 'no_credentials' }`
 * record and one line naming Luca's env file and the keys to add, and no
 * shadow, so nothing is ever asked. Never logs the token.
 */
export const openDecisionModel = ({
    setup,
    journal,
    log,
}: {
    setup: DecisionModelSetup | undefined
    journal: Journal
    log: (line: string) => void
}): JevShadow | undefined => {
    if (setup === undefined) return undefined
    const { config } = replayRun({ records: journal.read() })
    const model =
        config === null ? DEFAULT_DECISION_MODEL : decisionModelOf({ config })
    const { credentials } = setup
    if (!credentials.ok) {
        const detail = noCredentialsText(credentials)
        journal.append({
            kind: 'decision_model_off',
            ticket: null,
            role: null,
            content: { model, reason: 'no_credentials', detail },
        })
        log(`[luca-run] decision model off: ${detail}`)
        return undefined
    }
    log(`[luca-run] decision model: Clef (${model}), in shadow mode`)
    return {
        client: createClefClient({ credentials, model, fetch: setup.fetch }),
        timeout_ms: setup.timeout_ms,
        log: (line) => {
            log(`[luca-run] ${line}`)
        },
    }
}
