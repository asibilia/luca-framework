/**
 * Journal entry builders for the build steps, so decision-step tests can
 * write a journal that stops anywhere along a ticket's spine.
 *
 * The builders live in modules by job, and this module re-exports all of
 * them, so a test imports every one from here.
 */

export {
    agentFailed,
    agentSession,
    agentStarted,
    finding,
    implemented,
    nothingNewToTest,
    reviewed,
    SESSIONS,
    testsWritten,
} from './agent-turn-fixtures'
export {
    alreadyDone,
    alreadyDoneChecked,
    DONE_SHA,
    ticketAlreadyDone,
    ticketClosed,
} from './already-done-fixtures'
export { SPEC_OWNER } from './intake-fixtures'
export {
    billingStopped,
    epochSeconds,
    limitWaitEnded,
    limitWaitStarted,
    rateLimitReading,
} from './limit-fixtures'
export {
    commentRead,
    replyReceived,
    stuckReported,
    ticketRetried,
    ticketSkipped,
} from './reply-fixtures'
export {
    baselineTests,
    BUILD_CONFIG,
    dependenciesInstalled,
    emptyTestRun,
    intakePassed,
    practiceTicket,
    pullRequestOpened,
    RUN_BRANCH,
    RUN_BRANCH_PATH,
    runBranchCreated,
    ticketPath,
    ticketWorktreeCreated,
    withInstalls,
    worktreesRemoved,
} from './run-fixtures'
export { stepEnded, stepStarted } from './step-record-fixtures'
export {
    commitMade,
    gatesRun,
    joinClashed,
    joined,
    leftoverScan,
    pushed,
    redCheck,
    testsSentBack,
    ticketApproved,
    ticketBuilt,
    ticketRebased,
    ticketStuck,
    worktreeReset,
} from './ticket-step-fixtures'
