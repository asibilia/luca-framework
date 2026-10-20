/**
 * The shape of the final review as replay rebuilds it, with its findings,
 * fix round and failures, and the final review before it starts.
 */
import type { AgentFailure, StuckReason } from './journal-record'
import type {
    DeclinedFinding,
    EnvironmentRerun,
    ReplayedGates,
    ReviewFix,
    TicketProgress,
} from './ticket-progress'

import type {
    AgentRole,
    Finding,
    LensName,
    LensReviewResult,
    MergeDanger,
} from '../agents/role-results'
import type { LeftoverHit } from '../gates/gate-schemas'

/** A final review finding: its id namespaced as `<lens>-<id>`, and its lens. */
export type FinalFinding = Finding & { lens: LensName }

/** A finding declined in the final review, with the lens that let it go. */
export type FinalDeclined = DeclinedFinding & { lens: LensName }

/** A rule file for the rules lens, as the engine read it (`null`: unreadable). */
export type RuleFile = { path: string; text: string | null }

/** A failed agent turn no agent of that role finished after. */
export type ReplayedAgentFailure = {
    role: AgentRole
    error: string
    failure: AgentFailure
    session_id: string | null
}

/**
 * The open final review fix round: the blocking findings of every lens due
 * in the round, and which fixers answered. Like a ticket's `ReviewFix`.
 */
export type FinalReviewFix = Omit<ReviewFix, 'findings'> & {
    findings: FinalFinding[]
}

/**
 * Where the final review stands, from its records: its round, the lenses
 * due, each lens's result this round, the open fix round and its fixers,
 * gates, commit, and push, and what goes in the PR. Ticket-less agent,
 * gate, scan, commit, and push records belong here once
 * `final_review_started` is journaled.
 */
export type FinalReviewState = {
    /** 0 before the final review starts, then 1, 2, ... */
    round: number
    from_sha: string | null
    head_sha: string | null
    /** The files `git diff <from_sha>..<head_sha>` changes. */
    files: string[]
    /** The lenses due this round. */
    lenses_due: LensName[]
    rules: RuleFile[]
    /** Each due lens's result this round, finding ids namespaced. */
    results: Partial<Record<LensName, LensReviewResult>>
    /** The open fix round; `null` before the first review settles or once clean. */
    fix: FinalReviewFix | null
    /** `final_review_fixing` is journaled for the open fix round. */
    fixing_started: boolean
    /** The session of each role's latest turn, for follow-ups. */
    sessions: Partial<Record<AgentRole, string>>
    /** Each role's failed turn, if no agent of that role finished after it. */
    agent_failures: Partial<Record<AgentRole, ReplayedAgentFailure>>
    /** Failed tries (agent, result, guard) per role, over the whole final review. */
    failed_tries: Partial<Record<AgentRole, number>>
    /** Engine failures in a row, per role. */
    engine_failures: Partial<Record<AgentRole, number>>
    /** The open fix round's gates, and its gate fix follow-ups. */
    gates: ReplayedGates | null
    gate_fix_rounds: number
    /**
     * The fixer's `environment` answers to failed gates (#613), over the
     * whole final review, each a rerun that used no gate fix round.
     */
    environment_reruns: number
    /** The latest `environment` answer, until the next agent answers. */
    environment: EnvironmentRerun | null
    /** The open fix round's leftover scan and commit. */
    leftovers: LeftoverHit[] | null
    commit: { sha: string; files: string[] } | null
    /** The open fix round's push. */
    pushed: string | null
    /** This round's slow tests are due (#563): round 1, with a slow command. */
    slow_due: boolean
    /** This round's slow test run (`gates_run` `final_slow`), once journaled. */
    slow_tests: ReplayedGates | null
    /** Every nit the lenses reported, one per id. */
    nits: FinalFinding[]
    declined: FinalDeclined[]
    /** Every assumption a final review agent made, oldest first. */
    assumptions: string[]
    /**
     * How many turns each final review role ran out of turns (#543), in the
     * order each first did, for the PR.
     */
    out_of_turns: Partial<Record<AgentRole, number>>
    passed: boolean
    stuck: { reason: StuckReason; detail: string } | null
    shipped: boolean
    /**
     * The commit of the edits left uncommitted at ship time (#509), not
     * reviewed; `null` with none.
     */
    shipped_edits: { sha: string; message: string; files: string[] } | null
    /**
     * A change only the owner may make, asked for by a fixer (#617); the
     * final review is stuck on it until a `retry`.
     */
    setup_change: TicketProgress['setup_change']
    /** The fixer whose turn a crash cut off; cleared once a fixer starts. */
    crashed_turn: AgentRole | null
    /**
     * The PR's Summary picture, from the integration lens (#513). It is kept
     * across rounds; a later non-null answer replaces it.
     */
    summary_picture: string | null
    /**
     * The PR's Merge Danger, from the integration lens (#513). It is kept
     * across rounds; a later non-null answer replaces it.
     */
    merge_danger: MergeDanger | null
}

/** The final review before it starts. */
export const EMPTY_FINAL_REVIEW: FinalReviewState = {
    round: 0,
    from_sha: null,
    head_sha: null,
    files: [],
    lenses_due: [],
    rules: [],
    results: {},
    fix: null,
    fixing_started: false,
    sessions: {},
    agent_failures: {},
    failed_tries: {},
    engine_failures: {},
    gates: null,
    gate_fix_rounds: 0,
    environment_reruns: 0,
    environment: null,
    leftovers: null,
    commit: null,
    pushed: null,
    slow_due: false,
    slow_tests: null,
    nits: [],
    declined: [],
    assumptions: [],
    out_of_turns: {},
    passed: false,
    stuck: null,
    shipped: false,
    shipped_edits: null,
    setup_change: null,
    crashed_turn: null,
    summary_picture: null,
    merge_danger: null,
}
