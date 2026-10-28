/**
 * What a caller hands the journal to append (`JournalEntrySchema`): every
 * record kind's entry schema in one union. The journal adds `seq` and `time`
 * (see `journal-record-schema.ts`). A new kind is added here, there, and in
 * `journal-kinds.ts`.
 */
import { z } from 'zod'

import {
    AgentFailedEntrySchema,
    AgentFinishedEntrySchema,
    AgentSessionClosedEntrySchema,
    AgentSessionEntrySchema,
    AgentStartedEntrySchema,
    ChoresDoneEntrySchema,
    SharedGitChangedEntrySchema,
} from './agent-entries'
import {
    AgentMessageDeliveredEntrySchema,
    AgentMessageEntrySchema,
} from './agent-message-entries'
import {
    AlreadyDoneCheckedEntrySchema,
    TicketAlreadyDoneEntrySchema,
    TicketClosedEntrySchema,
} from './already-done-entries'
import {
    ChangesetDroppedEntrySchema,
    CommitMadeEntrySchema,
    LeftoverScanEntrySchema,
} from './commit-entries'
import {
    DecisionModelOffEntrySchema,
    JevAnsweredEntrySchema,
    JevAskedEntrySchema,
    JevFailedEntrySchema,
} from './decision-model-entries'
import {
    FinalReviewFixingEntrySchema,
    FinalReviewPassedEntrySchema,
    FinalReviewRetriedEntrySchema,
    FinalReviewShippedEntrySchema,
    FinalReviewStartedEntrySchema,
    FinalReviewStuckEntrySchema,
    LensFinishedEntrySchema,
    LensStartedEntrySchema,
} from './final-review-entries'
import {
    DependenciesInstalledEntrySchema,
    GatesRunEntrySchema,
    RedCheckEntrySchema,
} from './gate-entries'
import {
    IntakeReadEntrySchema,
    IntakeRefusedEntrySchema,
    NothingToDoEntrySchema,
    SpecSnapshotEntrySchema,
    TicketSnapshotEntrySchema,
} from './intake-entries'
import {
    JoinStartedEntrySchema,
    JoinUndoneEntrySchema,
    RunBranchPushedEntrySchema,
    TestsSentBackEntrySchema,
    TicketJoinedEntrySchema,
    TicketRebasedEntrySchema,
} from './join-entries'
import {
    LimitWaitEndedEntrySchema,
    LimitWaitStartedEntrySchema,
    UsageLineWaitEndedEntrySchema,
    UsageLineWaitStartedEntrySchema,
    UsageRecordedEntrySchema,
} from './limit-entries'
import {
    LearningSkippedEntrySchema,
    MemoriesReportedEntrySchema,
    MemoriesSavedEntrySchema,
    MemoryRecalledEntrySchema,
    MemoryWriteDoneEntrySchema,
    MemoryWriteStartedEntrySchema,
} from './memory-entries'
import {
    ChangesetWrittenEntrySchema,
    PullRequestOpenedEntrySchema,
} from './pull-request-entries'
import {
    RefactorTestUpdateCheckedEntrySchema,
    RefactorTestUpdateEntrySchema,
} from './refactor-update-entries'
import {
    RepoWaitEndedEntrySchema,
    RepoWaitPsFailedEntrySchema,
    RepoWaitSkippedEntrySchema,
    RepoWaitStartedEntrySchema,
} from './repo-wait-entries'
import {
    ConfigReloadedEntrySchema,
    ConfigReloadRefusedEntrySchema,
    EngineResumedEntrySchema,
    RunResumedEntrySchema,
    RunStartedEntrySchema,
    RunStoppedEntrySchema,
    StepEndedEntrySchema,
    StepStartedEntrySchema,
    TicketWaitingEntrySchema,
} from './run-entries'
import {
    CommentReadEntrySchema,
    ReplyIgnoredEntrySchema,
    ReplyReceivedEntrySchema,
    RunStuckEntrySchema,
    StuckReportedEntrySchema,
    TicketRetriedEntrySchema,
    TicketSkippedEntrySchema,
    TicketStuckEntrySchema,
} from './stuck-entries'
import {
    BaselinePreparedEntrySchema,
    BaselineReusedEntrySchema,
    BaselineTestsEntrySchema,
    PrepareMadeEntrySchema,
    RunBranchCreatedEntrySchema,
    TicketWorktreeCreatedEntrySchema,
    WorktreeResetEntrySchema,
    WorktreesRemovedEntrySchema,
} from './worktree-entries'

