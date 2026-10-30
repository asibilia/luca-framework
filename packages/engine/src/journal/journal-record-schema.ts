/**
 * One line of a run's journal (`JournalRecordSchema`): every record kind's
 * entry schema in one union, each with the `seq` and `time` the journal adds.
 * A new kind is added here, in `journal-entry-schema.ts`, and in
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
    NetworkWaitEndedEntrySchema,
    NetworkWaitStartedEntrySchema,
} from './network-wait-entries'
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

const STAMP_FIELDS = {
    /** 1, 2, 3, ... in the order records were appended. */
    seq: z.number().int().min(1),
    time: z.iso.datetime(),
}

/** One line of a run's journal. */
export const JournalRecordSchema = z.discriminatedUnion('kind', [
    RunStartedEntrySchema.extend(STAMP_FIELDS),
    IntakeReadEntrySchema.extend(STAMP_FIELDS),
    IntakeRefusedEntrySchema.extend(STAMP_FIELDS),
    NothingToDoEntrySchema.extend(STAMP_FIELDS),
    SpecSnapshotEntrySchema.extend(STAMP_FIELDS),
    TicketSnapshotEntrySchema.extend(STAMP_FIELDS),
    RunBranchCreatedEntrySchema.extend(STAMP_FIELDS),
    TicketWorktreeCreatedEntrySchema.extend(STAMP_FIELDS),
    BaselinePreparedEntrySchema.extend(STAMP_FIELDS),
    PrepareMadeEntrySchema.extend(STAMP_FIELDS),
    BaselineTestsEntrySchema.extend(STAMP_FIELDS),
    BaselineReusedEntrySchema.extend(STAMP_FIELDS),
    AgentStartedEntrySchema.extend(STAMP_FIELDS),
    AgentFinishedEntrySchema.extend(STAMP_FIELDS),
    AgentFailedEntrySchema.extend(STAMP_FIELDS),
    ChoresDoneEntrySchema.extend(STAMP_FIELDS),
    RedCheckEntrySchema.extend(STAMP_FIELDS),
    AlreadyDoneCheckedEntrySchema.extend(STAMP_FIELDS),
    LeftoverScanEntrySchema.extend(STAMP_FIELDS),
    ChangesetDroppedEntrySchema.extend(STAMP_FIELDS),
    CommitMadeEntrySchema.extend(STAMP_FIELDS),
    WorktreeResetEntrySchema.extend(STAMP_FIELDS),
    DependenciesInstalledEntrySchema.extend(STAMP_FIELDS),
    GatesRunEntrySchema.extend(STAMP_FIELDS),
    TicketJoinedEntrySchema.extend(STAMP_FIELDS),
    TicketRebasedEntrySchema.extend(STAMP_FIELDS),
    TestsSentBackEntrySchema.extend(STAMP_FIELDS),
    RefactorTestUpdateEntrySchema.extend(STAMP_FIELDS),
    RefactorTestUpdateCheckedEntrySchema.extend(STAMP_FIELDS),
    RunBranchPushedEntrySchema.extend(STAMP_FIELDS),
    TicketStuckEntrySchema.extend(STAMP_FIELDS),
    RunStuckEntrySchema.extend(STAMP_FIELDS),
    ChangesetWrittenEntrySchema.extend(STAMP_FIELDS),
    PullRequestOpenedEntrySchema.extend(STAMP_FIELDS),
    JevAskedEntrySchema.extend(STAMP_FIELDS),
    JevAnsweredEntrySchema.extend(STAMP_FIELDS),
    JevFailedEntrySchema.extend(STAMP_FIELDS),
    DecisionModelOffEntrySchema.extend(STAMP_FIELDS),
    AgentSessionEntrySchema.extend(STAMP_FIELDS),
    AgentSessionClosedEntrySchema.extend(STAMP_FIELDS),
    SharedGitChangedEntrySchema.extend(STAMP_FIELDS),
    RunStoppedEntrySchema.extend(STAMP_FIELDS),
    LimitWaitStartedEntrySchema.extend(STAMP_FIELDS),
    LimitWaitEndedEntrySchema.extend(STAMP_FIELDS),
    UsageLineWaitStartedEntrySchema.extend(STAMP_FIELDS),
    UsageLineWaitEndedEntrySchema.extend(STAMP_FIELDS),
    UsageRecordedEntrySchema.extend(STAMP_FIELDS),
    WorktreesRemovedEntrySchema.extend(STAMP_FIELDS),
    AgentMessageEntrySchema.extend(STAMP_FIELDS),
    AgentMessageDeliveredEntrySchema.extend(STAMP_FIELDS),
    FinalReviewStartedEntrySchema.extend(STAMP_FIELDS),
    LensStartedEntrySchema.extend(STAMP_FIELDS),
    LensFinishedEntrySchema.extend(STAMP_FIELDS),
    FinalReviewFixingEntrySchema.extend(STAMP_FIELDS),
    FinalReviewStuckEntrySchema.extend(STAMP_FIELDS),
    FinalReviewPassedEntrySchema.extend(STAMP_FIELDS),
    FinalReviewShippedEntrySchema.extend(STAMP_FIELDS),
    StuckReportedEntrySchema.extend(STAMP_FIELDS),
    CommentReadEntrySchema.extend(STAMP_FIELDS),
    ReplyReceivedEntrySchema.extend(STAMP_FIELDS),
    ReplyIgnoredEntrySchema.extend(STAMP_FIELDS),
    TicketRetriedEntrySchema.extend(STAMP_FIELDS),
    TicketSkippedEntrySchema.extend(STAMP_FIELDS),
    TicketAlreadyDoneEntrySchema.extend(STAMP_FIELDS),
    TicketClosedEntrySchema.extend(STAMP_FIELDS),
    JoinUndoneEntrySchema.extend(STAMP_FIELDS),
    FinalReviewRetriedEntrySchema.extend(STAMP_FIELDS),
    MemoryRecalledEntrySchema.extend(STAMP_FIELDS),
    MemoryWriteStartedEntrySchema.extend(STAMP_FIELDS),
    MemoryWriteDoneEntrySchema.extend(STAMP_FIELDS),
    MemoriesSavedEntrySchema.extend(STAMP_FIELDS),
    LearningSkippedEntrySchema.extend(STAMP_FIELDS),
    MemoriesReportedEntrySchema.extend(STAMP_FIELDS),
    StepStartedEntrySchema.extend(STAMP_FIELDS),
    StepEndedEntrySchema.extend(STAMP_FIELDS),
    TicketWaitingEntrySchema.extend(STAMP_FIELDS),
    RunResumedEntrySchema.extend(STAMP_FIELDS),
    JoinStartedEntrySchema.extend(STAMP_FIELDS),
    EngineResumedEntrySchema.extend(STAMP_FIELDS),
    ConfigReloadedEntrySchema.extend(STAMP_FIELDS),
    ConfigReloadRefusedEntrySchema.extend(STAMP_FIELDS),
    RepoWaitStartedEntrySchema.extend(STAMP_FIELDS),
    RepoWaitEndedEntrySchema.extend(STAMP_FIELDS),
    RepoWaitSkippedEntrySchema.extend(STAMP_FIELDS),
    RepoWaitPsFailedEntrySchema.extend(STAMP_FIELDS),
    NetworkWaitStartedEntrySchema.extend(STAMP_FIELDS),
    NetworkWaitEndedEntrySchema.extend(STAMP_FIELDS),
])

export type JournalRecord = z.infer<typeof JournalRecordSchema>
