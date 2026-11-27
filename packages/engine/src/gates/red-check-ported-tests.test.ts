import { describe, expect, test } from 'bun:test'

import type { TestCase, TestRun } from './gate-schemas'
import { checkRed, type ChangedTestSource } from './red-check'

import { parseTestPorts } from '../intake/test-ports'
import { parseTestRenames } from '../intake/test-renames'

/**
 * The red check with declared ports: an old test the ticket's ported-tests
 * table names keeps its file and name but may fail until the ticket's code
 * exists. Any other old test must still pass, as before.
 */

const APP = 'src/app.test.tsx'
const SUM = 'src/sum.test.ts'

const run = (
    cases: TestCase[],
    files_without_results: string[] = []
): TestRun => ({
    command: 'bun test',
    ok: false,
    exit_code: 1,
    no_test_files: false,
    cases,
    files_without_results,
    output: '',
})

const ran = (
    full_name: string,
    status: TestCase['status'] = 'passed',
    file = APP
): TestCase => ({ file, full_name, status })

const source = (describe_name: string, names: string[]) =>
    `describe('${describe_name}', () => {\n${names.map((n) => `  test('${n}', () => {})`).join('\n')}\n})`

const ported = (rows: string[]) =>
    parseTestPorts({
        body: ['| File | Tests |', '| --- | --- |', ...rows].join('\n'),
    }).ports

const SUM_SOURCE = source('sum', ['adds'])

/** The red check of a ticket with a mapped, failing `sum > adds` (AC1). */
const redOf = ({
    baseline,
    current,
    changed,
    ports,
    body = '',
    not_loaded = [],
}: {
    baseline: TestCase[]
    current: TestCase[]
    changed: ChangedTestSource[]
    ports: ReturnType<typeof ported>
    body?: string
    not_loaded?: string[]
}) =>
    checkRed({
        criteria_ids: ['AC1'],
        mapping: [
            { criterion_id: 'AC1', tests: [{ file: SUM, name: 'sum > adds' }] },
        ],
        baseline: run(baseline),
        current: run(
            [...current, ran('sum > adds', 'failed', SUM)],
            not_loaded
        ),
        test_files: [SUM, APP],
        sources: Object.fromEntries([
            [SUM, SUM_SOURCE],
            ...changed.map(({ file, current: text }) => [file, text]),
        ]),
        changed_test_sources: [
            ...changed,
            { file: SUM, base: null, current: SUM_SOURCE },
        ],
        renames: parseTestRenames({ body }).renames,
        ports,
    })

const BASE = [ran('app > opens'), ran('app > saves')]
const PORTED: ChangedTestSource = {
    file: APP,
    base: source('app', ['opens', 'saves']),
    current: source('app', ['opens', 'saves']),
}
const FAILS =
    "fails, as a declared port may until the ticket's code exists; the gates must see it pass"

