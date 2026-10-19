import type { JournalRecord } from '../journal/journal-record'

/**
 * Helper shared by the crash-recovery end-to-end tests
 * (`run-crash-recovery.e2e.test.ts` and
 * `run-crash-recovery-git.e2e.test.ts`).
 */

export const ofKind = <Kind extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: Kind
): Extract<JournalRecord, { kind: Kind }>[] =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: Kind }> =>
            record.kind === kind
    )
