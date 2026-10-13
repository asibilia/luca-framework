import type { Arm, Row, TriggerResult } from './case-schema'

const sum = (numbers: number[]): number =>
    numbers.reduce((total, n) => total + n, 0)

const mean = (numbers: number[]): number =>
    numbers.length === 0 ? 0 : sum(numbers) / numbers.length

/** B may cost, and take, up to this many times what A does. */
export const COST_SLACK = 1.25

/** Means of shares can differ by float noise on a real tie. */
const EPSILON = 1e-9

/** Why a run can't count, or null when it can. */
export const runValidity = ({
    session_id,
    skills,
    skill_name,
    other_names,
    cost_units,
}: {
    session_id: string | null
    skills: string[]
    skill_name: string | null
    other_names: string[]
    cost_units: number
}): string | null => {
    if (session_id === null) return 'claude started no session (no init event)'
    if (skill_name !== null && !skills.includes(skill_name)) {
        return `the ${skill_name} skill did not load`
    }
    const others = other_names.filter((name) => skills.includes(name))
    if (others.length > 0) {
        return `another setup's skill loaded: ${others.join(', ')}`
    }
    if (cost_units === 0) {
        return 'no transcripts found for this run, so its cost is unknown'
    }
    return null
}

export type CaseArmStats = {
    case_id: string
    arm: Arm
    runs: number
    caught: number
    false_blockers: number
    leaks: number
    cost_units: number
    wall_ms: number
}

/** Means per case and setup over valid, graded runs. */
export const caseArmStats = ({ rows }: { rows: Row[] }): CaseArmStats[] => {
    const graded = rows.filter(
        (row) =>
            row.invalid_reason === null &&
            row.caught !== null &&
            row.false_blockers !== null
    )
    const groups = new Map<string, Row[]>()
    for (const row of graded) {
        const key = `${row.case_id}|${row.arm}`
        groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.values()]
        .flatMap((group): CaseArmStats[] => {
            const [head] = group
            if (head === undefined) return []
            return [
                {
                    case_id: head.case_id,
                    arm: head.arm,
                    runs: group.length,
                    caught: mean(group.map((row) => row.caught ?? 0)),
                    false_blockers: mean(
                        group.map((row) => row.false_blockers ?? 0)
                    ),
                    leaks: mean(group.map((row) => row.leaks)),
                    cost_units: mean(group.map((row) => row.cost_units)),
                    wall_ms: mean(group.map((row) => row.wall_ms)),
                },
            ]
        })
        .sort((x, y) => {
            if (x.case_id !== y.case_id) return x.case_id < y.case_id ? -1 : 1
            if (x.arm !== y.arm) return x.arm < y.arm ? -1 : 1
            return 0
        })
}

export type Decision = {
    ships: boolean
    reasons: string[]
    too_easy: string[]
    disagree: string[]
}

type StatKey = 'caught' | 'false_blockers' | 'leaks' | 'cost_units' | 'wall_ms'

const minutes = (ms: number): string => (ms / 60_000).toFixed(1)

/** The spec's decision rule. See `evals/luca-review/README.md`. */
export const decide = ({ rows }: { rows: Row[] }): Decision => {
    const stats = caseArmStats({ rows })
    const of = (case_id: string, arm: Arm): CaseArmStats | undefined =>
        stats.find((s) => s.case_id === case_id && s.arm === arm)
    const case_ids = [...new Set(stats.map((s) => s.case_id))].sort()
    const both = case_ids.filter(
        (id) => of(id, 'A') !== undefined && of(id, 'B') !== undefined
    )
    const reasons = case_ids
        .filter((id) => !both.includes(id))
        .map((id) => `case ${id} has no graded runs of A or of B`)
    if (both.length === 0)
        reasons.push('no case has graded runs of both A and B')
    const too_easy = both.filter((id) => {
        const a = of(id, 'A')
        const b = of(id, 'B')
        const c = of(id, 'C')
        return (
            a !== undefined &&
            b !== undefined &&
            c !== undefined &&
            c.caught >= Math.max(a.caught, b.caught) - EPSILON &&
            c.false_blockers <=
                Math.min(a.false_blockers, b.false_blockers) + EPSILON
        )
    })
    const counted = both.filter((id) => !too_easy.includes(id))
    if (both.length > 0 && counted.length === 0) {
        reasons.push('every case was too easy to tell the setups apart')
    }
    const total = (ids: string[], arm: Arm, key: StatKey): number =>
        sum(ids.map((id) => of(id, arm)?.[key] ?? 0))
    const caught_a = total(counted, 'A', 'caught')
    const caught_b = total(counted, 'B', 'caught')
    if (caught_b < caught_a - EPSILON) {
        reasons.push(
            `B caught less than A (score ${caught_b.toFixed(2)} vs ${caught_a.toFixed(2)}, over ${counted.length} cases)`
        )
    }
    const blockers_a = total(counted, 'A', 'false_blockers')
    const blockers_b = total(counted, 'B', 'false_blockers')
    if (blockers_b > blockers_a + EPSILON) {
        reasons.push(
            `B raised more false blockers than A (${blockers_b.toFixed(2)} vs ${blockers_a.toFixed(2)})`
        )
    }
    const leaks_a = total(both, 'A', 'leaks')
    const leaks_b = total(both, 'B', 'leaks')
    if (leaks_b > leaks_a + EPSILON) {
        reasons.push(
            `B leaked withheld notes more than A (${leaks_b.toFixed(2)} vs ${leaks_a.toFixed(2)})`
        )
    }
    const cost_a = total(both, 'A', 'cost_units')
    const cost_b = total(both, 'B', 'cost_units')
    if (cost_b > COST_SLACK * cost_a + EPSILON) {
        reasons.push(
            `B cost more than ${COST_SLACK}× A (${Math.round(cost_b)} vs ${Math.round(cost_a)} cost units)`
        )
    }
    const wall_a = total(both, 'A', 'wall_ms')
    const wall_b = total(both, 'B', 'wall_ms')
    if (wall_b > COST_SLACK * wall_a + EPSILON) {
        reasons.push(
            `B took more than ${COST_SLACK}× A's time (${minutes(wall_b)} vs ${minutes(wall_a)} minutes)`
        )
    }
    const disagree = both.filter((id) => {
        const a = of(id, 'A')
        const b = of(id, 'B')
        return (
            a !== undefined &&
            b !== undefined &&
            (Math.abs(a.caught - b.caught) > EPSILON ||
                Math.abs(a.false_blockers - b.false_blockers) > EPSILON)
        )
    })
    return { ships: reasons.length === 0, reasons, too_easy, disagree }
}

