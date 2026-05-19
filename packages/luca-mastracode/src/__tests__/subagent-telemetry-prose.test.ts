/**
 * Positive presence scan: asserts that all 5 spawn-site instruction files
 * contain `record-subagent` prose (added in Wave 2 of the subagent telemetry plan).
 * Also asserts that the reviewer subagent's runtime-composed instructions contain
 * the usage self-report directive after the CONSOLIDATED block — matching exactly
 * how launch.ts assembles the prompt (SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions).
 *
 * NOTE: The reviewer test uses runtime-composition (importing live modules), NOT
 * source-file scanning. This validates the actual prompt structure the model receives,
 * not just the raw source text. Source-file scanning would give false confidence because
 * SUBAGENT_SHARED_PREFIX is prepended at launch time, which affects positional ordering.
 *
 * This is a POSITIVE scanner (proves required content IS present).
 * Do NOT conflate with `no-luca-leak.test.ts` (a NEGATIVE scanner that checks
 * for anti-patterns that must NOT be present).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { describe, test, expect } from 'bun:test'
import { SUBAGENT_SHARED_PREFIX } from '../subagents/shared-prefix.js'
import { reviewerSubagent } from '../subagents/reviewer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INSTRUCTIONS_DIR = join(__dirname, '..', 'instructions')

// readInstruction reads from the instructions dir (mode instruction files).
// For subagent assertions, use runtime-composition (see describe block below).
function readInstruction(filename: string): string {
    return readFileSync(join(INSTRUCTIONS_DIR, filename), 'utf-8')
}

describe('execute.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('execute.md')).toContain('record-subagent')
    })
})

describe('architect.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('architect.md')).toContain('record-subagent')
    })
})

describe('research.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('research.md')).toContain('record-subagent')
    })

    test('hang-timeout directive present', () => {
        const src = readInstruction('research.md')
        // The orchestrator must emit outcome:'timeout' for hung subagents.
        expect(src).toContain('outcome: "timeout"')
        // Elapsed-time check uses Date.now() (no harness timeout API).
        expect(src).toContain('Date.now()')
        // 60s wall-clock floor documented.
        expect(src).toMatch(/60[_]?000|60s|60 seconds/)
    })
})

describe('review.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('review.md')).toContain('record-subagent')
    })
})

describe('review.md Step 4 record-subagent is outside fenced code blocks', () => {
    test('record-subagent directive is NOT inside a ``` fence (fence-split regression)', () => {
        // If record-subagent calls are wrapped in a fenced block, the agent treats them
        // as illustrative documentation and skips execution. This caused all 4 outer
        // reviewer subagents to return success:false (confirmed in two consecutive runs).
        // Algorithm: split by ``` delimiters; odd-indexed segments are inside fences.
        // record-subagent must only appear in even-indexed (outside-fence) segments.
        const content = readInstruction('review.md')
        const segments = content.split('```')
        const insideFenceSegments = segments.filter((_, i) => i % 2 === 1)
        for (const segment of insideFenceSegments) {
            expect(segment).not.toContain('record-subagent')
        }
    })

    test('review.md Step 4 correlationId directive uses ${ts} template, not <ts> placeholder or literal epoch', () => {
        // <ts> placeholder caused agents to emit literal string "reviewer-arch-<ts>" —
        // all correlationIds identical, making invoke<->complete join undefined.
        // A hardcoded numeric epoch (e.g. "reviewer-arch-1747180880") would have the
        // same effect. This test scopes to the Step 4 directive region (between
        // "### Step 4" and the next "### Step" or end of file) and asserts:
        //   (1) `const ts = Date.now()` appears in the directive
        //   (2) correlationIds use the `${ts}` template, not <ts> or a raw epoch
        //   (3) no static 10+ digit timestamp directly suffixes `reviewer-<perspective>-`
        const content = readInstruction('review.md')
        const step4Start = content.indexOf('### Step 4')
        expect(step4Start).toBeGreaterThan(-1)
        const remainder = content.slice(step4Start + '### Step 4'.length)
        const nextStepIdx = remainder.search(/\n### Step \d/)
        const step4Region =
            nextStepIdx >= 0 ? remainder.slice(0, nextStepIdx) : remainder

        // (1) ts captured via Date.now()
        expect(step4Region).toContain('const ts = Date.now()')

        // (2) Template-literal interpolation of ts is present in correlationIds.
        // We look for the canonical reviewer-<role>-${ts} shape on at least one perspective.
        expect(step4Region).toMatch(/reviewer-arch-\$\{ts\}/)

        // (3) Regressed forms must be absent in the operational directive (the
        // backtick-fenced correlationId list). We strip illustrative example
        // strings — quoted forms like "reviewer-arch-1747185300123" that follow
        // `e.g.` — before scanning, so legitimate documentation doesn't trip the
        // hardcoded-epoch guard.
        const directiveBody = step4Region
            // drop `e.g. "..."` example clauses
            .replace(/e\.g\.\s*"[^"]*"/g, 'e.g. <example>')
        //     a) literal <ts> placeholder (any reviewer-<role>-<ts>)
        expect(directiveBody).not.toMatch(/reviewer-(arch|dx|sec|simpl)-<ts>/)
        //     b) hardcoded epoch (10+ contiguous digits after reviewer-<role>-)
        expect(directiveBody).not.toMatch(
            /reviewer-(arch|dx|sec|simpl)-\d{10,}/,
        )
    })
})

describe('finalize.md contains record-subagent prose', () => {
    test('file includes record-subagent', () => {
        expect(readInstruction('finalize.md')).toContain('record-subagent')
    })
})

describe('reviewer subagent runtime-composed instructions contain usage self-report', () => {
    // Compose as launch.ts does: SUBAGENT_SHARED_PREFIX + '\n\n' + sub.instructions
    // This validates the actual prompt structure the model receives, not raw source text.
    const assembled = SUBAGENT_SHARED_PREFIX + '\n\n' + reviewerSubagent.instructions

    // Guard: positional asserts below rely on 'CONSOLIDATED:' appearing only in
    // reviewer.ts output format (not in SUBAGENT_SHARED_PREFIX). If shared-prefix
    // ever mentions CONSOLIDATED:, indexOf below would anchor on the wrong position.
    test('SUBAGENT_SHARED_PREFIX must not contain CONSOLIDATED: (positional test invariant)', () => {
        expect(SUBAGENT_SHARED_PREFIX).not.toContain('CONSOLIDATED:')
    })

    test('assembled instructions include <!-- usage: directive (from shared prefix)', () => {
        expect(assembled).toContain('<!-- usage:')
    })

    test('reviewer-specific usage clarification appears after CONSOLIDATED block', () => {
        // The reviewer.ts clarification prose anchors placement to the CONSOLIDATED block.
        // Check it appears after CONSOLIDATED: in the assembled prompt.
        const consolidatedPos = assembled.indexOf('CONSOLIDATED:')
        const clarificationPos = assembled.indexOf('Append the usage comment immediately after the closing')
        expect(consolidatedPos).toBeGreaterThan(-1)
        expect(clarificationPos).toBeGreaterThan(-1)
        expect(
            clarificationPos,
            'Usage clarification must appear AFTER CONSOLIDATED: block in assembled prompt'
        ).toBeGreaterThan(consolidatedPos)
    })

    test('usage clarification is the terminal instruction (no ## section follows)', () => {
        // Stronger placement constraint: the clarification must be the LAST instruction
        // in reviewer.ts. No `## ` section heading may follow it. This is the structural
        // root cause of the original drift — when clarification was followed by other
        // sections, attention burial caused reviewer-dx/simpl to skip usage emission.
        const clarificationPos = assembled.indexOf('Append the usage comment immediately after the closing')
        expect(clarificationPos).toBeGreaterThan(-1)
        const tail = assembled.slice(clarificationPos)
        // No `## ` (markdown H2) section heading may appear after the clarification.
        expect(tail).not.toMatch(/\n## /)
    })

    // ── Drive-by #18 regression: reviewer-dx + reviewer-simpl ──────────────
    // The original drift in PR #245 only manifested for the `dx` and `simpl`
    // perspectives — the `arch` and `sec` perspectives emitted usage correctly.
    // Root cause: reviewer.ts instructions are shared across perspectives, but
    // the usage clarification was buried mid-document, and attention burial
    // statistically hit the latter half of the prompt (dx/simpl perspectives
    // were typically the last-spawned subagents in the parallel batch).
    //
    // The fix (PR #245 + iter-2 follow-up) pinned the clarification as the
    // LAST line of reviewer.ts. The test below asserts BOTH the structural
    // anchor (lastIndexOf) holds AND no subsequent `## ` heading exists for
    // the assembled prompt that all 4 perspectives receive.
    test('drive-by #18: reviewer.ts terminal usage instruction is the last `Append the usage comment` occurrence (anchors dx/simpl perspectives)', () => {
        const lastPos = assembled.lastIndexOf('Append the usage comment')
        const firstPos = assembled.indexOf('Append the usage comment')
        // Either single occurrence (preferred) or last == terminal.
        expect(lastPos).toBeGreaterThan(-1)
        expect(lastPos).toBeGreaterThanOrEqual(firstPos)
        // No `## ` heading may follow the LAST occurrence (terminal invariant).
        const tail = assembled.slice(lastPos)
        expect(tail).not.toMatch(/\n## /)
    })
})

// ---------------------------------------------------------------------------
// cancel-subagent prose — orchestrator-facing cancellation directive
// ---------------------------------------------------------------------------
//
// Hung subagents that the user kills manually must NOT be reported as a faked
// `subagent.complete`. Instead the parent agent emits `cancel-subagent`, which
// produces a `subagent.cancelled` telemetry record with `outcome:
// cancelled_by_user`. Without explicit prose, agents would invent a complete
// record with `success: false` and lie about the call returning — making real
// hangs indistinguishable from genuine subagent failures in aggregator output.
//
// These tests guard the prose against regression on the two files where
// hung-subagent kills are most likely to happen in practice (execute.md inner
// review loop + review.md outer review pass — both observed killing hung
// subagents in run_mpct9yy0_qfn0vsy5).
describe('cancel-subagent directive present in execute.md', () => {
    test('execute.md documents the cancel-subagent action shape', () => {
        const src = readInstruction('execute.md')
        expect(src).toContain('cancel-subagent')
        // The directive must mention cancelReason so the agent knows the
        // call requires a free-form reason string.
        expect(src).toContain('cancelReason')
        // The directive must explicitly forbid faking subagent.complete.
        expect(src).toMatch(/do NOT emit `subagent\.complete`/i)
    })
})

describe('cancel-subagent directive present in review.md', () => {
    test('review.md Step 4 spawn directive mentions cancel-subagent', () => {
        const src = readInstruction('review.md')
        const step4Start = src.indexOf('### Step 4')
        expect(step4Start).toBeGreaterThan(-1)
        const remainder = src.slice(step4Start)
        const nextStepIdx = remainder.search(/\n### Step \d/)
        const step4Region =
            nextStepIdx >= 0 ? remainder.slice(0, nextStepIdx) : remainder
        expect(step4Region).toContain('cancel-subagent')
    })
})

describe('shared-prefix outcome enum includes cancelled_by_user', () => {
    test('SUBAGENT_SHARED_PREFIX lists cancelled_by_user as a valid outcome', () => {
        // If a subagent self-reports outcome via the usage comment, the prose
        // must explicitly allow `cancelled_by_user` so the value is not
        // dropped at the orchestrator parse step.
        expect(SUBAGENT_SHARED_PREFIX).toContain('cancelled_by_user')
    })
})