describe('the red check: declared ports', () => {
    test('a ported test that fails is a note, not a problem; one that passes is noted too', () => {
        const result = redOf({
            baseline: BASE,
            current: [ran('app > opens', 'failed'), ran('app > saves')],
            changed: [PORTED],
            ports: ported(['| `src/app.test.tsx` | `*` |']),
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.notes).toContain(
            `old test "app > opens" in ${APP}: ${FAILS}`
        )
        expect(result.notes).toContain(
            `old test "app > saves" in ${APP}: declared ported; still passes`
        )
    })

    test('an old test the table does not name must still pass, with a hint about the table', () => {
        const result = redOf({
            baseline: BASE,
            current: [
                ran('app > opens', 'failed'),
                ran('app > saves', 'failed'),
            ],
            changed: [PORTED],
            ports: ported(['| `src/app.test.tsx` | `app > saves` |']),
        })
        expect(result.problems).toEqual([
            `old test "app > opens" in ${APP} no longer passes (an old test may fail here only when the ticket's ported-tests table names it)`,
        ])
    })

    test("a describe('...') row ports every test under it", () => {
        const result = redOf({
            baseline: [...BASE, ran('menu > shows', 'passed')],
            current: [
                ran('app > opens', 'failed'),
                ran('app > saves', 'failed'),
                ran('menu > shows', 'failed'),
            ],
            changed: [PORTED],
            ports: ported(["| `src/app.test.tsx` | `describe('app')` |"]),
        })
        expect(result.problems).toEqual([
            `old test "menu > shows" in ${APP} no longer passes (an old test may fail here only when the ticket's ported-tests table names it)`,
        ])
    })

    test('in a file that does not load yet, a ported test still named in its text is noted, and one gone is a problem', () => {
        const result = redOf({
            baseline: BASE,
            current: [],
            changed: [{ ...PORTED, current: source('app', ['opens']) }],
            ports: ported(['| `src/app.test.tsx` | `*` |']),
            not_loaded: [APP],
        })
        expect(result.notes).toContain(
            `old test "app > opens" in ${APP}: declared ported; not run (its file does not load yet); the gates must see it pass`
        )
        expect(result.problems).toEqual([
            `old test "app > saves" in ${APP} is declared ported, but no test of that name is in the file`,
        ])
    })

    test('a ported test gone from a file that ran is a problem: a port keeps its name', () => {
        const result = redOf({
            baseline: BASE,
            current: [ran('app > opens', 'failed')],
            changed: [{ ...PORTED, current: source('app', ['opens']) }],
            ports: ported(['| `src/app.test.tsx` | `*` |']),
        })
        expect(result.problems).toEqual([
            `old test "app > saves" in ${APP} is declared ported, but no test of that name is in the file`,
        ])
    })

    test('a test declared renamed and ported may fail, named by its old or its new name', () => {
        const body =
            '| File | Old name | New name |\n| --- | --- | --- |\n| `src/app.test.tsx` | `app > opens` | `app > starts` |\n| `src/app.test.tsx` | `app > saves` | `app > keeps` |'
        const result = redOf({
            baseline: BASE,
            current: [
                ran('app > starts', 'failed'),
                ran('app > keeps', 'failed'),
            ],
            changed: [
                { ...PORTED, current: source('app', ['starts', 'keeps']) },
            ],
            ports: ported([
                '| `src/app.test.tsx` | `app > opens` |',
                '| `src/app.test.tsx` | `app > keeps` |',
            ]),
            body,
        })
        expect(result.problems).toEqual([])
        expect(result.notes).toContain(
            `old test "app > opens" in ${APP}: renamed to "app > starts", as the ticket declares; ${FAILS}`
        )
        expect(result.notes).toContain(
            `old test "app > saves" in ${APP}: renamed to "app > keeps", as the ticket declares; ${FAILS}`
        )
    })

    test('a port row that names no test that passed at the baseline is a note', () => {
        const result = redOf({
            baseline: BASE,
            current: BASE,
            changed: [],
            ports: ported([
                "| `src/app.test.tsx` | `describe('nothing')` |",
                '| `src/other.test.tsx` | `*` |',
            ]),
        })
        expect(result.problems).toEqual([])
        expect(result.notes).toContain(
            `the ticket declares "describe('nothing')" in ${APP} ported, but no such test passed at the baseline`
        )
        expect(result.notes).toContain(
            'the ticket declares "*" in src/other.test.tsx ported, but no such test passed at the baseline'
        )
    })

    test('the table from asibilia/turbo#207: the ported tests fail before the code exists, and the red check passes', () => {
        const ERROR = 'packages/armory/tests/error-boundary.test.tsx'
        const REMEMBERED = 'packages/armory/tests/remembered-file.test.tsx'
        const old = [
            ran('the error boundary > shows the error', 'passed', ERROR),
            ran(
                'remembered-file > a new file replaces the stored one',
                'passed',
                REMEMBERED
            ),
        ]
        const result = redOf({
            baseline: old,
            current: old.map((test) => ({ ...test, status: 'failed' })),
            changed: [],
            ports: ported([
                "| `packages/armory/tests/error-boundary.test.tsx` | `describe('the error boundary')` |",
                '| `packages/armory/tests/remembered-file.test.tsx` | `remembered-file > a new file replaces the stored one` (only the mount changes) |',
            ]),
        })
        expect(result.problems).toEqual([])
        expect(result.ok).toBe(true)
    })
})
