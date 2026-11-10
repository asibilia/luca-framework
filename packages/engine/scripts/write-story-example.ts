#!/usr/bin/env bun
/**
 * Writes the example story the `/luca-pr-prep` skill ships (#738), from
 * the tests' own fixture, so the example a writer copies from is always
 * a story the schema accepts:
 *
 *   bun packages/engine/scripts/write-story-example.ts
 *
 * `pr-story-bundle.test.ts` fails when the file no longer matches.
 */
import { join } from 'node:path'

import { story } from '../src/story/testing/story-fixtures'

/** The example the skill ships. */
export const EXAMPLE_FILE = join(
    import.meta.dir,
    '..',
    'skills',
    'luca-pr-prep',
    'references',
    'story-example.json'
)

/** The example's text. */
export const exampleText = (): string => `${JSON.stringify(story(), null, 4)}\n`

if (import.meta.main) {
    await Bun.write(EXAMPLE_FILE, exampleText())
    console.log(`Wrote ${EXAMPLE_FILE}`)
}