/**
 * What a caller hands the journal to append: a kind, its content, and who it
 * is about. The journal adds `seq` and `time`.
 *
 * Later tickets add kinds here.
 */
export const JournalEntrySchema = z.discriminatedUnion('kind', [
    RunStartedEntrySchema,
    IntakeReadEntrySchema,
    IntakeRefusedEntrySchema,
    NothingToDoEntrySchema,
    SpecSnapshotEntrySchema,
    TicketSnapshotEntrySchema,
    RunBranchCreatedEntrySchema,
    TicketWorktreeCreatedEntrySchema,
    BaselinePreparedEntrySchema,
    PrepareMadeEntrySchema,
    BaselineTestsEntrySchema,
    BaselineReusedEntrySchema,
    AgentStartedEntrySchema,
    AgentFinishedEntrySchema,
    AgentFailedEntrySchema,
    ChoresDoneEntrySchema,
    RedCheckEntrySchema,
    AlreadyDoneCheckedEntrySchema,
    LeftoverScanEntrySchema,
    ChangesetDroppedEntrySchema,
    CommitMadeEntrySchema,
    WorktreeResetEntrySchema,
    DependenciesInstalledEntrySchema,
    GatesRunEntrySchema,
    TicketJoinedEntrySchema,
    TicketRebasedEntrySchema,
    TestsSentBackEntrySchema,
    RefactorTestUpdateEntrySchema,
    RefactorTestUpdateCheckedEntrySchema,
    RunBranchPushedEntrySchema,
    TicketStuckEntrySchema,
    RunStuckEntrySchema,
    ChangesetWrittenEntrySchema,
    PullRequestOpenedEntrySchema,
    JevAskedEntrySchema,
    JevAnsweredEntrySchema,
    JevFailedEntrySchema,
    DecisionModelOffEntrySchema,
    AgentSessionEntrySchema,
    AgentSessionClosedEntrySchema,
    SharedGitChangedEntrySchema,
    RunStoppedEntrySchema,
    LimitWaitStartedEntrySchema,
    LimitWaitEndedEntrySchema,
    UsageLineWaitStartedEntrySchema,
    UsageLineWaitEndedEntrySchema,
    UsageRecordedEntrySchema,
    WorktreesRemovedEntrySchema,
    AgentMessageEntrySchema,
    AgentMessageDeliveredEntrySchema,
    FinalReviewStartedEntrySchema,
    LensStartedEntrySchema,
    LensFinishedEntrySchema,
    FinalReviewFixingEntrySchema,
    FinalReviewStuckEntrySchema,
    FinalReviewPassedEntrySchema,
    FinalReviewShippedEntrySchema,
    StuckReportedEntrySchema,
    CommentReadEntrySchema,
    ReplyReceivedEntrySchema,
    ReplyIgnoredEntrySchema,
    TicketRetriedEntrySchema,
    TicketSkippedEntrySchema,
    TicketAlreadyDoneEntrySchema,
    TicketClosedEntrySchema,
    JoinUndoneEntrySchema,
    FinalReviewRetriedEntrySchema,
    MemoryRecalledEntrySchema,
    MemoryWriteStartedEntrySchema,
    MemoryWriteDoneEntrySchema,
    MemoriesSavedEntrySchema,
    LearningSkippedEntrySchema,
    MemoriesReportedEntrySchema,
    StepStartedEntrySchema,
    StepEndedEntrySchema,
    TicketWaitingEntrySchema,
    RunResumedEntrySchema,
    JoinStartedEntrySchema,
    EngineResumedEntrySchema,
    ConfigReloadedEntrySchema,
    ConfigReloadRefusedEntrySchema,
    RepoWaitStartedEntrySchema,
    RepoWaitEndedEntrySchema,
    RepoWaitSkippedEntrySchema,
    RepoWaitPsFailedEntrySchema,
])

/** A journal entry as callers write it; schema defaults fill the rest. */
export type JournalEntry = z.input<typeof JournalEntrySchema>
