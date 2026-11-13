import { expect, test } from 'bun:test'

import * as engine from '../index'

/**
 * What a reader outside the engine needs (#738): the review app (#739)
 * and a run's own story step (#742) import these from `@luca/engine`, so
 * they find, pick, save, and move a story the same way the helper does.
 */
test('the engine exports the story schema, the two-homes rule, and the line mover', () => {
    for (const name of [
        'readStory',
        'storyPositions',
        'packStory',
        'unpackStory',
        'findStory',
        'pickStory',
        'defaultStoryHome',
        'isOwnRepo',
        'loadSharedStory',
        'postSharedStory',
        'prNow',
        'loadPrivateStory',
        'savePrivateStory',
        'removePrivateStory',
        'storiesDir',
        'shiftStory',
        'parseShiftDiff',
        'storyLinePaths',
    ] as const) {
        expect(typeof engine[name]).toBe('function')
    }
    expect(engine.REVIEW_READY_LABEL).toBe('review-ready')
})

/**
 * "Your repo" (#766): the one rule the engine's default home and Luca
 * Walk share. An organization's repo is never yours, and neither is any
 * repo when the signed-in user is unknown.
 */
test("isOwnRepo: a repo is yours only when its owner is the signed-in user's login, in any case", () => {
    expect(engine.isOwnRepo({ repo: 'Octocat/hello', login: 'octocat' })).toBe(
        true
    )
    expect(engine.isOwnRepo({ repo: 'acme/site', login: 'octocat' })).toBe(
        false
    )
    expect(engine.isOwnRepo({ repo: 'octocat/hello', login: null })).toBe(false)
    expect(engine.isOwnRepo({ repo: 'octocat/hello', login: '' })).toBe(false)
})
