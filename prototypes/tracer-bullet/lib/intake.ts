/**
 * PROTOTYPE (tracer bullet, #334). Intake (#333): plain-code checks on one spec issue and its
 * open ready-for-agent sub-tickets. Any miss refuses the whole run. In the tracer, "refuse" means
 * print why and exit (no GitHub comment, no needs-info label).
 */
import { REPO_SLUG } from './config'
import { ghJson } from './git'

type Issue = {
  number: number
  title: string
  body: string
  state: string
  url: string
  labels: { name: string }[]
}

type ApiIssue = { number: number; title: string; state: string }

export type Criterion = { id: string; text: string }

export type Ticket = {
  number: number
  title: string
  body: string
  url: string
  labels: string[]
  criteria: Criterion[]
  blockers: { number: number; state: string; inSpec: boolean; source: string }[]
}

export type IntakeResult = {
  ok: boolean
  nothingToDo: boolean
  problems: string[]
  spec: Issue
  tickets: Ticket[]
  closedTickets: number[]
}

/** The text under a markdown heading, up to the next heading of the same or higher level. */
export const section = (body: string, heading: string) => {
  const lines = body.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${heading}\\s*$`, 'i').test(l.trim()))
  if (start === -1) return ''
  const level = (/^(#+)/.exec(lines[start]?.trim() ?? '')?.[1] ?? '##').length
  const out: string[] = []
  for (const l of lines.slice(start + 1)) {
    const m = /^(#{1,6})\s/.exec(l.trim())
    if (m && (m[1]?.length ?? 7) <= level) break
    out.push(l)
  }
  return out.join('\n').trim()
}

export const checkboxes = (text: string) =>
  text
    .split('\n')
    .map((l) => /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/.exec(l)?.[2]?.trim())
    .filter((t): t is string => !!t)

const issueRefs = (text: string) => [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]))

const viewIssue = (n: number) =>
  ghJson<Issue>(['issue', 'view', String(n), '--repo', REPO_SLUG, '--json', 'number,title,body,state,labels,url'])

export const runIntake = async (specNumber: number): Promise<IntakeResult> => {
  const problems: string[] = []
  const spec = await viewIssue(specNumber)
  if (spec.state !== 'OPEN') problems.push(`spec #${specNumber} is ${spec.state}, not open`)
  if (!section(spec.body, 'Testing Decisions')) problems.push(`spec #${specNumber} has no non-empty "Testing Decisions" section`)

  const subs = await ghJson<ApiIssue[]>(['api', `repos/${REPO_SLUG}/issues/${specNumber}/sub_issues?per_page=100`])
  const inSpec = new Set(subs.map((s) => s.number))
  const open = subs.filter((s) => s.state === 'open')
  const closedTickets = subs.filter((s) => s.state !== 'open').map((s) => s.number)
  if (open.length === 0) return { ok: false, nothingToDo: true, problems: ['nothing to do: no open tickets'], spec, tickets: [], closedTickets }

  const tickets: Ticket[] = []
  for (const s of open) {
    const t = await viewIssue(s.number)
    const tag = `ticket #${t.number}`
    const labels = t.labels.map((l) => l.name)
    if (!section(t.body, 'What to build')) problems.push(`${tag} has no non-empty "What to build" section`)
    const criteria = checkboxes(section(t.body, 'Acceptance criteria')).map((text, i) => ({ id: `AC${i + 1}`, text }))
    if (criteria.length === 0) problems.push(`${tag} has no acceptance-criteria checkbox`)
    if (!labels.includes('ready-for-agent')) problems.push(`${tag} lacks the ready-for-agent label (has: ${labels.join(', ') || 'none'})`)

    const native = await ghJson<ApiIssue[]>(['api', `repos/${REPO_SLUG}/issues/${t.number}/dependencies/blocked_by`])
    const blockers: Ticket['blockers'] = native.map((b) => ({ number: b.number, state: b.state, inSpec: inSpec.has(b.number), source: 'native blocked-by' }))
    const blockedByText = section(t.body, 'Blocked by')
    for (const n of issueRefs(blockedByText)) {
      if (blockers.some((b) => b.number === n)) continue
      const b = await viewIssue(n)
      blockers.push({ number: n, state: b.state.toLowerCase(), inSpec: inSpec.has(n), source: '"Blocked by" section' })
    }
    for (const b of blockers)
      if (b.state === 'open' && !b.inSpec) problems.push(`${tag} is blocked by open #${b.number}, which is outside spec #${specNumber}`)
    tickets.push({ number: t.number, title: t.title, body: t.body, url: t.url, labels, criteria, blockers })
  }

  // Blocker loops among the spec's open tickets.
  const edges = new Map(tickets.map((t) => [t.number, t.blockers.filter((b) => b.state === 'open' && b.inSpec).map((b) => b.number)]))
  const visiting = new Set<number>()
  const done = new Set<number>()
  const order: number[] = []
  const visit = (n: number, path: number[]): void => {
    if (done.has(n)) return
    if (visiting.has(n)) {
      problems.push(`blocker loop: ${[...path, n].map((x) => `#${x}`).join(' -> ')}`)
      return
    }
    visiting.add(n)
    for (const m of edges.get(n) ?? []) visit(m, [...path, n])
    visiting.delete(n)
    done.add(n)
    order.push(n)
  }
  for (const t of tickets) visit(t.number, [])
  const sorted = order.map((n) => tickets.find((t) => t.number === n)).filter((t): t is Ticket => !!t)

  return { ok: problems.length === 0, nothingToDo: false, problems, spec, tickets: sorted, closedTickets }
}
