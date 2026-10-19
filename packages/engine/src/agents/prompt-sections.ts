/**
 * The sections the decision step adds to an agent's prompt: the notes earlier
 * agents left, the prepare command, the feature map, and the changesets. Each
 * is plain text.
 */
import type { AgentRole } from './role-results'

import { isFeatureMapFolder } from '../config/engine-config'

/** A run note as a later agent's prompt lists it. */
export type PromptRunNote = { ticket: number; role: AgentRole; note: string }

/** The notes earlier agents left, oldest first; nothing when there are none. */
export const runNotesSection = ({
    run_notes,
}: {
    run_notes: PromptRunNote[]
}): string[] =>
    run_notes.length === 0
        ? []
        : [
              '## Run notes from earlier agents in this run',
              run_notes
                  .map(
                      ({ ticket, role, note }) =>
                          `- ${note} (${role}, #${ticket})`
                  )
                  .join('\n'),
          ]

/**
 * The section a test-writer or implementer gets when the repo has a prepare
 * command: the engine runs it before its test runs, so tests that need its
 * outputs may fail when the agent runs them itself.
 *
 * @example
 * prepareSection({ command: 'bun run build:rom' })
 * // '## This repo has a prepare command\n\n...'
 */
export const prepareSection = ({ command }: { command: string }): string =>
    [
        '## This repo has a prepare command',
        `The engine runs \`${command}\` in the worktree before each of its test runs (the red check and the gates), so tests that need its outputs find them up to date. ` +
            "Never run it yourself. Tests that need its outputs may fail when you run them, and still pass at the engine's checks. " +
            "If the engine's prepare command fails after your turn, its output comes back to you like a failed check.",
    ].join('\n\n')

/**
 * The section a test-writer gets when the repo has a feature map (#583): the
 * one file besides test files it may edit. It comes after the task's "Edit
 * test files only", so it reads as that line's exception. A folder map
 * (#597) is its `*.md` pages, and a new test file goes on its area's page.
 *
 * @param path - The map's path, as `featureMapPath` gives it.
 *
 * @example
 * featureMapSection({ path: 'docs/feature-map.md' })
 * // '## The feature map\n\nBesides test files, you may edit the feature map, `docs/feature-map.md`. ...'
 */
export const featureMapSection = ({ path }: { path: string }): string =>
    [
        '## The feature map',
        isFeatureMapFolder({ path })
            ? `Besides test files, you may edit the feature map's pages, the \`*.md\` files under \`${path}/\`. ` +
              'Read the pages first: they list each feature and the test files that prove it. ' +
              "Put new tests in a feature's existing test files when you can; " +
              "a new test file must be listed under its feature on its area's page (add a page for a new area)."
            : `Besides test files, you may edit the feature map, \`${path}\`. ` +
              'Read it first: it lists each feature and the test files that prove it. ' +
              "Put new tests in a feature's existing test files when you can; " +
              'a new test file must be listed under its feature in the map.',
    ].join('\n\n')

/**
 * The section a test-writer or implementer (a ticket's or the final
 * review's fixers) gets in a repo with changesets: the engine writes the
 * run's one changeset, so an agent's own is extra.
 */
export const CHANGESETS_SECTION = [
    '## The engine writes the changeset',
    "Don't write changesets, even if the repo's rules ask for one: the engine writes the run's one changeset when it opens the PR. " +
        'A new file you add in `.changeset/` is removed before the commit. ' +
        'A finding that only asks for a changeset is answered by this: answer it "wont_fix" and say the engine adds it.',
].join('\n\n')

/**
 * The section every reviewer (the ticket-reviewer and each lens) gets in a
 * repo with changesets, so a rule like "every PR needs a changeset" raises
 * no finding.
 */
export const CHANGESETS_LENS_SECTION = [
    '## The engine writes the changeset',
    "The engine adds the run's one changeset when it opens the PR, so a rule that asks for a changeset is met. " +
        'Raise no finding that only asks for a changeset.',
].join('\n\n')