export type TriggerDecision = {
    passes: boolean
    reasons: string[]
    hits: { A: number; B: number }
    false_hits: { A: number; B: number }
}

/** B's description must start the skill on as many should-prompts as A's, and on no more should-not prompts. */
export const decideTriggers = ({
    a,
    b,
}: {
    a: TriggerResult[]
    b: TriggerResult[]
}): TriggerDecision => {
    const hits = (results: TriggerResult[]) =>
        results.filter(
            (r) => r.invalid_reason === null && r.should_trigger && r.triggered
        ).length
    const false_hits = (results: TriggerResult[]) =>
        results.filter(
            (r) => r.invalid_reason === null && !r.should_trigger && r.triggered
        ).length
    const result = {
        hits: { A: hits(a), B: hits(b) },
        false_hits: { A: false_hits(a), B: false_hits(b) },
    }
    const reasons: string[] = []
    const invalid = [...a, ...b].filter((r) => r.invalid_reason !== null).length
    if (invalid > 0) reasons.push(`${invalid} trigger runs were invalid`)
    if (result.hits.B < result.hits.A) {
        reasons.push(
            `B started on fewer prompts that should start it (${result.hits.B} vs ${result.hits.A})`
        )
    }
    if (result.false_hits.B > result.false_hits.A) {
        reasons.push(
            `B started on more prompts that should not start it (${result.false_hits.B} vs ${result.false_hits.A})`
        )
    }
    return { passes: reasons.length === 0, reasons, ...result }
}

const label = (row: Row): string =>
    `${row.case_id.split('-')[0] ?? row.case_id}${row.arm}${row.rep}`

/** The round's Markdown report: per-case table, decision, trigger test, runs left out. */
export const reportText = ({
    round,
    rows,
    triggers,
}: {
    round: string
    rows: Row[]
    triggers: { a: TriggerResult[]; b: TriggerResult[] } | null
}): string => {
    const stats = caseArmStats({ rows })
    const decision = decide({ rows })
    const versions = [
        ...new Set(rows.map((row) => row.claude_code_version)),
    ].join(', ')
    const left_out = rows.filter(
        (row) => row.invalid_reason !== null || row.caught === null
    )
    const table = [
        '| Case | Setup | Runs | Caught | False blockers | Leaks | Cost units | Minutes |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...stats.map(
            (s) =>
                `| ${s.case_id} | ${s.arm} | ${s.runs} | ${s.caught.toFixed(2)} | ${s.false_blockers.toFixed(2)} | ${s.leaks.toFixed(2)} | ${Math.round(s.cost_units)} | ${minutes(s.wall_ms)} |`
        ),
    ].join('\n')
    const decision_text = decision.ships
        ? '**B ships.**'
        : `**B does not ship yet:**\n\n${decision.reasons.map((r) => `- ${r}`).join('\n')}`
    const trigger_text =
        triggers === null
            ? 'No trigger test in this round.'
            : (() => {
                  const t = decideTriggers(triggers)
                  return [
                      `A started on ${t.hits.A} should-prompts and ${t.false_hits.A} should-not prompts. B: ${t.hits.B} and ${t.false_hits.B}.`,
                      t.passes
                          ? '**Pass.**'
                          : `**Fail:**\n\n${t.reasons.map((r) => `- ${r}`).join('\n')}`,
                  ].join('\n\n')
              })()
    return [
        `# luca-review eval: round ${round}`,
        `Claude Code ${versions || 'unknown'}. ${rows.length} runs; ${left_out.length} left out (invalid or ungraded).`,
        '## Per case',
        table,
        '## Decision',
        decision_text,
        `Too easy to tell apart (not counted for catches or false blockers): ${decision.too_easy.join(', ') || 'none'}.`,
        `A and B disagree on (run these again): ${decision.disagree.join(', ') || 'none'}.`,
        '## Trigger test',
        trigger_text,
        '## Runs left out',
        left_out.length > 0
            ? left_out
                  .map(
                      (row) =>
                          `- ${label(row)}: ${row.invalid_reason ?? 'not graded'}`
                  )
                  .join('\n')
            : 'None.',
        '',
    ].join('\n\n')
}
