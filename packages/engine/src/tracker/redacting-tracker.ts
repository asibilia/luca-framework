import { redactPrivatePaths, type KnownRoots } from './redact-private-paths'
import type { Tracker } from './tracker'

/**
 * A tracker that sends no paths from this computer: every comment, and a
 * pull request's title and body, go through `redactPrivatePaths` first.
 * Everything else is the wrapped tracker's own. The GitHub tracker wraps
 * itself in it, so no caller can send a comment around it.
 *
 * The redaction runs before the wrapped tracker sees the text, so a
 * tracker's own retry, which compares the comment it posted with the
 * issue's comments, compares the redacted text. The engine's comment
 * markers (`<!-- luca:... -->`) hold no path, so they come through as
 * they are, and `postCommentOnce` still finds a comment by its marker.
 * Stories are redacted where they're packed (`postSharedStory`), since
 * their data is encoded.
 *
 * @param known - This computer's folders, from `localRoots`.
 *
 * @example
 * const tracker = withRedaction({
 *     tracker: createInMemoryTracker({ issues, sub_tickets: {} }),
 *     known: localRoots({ runs_dir: defaultRunsDir() }),
 * })
 * await tracker.comment({ number: 10, body: 'at /Users/me/a.ts' })
 * // posts 'at <home>/a.ts'
 */
export const withRedaction = ({
    tracker,
    known,
}: {
    tracker: Tracker
    known: KnownRoots
}): Tracker => {
    const redact = (text: string): string => redactPrivatePaths({ text, known })
    return {
        ...tracker,
        comment: ({ number, body }) =>
            tracker.comment({ number, body: redact(body) }),
        openPullRequest: ({ title, body, ...rest }) =>
            tracker.openPullRequest({
                ...rest,
                title: redact(title),
                body: redact(body),
            }),
    }
}
