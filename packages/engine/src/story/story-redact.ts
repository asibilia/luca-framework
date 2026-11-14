import { readStory, type Story } from './story-schema'

import {
    localRoots,
    redactPrivatePaths,
    type KnownRoots,
} from '../tracker/redact-private-paths'

/** Every string in `value`, at any depth, redacted. */
const redactStrings = ({
    value,
    known,
}: {
    value: unknown
    known: KnownRoots
}): unknown => {
    if (typeof value === 'string') {
        return redactPrivatePaths({ text: value, known })
    }
    if (Array.isArray(value)) {
        return value.map((each) => redactStrings({ value: each, known }))
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, each]) => [
                key,
                redactStrings({ value: each, known }),
            ])
        )
    }
    return value
}

/**
 * A story with no path from this computer in it, before it is posted: each
 * of its texts goes through `redactPrivatePaths`. Its data is base64 in the
 * comments, so a comment-level redaction can't see into it. A clean story
 * comes back equal to the one given, and redacting twice changes nothing
 * more, so a saved story is rewritten only when it really changed.
 *
 * Throws when the redacted story no longer checks against the story schema,
 * so a story is never posted unredacted.
 *
 * @param known - This computer's folders. Defaults to `localRoots()`.
 *
 * @example
 * const safe = redactStory({ story })
 * const bodies = packStory({ story: safe })
 */
export const redactStory = ({
    story,
    known = localRoots(),
}: {
    story: Story
    known?: KnownRoots
}): Story => {
    const read = readStory({ value: redactStrings({ value: story, known }) })
    if (read.status === 'ok') return read.story
    throw new Error(
        'The story does not check once the paths from this computer are taken out of it, so it was not posted.'
    )
}
