/**
 * PROTOTYPE (tracer bullet, #334). The spine, for one spec issue:
 * intake → worktree → test-writer → red check → leftover scan → commit → implementer → gates →
 * leftover scan → commit → ticket review (and fix rounds) → push the run branch → one draft PR.
 * Plain code moves every stage. Agents never commit, push, or touch GitHub. Throwaway.
 *
 *   bun prototypes/tracer-bullet/run.ts --spec 351 [--haiku] [--open-pr] [--keep-worktree]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

import {
  createEngineCtx,
  isRunStopped,
  preflight,
  startAgent,
  type AgentSession,
  type TurnOutcome,
} from './lib/agent'
import {
  clip,
  leftoverScan,
  redCheck,
  rolePathViolations,
  runGates,
  runTests,
  secretScan,
  type CriterionMap,
  type GateResult,
  type LeftoverHit,
  type RoleName,
  type TestRun,
} from './lib/checks'
import { LIMITS, makeRunId, MODELS, PROTO_DIR, REPO_SLUG, RUNS_DIR, TEST_GLOB, type Mode } from './lib/config'
import {
  compareGitState,
  createRunWorktree,
  deltaPaths,
  engineCommit,
  fileStates,
  gh,
  git,
  gitOk,
  gitState,
  isUntracked,
  removeRunWorktree,
  revertPaths,
  statusEntries,
  type GitState,
  type RunWorktree,
} from './lib/git'
import { runIntake, type Criterion, type Ticket } from './lib/intake'
import { createJournal } from './lib/journal'
import {
  implementerSpec,
  reviewerSpec,
  testWriterSpec,
  type Finding,
  type ImplementerResult,
  type ReviewResult,
} from './lib/roles'
import { runOk } from './lib/shell'

// ---------- flags ----------

const { values: flags } = parseArgs({
  options: {
    spec: { type: 'string' },
    haiku: { type: 'boolean' },
    'open-pr': { type: 'boolean' },
    'keep-worktree': { type: 'boolean' },
    'debug-loops': { type: 'boolean' },
  },
})
if (!flags.spec) {
  console.error('usage: bun prototypes/tracer-bullet/run.ts --spec <issue> [--haiku] [--open-pr] [--keep-worktree] [--debug-loops]')
  process.exit(64)
}
if (flags.haiku && flags['open-pr']) {
  console.error('Refusing: debug (Haiku) runs never push or open a PR.')
  process.exit(64)
}
if (flags['debug-loops'] && !flags.haiku) {
  console.error('Refusing: --debug-loops injects failures and is for Haiku debug runs only.')
  process.exit(64)
}
/** Haiku-only: inject one red-check failure, one gate failure, and forced round-1 findings, to exercise every loop. */
const debugLoops = !!flags['debug-loops']

const mode: Mode = flags.haiku ? 'haiku' : 'opus'
const model = MODELS[mode]
const specNumber = Number(flags.spec)
const runId = makeRunId(mode === 'haiku' ? 'dbg' : 'run')
const journal = createJournal(join(RUNS_DIR, `PROTOTYPE-wipe-me-${runId}.jsonl`), runId)
const ctx = createEngineCtx(journal)

// ---------- run state (printed in full after every step) ----------

type Tokens = { input: number; output: number; cache_read: number; cache_creation: number }
type Window = { utilization: number | null; resets_at: string | null } | null
type Snapshot = { label: string; five_hour: Window; seven_day: Window; seven_day_opus: Window }

type AgentSummary = {
  name: string
  role: RoleName
  ticket: number
  model: string
  session_id: string | null
  claude_code_version: string | null
  turns: number
  model_turns: number
  duration_ms: number
  cost_usd_estimate: number
  tokens: Tokens
  usage_before: Snapshot | null
  usage_after: Snapshot | null
  rate_limit_first: unknown
  rate_limit_last: unknown
  permission_denials: number
  tool_calls: number
}

type TicketState = {
  number: number
  title: string
  status: 'pending' | 'building' | 'done' | 'stuck'
  criteria: Criterion[]
  red_rounds: number
  gate_runs: number
  review_rounds: number
  bad_test_bounces: number
  mapping: CriterionMap | null
  commits: string[]
  open_findings: Finding[]
  stuck_reason: string | null
}

type Commit = { sha: string; subject: string; files: string }

const state = {
  run_id: runId,
  mode,
  model,
  spec: specNumber,
  step: 'start',
  started_at: new Date().toISOString(),
  journal: journal.file,
  preflight: null as unknown,
  intake: null as null | { ok: boolean; problems: string[]; tickets: number[] },
  worktree: null as null | RunWorktree,
  baseline: null as null | { tests: number; test_files: number; types_ok: boolean },
  tickets: [] as TicketState[],
  commits: [] as (Commit & { ticket: number })[],
  agents: [] as AgentSummary[],
  live_agents: [] as string[],
  assumptions: [] as { agent: string; text: string }[],
  run_notes: [] as { agent: string; text: string }[],
  implementer_summary: '' as string,
  review: null as null | { ticket: number; approved_in_round: number; criteria: ReviewResult['criteria'] },
  nits: [] as (Finding & { round: number })[],
  declined: [] as { id: string; title: string; reason: string; ruling: string }[],
  gate_runs: [] as { label: string; ok: boolean; tests_ok: boolean; types_ok: boolean; cases: number }[],
  red_checks: [] as { round: number; ok: boolean; problems: string[] }[],
  leftover_scans: [] as { label: string; hits: LeftoverHit[] }[],
  backstops: [] as { agent: string; delta: string[]; violations: string[]; git_problems: string[] }[],
  failed_tries: [] as { label: string; used: number; limit: number; reason: string }[],
  messages: null as unknown,
  usage: null as unknown,
  stuck: null as null | { ticket: number; reason: string },
  stopped: null as string | null,
  pr: null as null | { url: string; branch: string },
}

let specIssue = { number: specNumber, title: '', body: '' }
let claudeMd = ''
let writerCount = 0
let gateCount = 0

const printState = (step: string) => {
  state.step = step
  state.stopped = ctx.stoppedReason()
  state.live_agents = ctx.bus.liveNames()
  journal.write('state', { step, state })
  console.log(`\n===== STATE after: ${step} =====`)
  console.log(JSON.stringify(state, null, 2))
}

const ticketState = (n: number) => {
  const t = state.tickets.find((x) => x.number === n)
  if (!t) throw new Error(`no ticket state for #${n}`)
  return t
}

// ---------- helpers ----------

const createTries = (label: string, limit: number) => {
  let used = 0
  return {
    limit,
    used: () => used,
    reset: () => {
      used = 0
    },
    /** Returns true when the cap is reached (the ticket is stuck). */
    fail: (reason: string) => {
      used++
      state.failed_tries.push({ label, used, limit, reason: reason.slice(0, 300) })
      journal.write('failed_try', { label, used, limit, reason })
      return used >= limit
    },
  }
}
type Tries = ReturnType<typeof createTries>

const noteOutput = (agent: string, out: { assumptions?: string[]; run_notes?: string[] }) => {
  for (const a of out.assumptions ?? []) state.assumptions.push({ agent, text: a })
  for (const n of out.run_notes ?? []) state.run_notes.push({ agent, text: n })
  journal.write('agent_notes', { agent, assumptions: out.assumptions ?? [], run_notes: out.run_notes ?? [] })
}

const summarizeAgent = (s: AgentSession<unknown>, ticket: number): AgentSummary => {
  const mu = (s.info.modelUsage ?? {}) as Record<
    string,
    { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number }
  >
  const tokens = Object.values(mu).reduce<Tokens>(
    (a, m) => ({
      input: a.input + m.inputTokens,
      output: a.output + m.outputTokens,
      cache_read: a.cache_read + m.cacheReadInputTokens,
      cache_creation: a.cache_creation + m.cacheCreationInputTokens,
    }),
    { input: 0, output: 0, cache_read: 0, cache_creation: 0 },
  )
  const snaps = s.info.usageSnapshots as unknown as Snapshot[]
  const ev = s.info.rateLimitEvents
  return {
    name: s.name,
    role: s.role,
    ticket,
    model,
    session_id: s.info.sessionId,
    claude_code_version: s.info.claudeCodeVersion,
    turns: s.info.turns,
    model_turns: s.info.numTurnsTotal,
    duration_ms: s.info.durationMs,
    cost_usd_estimate: s.info.costUsd,
    tokens,
    usage_before: snaps.find((x) => x.label === 'before') ?? null,
    usage_after: snaps.find((x) => x.label === 'after') ?? null,
    rate_limit_first: ev[0] ?? null,
    rate_limit_last: ev.at(-1) ?? null,
    permission_denials: s.info.permissionDenials.length,
    tool_calls: s.info.toolCalls.length,
  }
}

const closeAgent = async (s: AgentSession<unknown>, ticket: number) => {
  await s.close()
  const summary = summarizeAgent(s, ticket)
  state.agents.push(summary)
  journal.write('agent_summary', summary)
}

const junitPath = (wt: RunWorktree, label: string) => join(wt.runDir, `junit-${label}.xml`)
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const criteriaBlock = (t: Ticket) => t.criteria.map((c) => `${c.id}: ${c.text}`).join('\n')
const mappingBlock = (t: Ticket, mapping: CriterionMap) =>
  t.criteria
    .map((c) => {
      const tests = mapping.find((m) => m.criterion_id === c.id)?.tests ?? []
      return `${c.id}: ${c.text}\n${tests.map((x) => `  - ${x.file} :: ${x.name}`).join('\n')}`
    })
    .join('\n')

const contextBlock = (t: Ticket) =>
  [
    `## Ticket #${t.number}: ${t.title}`,
    '',
    t.body.trim(),
    '',
    `## Spec #${specIssue.number}: ${specIssue.title}`,
    '',
    specIssue.body.trim(),
    '',
    '## Repo notes (CLAUDE.md at the repo root; the spec and ticket win where they differ)',
    '',
    claudeMd.trim() || '(none)',
    '',
    `## Run notes from earlier agents in this run (the ${LIMITS.runNotesShown} newest)`,
    '',
    state.run_notes
      .slice(-LIMITS.runNotesShown)
      .map((n) => `- (${n.agent}) ${n.text}`)
      .join('\n') || '- none yet',
  ].join('\n')

const outputText = (r: TestRun) => clip(`${r.shell.stdout}\n${r.shell.stderr}`, 5000)

// ---------- backstop (after every agent turn) ----------

type TurnSnapshot = { files: Map<string, string>; git: GitState }
const snapshot = async (wt: RunWorktree): Promise<TurnSnapshot> => ({ files: await fileStates(wt.path), git: await gitState(wt) })

const backstop = async (wt: RunWorktree, role: RoleName, agent: string, before: TurnSnapshot) => {
  const files = await fileStates(wt.path)
  const after = await gitState(wt)
  const delta = deltaPaths(before.files, files)
  const violations = rolePathViolations(role, delta)
  const gitProblems = compareGitState(before.git, after)
  const repaired: string[] = []
  if (violations.length) repaired.push(...(await revertPaths(wt.path, violations)))
  if (after.head !== before.git.head) {
    await gitOk(wt.path, ['reset', '--soft', before.git.head])
    repaired.push(`reset --soft to ${before.git.head}`)
  }
  if (after.staged) {
    await gitOk(wt.path, ['reset', '-q'])
    repaired.push('unstaged the index')
  }
  for (const ref of after.refsAtHead.filter((r) => !before.git.refsAtHead.includes(r))) {
    if (ref.startsWith('refs/heads/')) await git(wt.path, ['branch', '-D', ref.slice('refs/heads/'.length)])
    if (ref.startsWith('refs/tags/')) await git(wt.path, ['tag', '-d', ref.slice('refs/tags/'.length)])
    repaired.push(`deleted ${ref}`)
  }
  const record = { agent, role, delta, violations, git_problems: gitProblems, repaired }
  journal.write('backstop', record)
  state.backstops.push({ agent, delta, violations, git_problems: gitProblems })
  return { ok: violations.length === 0 && gitProblems.length === 0, ...record }
}
type Backstop = Awaited<ReturnType<typeof backstop>>

// ---------- feedback prompts ----------

const guardFeedback = (g: Backstop, tries: Tries) =>
  [
    `Guard violation (failed try ${tries.used()} of ${tries.limit}). Your role may not change these paths, so the engine reverted them:`,
    ...g.violations.map((p) => `- ${p}`),
    ...g.git_problems.map((p) => `- git: ${p}`),
    ...(g.repaired.length ? ['Repairs made by the engine:', ...g.repaired.map((r) => `- ${r}`)] : []),
    'Carry on within your role, then return your structured result.',
  ].join('\n')

const resultFeedback = (o: Extract<TurnOutcome<unknown>, { ok: false }>, tries: Tries) =>
  [
    `Your last turn did not end with a valid structured result (failed try ${tries.used()} of ${tries.limit}).`,
    `What the engine saw: ${o.kind}: ${o.detail.slice(0, 1500)}`,
    'Finish the work if anything is left, then return the structured result that matches the schema.',
  ].join('\n')

const leftoverFeedback = (hits: LeftoverHit[], tries: Tries) =>
  [
    `The leftover scan found files that must not be committed (failed try ${tries.used()} of ${tries.limit}):`,
    ...hits.map((h) => `- ${h.path}: ${h.reason}`),
    'Delete them (you may use `rm`), unless the ticket or spec truly needs one; then say why under "assumptions". Then return your structured result.',
  ].join('\n')

const gateFeedback = (g: GateResult, tries: Tries) =>
  [
    `The engine's gate run failed (failed try ${tries.used()} of ${tries.limit}). Fix it in this session; only the engine's run counts.`,
    '',
    g.report,
  ].join('\n')

// ---------- engine side effects ----------

const scan = async (wt: RunWorktree, t: Ticket, label: string) => {
  const entries = await statusEntries(wt.path)
  const hits = await leftoverScan({ cwd: wt.path, entries, mentionText: `${specIssue.body}\n${t.body}` })
  state.leftover_scans.push({ label, hits })
  journal.write('leftover_scan', { label, files: entries.map((e) => `${e.x}${e.y} ${e.path}`), hits })
  printState(`leftover scan: ${label}`)
  return hits
}

const commitIfChanges = async (wt: RunWorktree, t: Ticket, subject: string, body: string): Promise<Commit | null> => {
  if ((await statusEntries(wt.path)).length === 0) {
    journal.write('commit_skipped', { ticket: t.number, subject, reason: 'no changes' })
    return null
  }
  const c = await engineCommit(wt.path, subject, body, runId)
  state.commits.push({ ...c, ticket: t.number })
  ticketState(t.number).commits.push(c.sha)
  journal.write('commit', { ticket: t.number, ...c })
  printState(`commit: ${subject}`)
  return c
}

const recordGates = (label: string, g: GateResult) => {
  state.gate_runs.push({ label, ok: g.ok, tests_ok: g.tests.ok, types_ok: g.types.exitCode === 0, cases: g.tests.cases.length })
  journal.write('gate_run', {
    label,
    ok: g.ok,
    report: g.report,
    tests: { exit: g.tests.shell.exitCode, stdout: g.tests.shell.stdout, stderr: g.tests.shell.stderr, cases: g.tests.cases },
    types: { exit: g.types.exitCode, stdout: g.types.stdout, stderr: g.types.stderr },
  })
}

// ---------- red: test-writer + red check + commit ----------

type BadTest = NonNullable<ImplementerResult['bad_test']>
type RedOk = { ok: true; mapping: CriterionMap; commit: Commit; run: TestRun; writer: string }

const testWriterPrompt = (wt: RunWorktree, t: Ticket, badTest: BadTest | null) =>
  [
    `You are the test-writer for ticket #${t.number} of spec #${specIssue.number}. Your cwd is a worktree of this repo: ${wt.path}`,
    'Test command: `bun test`, from the repo root. Test files: ' + TEST_GLOB + '.',
    ...(badTest
      ? [
          '',
          `The implementer reported a bad test: ${badTest.file} :: ${badTest.name}`,
          `Its reason: ${badTest.reason}`,
          'The earlier tests are committed. The implementation was set aside, so the code under test does not exist again.',
          'Fix or replace the bad test so it matches the ticket and spec. Every named test must fail now. Return the full criteria map again.',
        ]
      : []),
    '',
    '## Acceptance criteria (use these ids)',
    criteriaBlock(t),
    '',
    contextBlock(t),
    '',
    'Write the failing tests now. Test files only.',
  ].join('\n')

const redFeedback = (problems: string[], r: TestRun, tries: Tries) =>
  [
    `The engine's red check failed (failed round ${tries.used()} of ${tries.limit}). Fix the tests, then return the full criteria map again.`,
    'Problems:',
    ...problems.map((p) => `- ${p}`),
    '',
    'The engine ran `bun test` (output clipped):',
    outputText(r),
  ].join('\n')

const redPhase = async (wt: RunWorktree, t: Ticket, baseline: TestRun, badTest: BadTest | null): Promise<RedOk | { ok: false; reason: string }> => {
  const ts = ticketState(t.number)
  const name = `test-writer#${t.number}.${++writerCount}`
  const tw = await startAgent(
    testWriterSpec({ name, ticket: `#${t.number}`, cwd: wt.path, model, mainGitDir: wt.commonGitDir }),
    ctx,
  )
  printState(`started ${name}`)
  try {
    const tries = createTries(`red check #${t.number} (${name})`, LIMITS.redRounds)
    let prompt = testWriterPrompt(wt, t, badTest)
    while (true) {
      ts.red_rounds++
      const before = await snapshot(wt)
      const outcome = await tw.turn(prompt, 30 * 60_000)
      const guard = await backstop(wt, 'test-writer', name, before)
      printState(`${name} turn ${tw.info.turns}`)
      if (!guard.ok) {
        if (tries.fail(`guard: ${[...guard.violations, ...guard.git_problems].join('; ')}`))
          return { ok: false, reason: `red check: ${tries.limit} failed rounds (last: guard violation)` }
        prompt = guardFeedback(guard, tries)
        continue
      }
      if (!outcome.ok) {
        if (tries.fail(`result ${outcome.kind}: ${outcome.detail}`))
          return { ok: false, reason: `red check: ${tries.limit} failed rounds (last: bad result, ${outcome.kind})` }
        prompt = resultFeedback(outcome, tries)
        continue
      }
      noteOutput(name, outcome.output)
      if (outcome.output.outcome === 'nothing_new_to_test')
        return {
          ok: false,
          reason: 'the test-writer answered "nothing new to test". Suggestion: add the `refactor` label if the ticket changes no behavior.',
        }
      const run = await runTests(wt.path, junitPath(wt, `red-${ts.red_rounds}`))
      let rc = redCheck({
        cwd: wt.path,
        criterionIds: t.criteria.map((c) => c.id),
        mapping: outcome.output.criteria,
        baseline,
        current: run,
      })
      if (debugLoops && tries.used() === 0 && !badTest) {
        rc = {
          ...rc,
          ok: false,
          problems: [...rc.problems, 'DEBUG (--debug-loops): the engine injected this failure to exercise the red fix loop. If your tests are fine, return the same result again.'],
        }
        journal.write('debug_injected', { where: 'red check', round: ts.red_rounds })
      }
      state.red_checks.push({ round: ts.red_rounds, ok: rc.ok, problems: rc.problems })
      journal.write('red_check', {
        ticket: t.number,
        writer: name,
        round: ts.red_rounds,
        ok: rc.ok,
        problems: rc.problems,
        notes: rc.notes,
        mapping: outcome.output.criteria,
        bun_test: { exit: run.shell.exitCode, stdout: run.shell.stdout, stderr: run.shell.stderr },
        cases: run.cases,
        files_without_results: run.filesWithoutResults,
      })
      printState(`red check #${t.number} round ${ts.red_rounds}`)
      if (!rc.ok) {
        if (tries.fail(`red check: ${rc.problems.join('; ')}`))
          return { ok: false, reason: `red check failed ${tries.limit} rounds: ${rc.problems.slice(0, 3).join('; ')}` }
        prompt = redFeedback(rc.problems, run, tries)
        continue
      }
      const hits = await scan(wt, t, `before red commit #${t.number}`)
      if (hits.length) {
        if (tries.fail(`leftovers: ${hits.map((h) => h.path).join(', ')}`))
          return { ok: false, reason: `red: ${tries.limit} failed rounds (last: leftovers)` }
        prompt = leftoverFeedback(hits, tries)
        continue
      }
      const commit = await commitIfChanges(
        wt,
        t,
        `test(tracer-sandbox): failing tests for #${t.number} (red)`,
        `Tests by ${name}. Red check passed: every criterion has a test, every named test fails, old tests still pass.`,
      )
      if (!commit) return { ok: false, reason: 'red check passed but there was nothing to commit' }
      return { ok: true, mapping: outcome.output.criteria, commit, run, writer: name }
    }
  } finally {
    await closeAgent(tw, t.number)
  }
}

// ---------- green: implementer + gates (+ bad-test bounce) ----------

type GreenLoop =
  | { kind: 'green'; output: ImplementerResult }
  | { kind: 'bad_test'; output: ImplementerResult }
  | { kind: 'stuck'; reason: string }

const implementUntilGreen = async (
  wt: RunWorktree,
  t: Ticket,
  impl: AgentSession<ImplementerResult>,
  firstPrompt: string,
  tries: Tries,
): Promise<GreenLoop> => {
  const ts = ticketState(t.number)
  let prompt = firstPrompt
  while (true) {
    const before = await snapshot(wt)
    const outcome = await impl.turn(prompt, 40 * 60_000)
    const guard = await backstop(wt, 'implementer', impl.name, before)
    printState(`${impl.name} turn ${impl.info.turns}`)
    if (!guard.ok) {
      if (tries.fail(`guard: ${[...guard.violations, ...guard.git_problems].join('; ')}`))
        return { kind: 'stuck', reason: `implementer: ${tries.limit} failed tries (last: guard violation)` }
      prompt = guardFeedback(guard, tries)
      continue
    }
    if (!outcome.ok) {
      if (tries.fail(`result ${outcome.kind}: ${outcome.detail}`))
        return { kind: 'stuck', reason: `implementer: ${tries.limit} failed tries (last: bad result, ${outcome.kind})` }
      prompt = resultFeedback(outcome, tries)
      continue
    }
    noteOutput(impl.name, outcome.output)
    state.implementer_summary = outcome.output.summary
    if (outcome.output.outcome === 'bad_test') return { kind: 'bad_test', output: outcome.output }
    const label = `gates-${++gateCount}`
    let gates = await runGates(wt.path, junitPath(wt, label))
    if (debugLoops && gateCount === 1) {
      gates = {
        ...gates,
        ok: false,
        report: `${gates.report}\nDEBUG (--debug-loops): the engine injected this failure to exercise the gate fix loop. If every gate passes, return your result again.`,
      }
      journal.write('debug_injected', { where: 'gates', label })
    }
    ts.gate_runs++
    recordGates(label, gates)
    printState(`gates #${t.number} run ${ts.gate_runs}`)
    if (!gates.ok) {
      if (tries.fail(`gates: ${gates.report.split('\n').filter((l) => l.includes('FAIL')).join('; ')}`))
        return { kind: 'stuck', reason: `gates failed ${tries.limit} times` }
      prompt = gateFeedback(gates, tries)
      continue
    }
    const hits = await scan(wt, t, `after ${impl.name} turn ${impl.info.turns}`)
    if (hits.length) {
      if (tries.fail(`leftovers: ${hits.map((h) => h.path).join(', ')}`))
        return { kind: 'stuck', reason: `implementer: ${tries.limit} failed tries (last: leftovers)` }
      prompt = leftoverFeedback(hits, tries)
      continue
    }
    return { kind: 'green', output: outcome.output }
  }
}

const implementerPrompt = (wt: RunWorktree, t: Ticket, red: RedOk) =>
  [
    `You are the implementer for ticket #${t.number} of spec #${specIssue.number}. Your cwd is a worktree of this repo: ${wt.path}`,
    `The test-writer's failing tests are committed (${red.commit.sha.slice(0, 12)}). Make them pass, and make every gate pass:`,
    '- bun test',
    '- bunx --bun tsc --noEmit',
    `Don't touch test files (${TEST_GLOB}).`,
    '',
    '## Failing tests, by acceptance criterion',
    mappingBlock(t, red.mapping),
    '',
    "## The engine's red-check run of `bun test` (clipped)",
    outputText(red.run),
    '',
    contextBlock(t),
  ].join('\n')

const setAside = async (wt: RunWorktree) => {
  const dir = join(wt.runDir, `set-aside-${Date.now()}`)
  mkdirSync(join(dir, 'files'), { recursive: true })
  const patch = (await gitOk(wt.path, ['diff', '--binary', 'HEAD'])).stdout
  writeFileSync(join(dir, 'tracked.patch'), patch)
  const untracked = (await statusEntries(wt.path)).filter(isUntracked).map((e) => e.path)
  for (const p of untracked) {
    mkdirSync(dirname(join(dir, 'files', p)), { recursive: true })
    cpSync(join(wt.path, p), join(dir, 'files', p))
  }
  await gitOk(wt.path, ['checkout', 'HEAD', '--', '.'])
  for (const p of untracked) rmSync(join(wt.path, p), { force: true })
  journal.write('set_aside', { dir, untracked, patch_bytes: patch.length })
  return { dir, patch, untracked }
}

const restore = async (wt: RunWorktree, s: Awaited<ReturnType<typeof setAside>>) => {
  if (s.patch.trim()) await gitOk(wt.path, ['apply', '--binary', join(s.dir, 'tracked.patch')])
  for (const p of s.untracked) {
    mkdirSync(dirname(join(wt.path, p)), { recursive: true })
    cpSync(join(s.dir, 'files', p), join(wt.path, p))
  }
  journal.write('restored', { dir: s.dir })
}

// ---------- ticket review (and fix rounds) ----------

const reviewPrompt = (
  wt: RunWorktree,
  t: Ticket,
  round: number,
  base: string,
  head: string,
  diff: string,
  earlier: { finding: Finding; response: string }[],
) =>
  [
    `You are a fresh ticket reviewer for ticket #${t.number} of spec #${specIssue.number} (review round ${round} of ${LIMITS.reviewRounds}). Your cwd: ${wt.path}. You are read-only.`,
    `Review the committed diff below (git diff ${base.slice(0, 12)}..${head.slice(0, 12)}).`,
    round === 1
      ? 'It is the whole ticket.'
      : 'It holds only the changes made since the last review. Rule on each earlier finding below, then look for new problems in the new changes.',
    '',
    '## Acceptance criteria',
    criteriaBlock(t),
    '',
    ...(earlier.length
      ? [
          '## Earlier findings and the fixers\' responses',
          ...earlier.map(
            (e) => `- ${e.finding.id} [${e.finding.severity}, ${e.finding.kind}] ${e.finding.file ?? ''}: ${e.finding.title}. ${e.finding.detail}\n  Fixer: ${e.response}`,
          ),
          '',
        ]
      : []),
    '## The diff',
    '```diff',
    clip(diff, 60_000),
    '```',
    '',
    contextBlock(t),
    ...(debugLoops && round === 1
      ? [
          '',
          'DEBUG (--debug-loops): in this round you MUST report at least two findings: one should_fix of kind "code" and one should_fix of kind "test". Pick real, minor improvements, so the engine can exercise its fix loop.',
        ]
      : []),
  ].join('\n')

const findingsPrompt = (round: number, codeF: Finding[], testF: Finding[]) =>
  [
    `The ticket reviewer (round ${round}) reported findings. Fix the code findings in this session.`,
    'For one you disagree with, do not change the code for it: list it under "wont_fix" with your reason.',
    ...(testF.length ? [`Findings about tests (${testF.map((f) => f.id).join(', ')}) went to a fresh test-writer; its changes are in the worktree now.`] : []),
    'Then make every gate pass (bun test; bunx --bun tsc --noEmit).',
    '',
    ...codeF.map((f) => `- ${f.id} [${f.severity}] ${f.file ?? ''}: ${f.title}. ${f.detail}`),
  ].join('\n')

const testFixPhase = async (wt: RunWorktree, t: Ticket, findings: Finding[]) => {
  const ts = ticketState(t.number)
  const name = `test-writer#${t.number}.${++writerCount}`
  const tw = await startAgent(testWriterSpec({ name, ticket: `#${t.number}`, cwd: wt.path, model, mainGitDir: wt.commonGitDir }), ctx)
  printState(`started ${name} (test findings)`)
  try {
    const tries = createTries(`test fixes #${t.number} (${name})`, LIMITS.redRounds)
    let prompt = [
      `You are a fresh test-writer for ticket #${t.number} of spec #${specIssue.number}. Your cwd: ${wt.path}`,
      'The code is written and committed. The ticket reviewer reported findings about the tests. Fix them in test files only.',
      'Tests may pass now, because the code exists. For a finding you disagree with, list it under "wont_fix" with your reason.',
      'Return the full criteria map (every criterion id with its tests).',
      '',
      ...findings.map((f) => `- ${f.id} [${f.severity}] ${f.file ?? ''}: ${f.title}. ${f.detail}`),
      '',
      '## Current criteria map',
      ts.mapping ? mappingBlock(t, ts.mapping) : '(none)',
      '',
      contextBlock(t),
    ].join('\n')
    while (true) {
      const before = await snapshot(wt)
      const outcome = await tw.turn(prompt, 30 * 60_000)
      const guard = await backstop(wt, 'test-writer', name, before)
      printState(`${name} turn ${tw.info.turns}`)
      if (!guard.ok) {
        if (tries.fail(`guard: ${guard.violations.join('; ')}`)) return { ok: false as const, reason: `test fixes: ${tries.limit} failed tries (guard)` }
        prompt = guardFeedback(guard, tries)
        continue
      }
      if (!outcome.ok) {
        if (tries.fail(`result ${outcome.kind}`)) return { ok: false as const, reason: `test fixes: ${tries.limit} failed tries (bad result)` }
        prompt = resultFeedback(outcome, tries)
        continue
      }
      noteOutput(name, outcome.output)
      const hits = await scan(wt, t, `after ${name}`)
      if (hits.length) {
        if (tries.fail(`leftovers`)) return { ok: false as const, reason: `test fixes: ${tries.limit} failed tries (leftovers)` }
        prompt = leftoverFeedback(hits, tries)
        continue
      }
      if (outcome.output.criteria.length) ts.mapping = outcome.output.criteria
      return { ok: true as const, wontFix: outcome.output.wont_fix }
    }
  } finally {
    await closeAgent(tw, t.number)
  }
}

const reviewLoop = async (wt: RunWorktree, t: Ticket, impl: AgentSession<ImplementerResult>): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const ts = ticketState(t.number)
  let base = wt.baseSha
  let earlier: { finding: Finding; response: string }[] = []
  for (let round = 1; round <= LIMITS.reviewRounds; round++) {
    ts.review_rounds = round
    const head = (await gitOk(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
    const diff = (await gitOk(wt.path, ['diff', `${base}..${head}`])).stdout
    const name = `ticket-reviewer#${t.number}.${round}`
    const rv = await startAgent(reviewerSpec({ name, ticket: `#${t.number}`, cwd: wt.path, model, mainGitDir: wt.commonGitDir }), ctx)
    printState(`started ${name}`)
    let outcome: TurnOutcome<ReviewResult>
    let guard: Backstop
    try {
      const before = await snapshot(wt)
      outcome = await rv.turn(reviewPrompt(wt, t, round, base, head, diff, earlier), 30 * 60_000)
      guard = await backstop(wt, 'ticket-reviewer', name, before)
    } finally {
      await closeAgent(rv, t.number)
    }
    printState(`review #${t.number} round ${round}`)
    if (!guard.ok || !outcome.ok) {
      const why = !guard.ok ? `reviewer guard violation (${guard.violations.join(', ')})` : `reviewer bad result (${outcome.ok ? '' : outcome.kind})`
      journal.write('review_failed_try', { ticket: t.number, round, why })
      if (round === LIMITS.reviewRounds) return { ok: false, reason: `review: ${why} in the last round` }
      continue
    }
    const r = outcome.output
    journal.write('review', { ticket: t.number, round, base, head, ...r })
    for (const f of r.findings.filter((x) => x.severity === 'nit')) state.nits.push({ ...f, round })
    const rulings = new Map(r.earlier_findings.map((e) => [e.id, e]))
    const stillOpen: Finding[] = []
    for (const e of earlier) {
      const ruling = rulings.get(e.finding.id)
      if (ruling?.status === 'declined_accepted')
        state.declined.push({ id: e.finding.id, title: e.finding.title, reason: e.response, ruling: ruling.note })
      else if (ruling?.status !== 'resolved') stillOpen.push(e.finding)
    }
    const open = [...r.findings.filter((x) => x.severity !== 'nit'), ...stillOpen]
    ts.open_findings = open
    if (open.length === 0) {
      state.review = { ticket: t.number, approved_in_round: round, criteria: r.criteria }
      return { ok: true }
    }
    if (round === LIMITS.reviewRounds)
      return { ok: false, reason: `${LIMITS.reviewRounds} review rounds with findings still open: ${open.map((f) => f.id).join(', ')}` }

    // Fix round: test findings to a fresh test-writer first, then code findings to the same implementer.
    const responses = new Map<string, string>()
    const testF = open.filter((f) => f.kind === 'test')
    const codeF = open.filter((f) => f.kind === 'code')
    if (testF.length) {
      const tf = await testFixPhase(wt, t, testF)
      if (!tf.ok) return { ok: false, reason: tf.reason }
      for (const w of tf.wontFix) responses.set(w.finding_id, `won't fix: ${w.reason}`)
    }
    let prompt = findingsPrompt(round, codeF, testF)
    let needImpl = codeF.length > 0
    if (!needImpl) {
      const label = `gates-${++gateCount}`
      const gates = await runGates(wt.path, junitPath(wt, label))
      recordGates(label, gates)
      printState(`gates after test fixes #${t.number}`)
      if (!gates.ok) {
        needImpl = true
        prompt = `A test-writer changed tests for review findings ${testF.map((f) => f.id).join(', ')}. The gates fail now. Fix the code so every gate passes.\n\n${gates.report}`
      }
    }
    if (needImpl) {
      const tries = createTries(`implementer #${t.number} review round ${round}`, LIMITS.gateRuns)
      const g = await implementUntilGreen(wt, t, impl, prompt, tries)
      if (g.kind === 'stuck') return { ok: false, reason: g.reason }
      if (g.kind === 'bad_test') return { ok: false, reason: `the implementer answered "bad test" during review fixes: ${g.output.bad_test?.reason ?? ''}` }
      for (const w of g.output.wont_fix) responses.set(w.finding_id, `won't fix: ${w.reason}`)
    }
    await commitIfChanges(
      wt,
      t,
      `fix(tracer-sandbox): address review round ${round} (#${t.number})`,
      `Findings: ${open.map((f) => f.id).join(', ')}.`,
    )
    earlier = open.map((f) => ({ finding: f, response: responses.get(f.id) ?? 'fixed (per the fixer)' }))
    base = head
  }
  return { ok: false, reason: 'review loop ended without a verdict' }
}

// ---------- one ticket ----------

const buildTicket = async (wt: RunWorktree, t: Ticket, baseline: TestRun) => {
  const ts = ticketState(t.number)
  ts.status = 'building'
  const stuck = (reason: string) => {
    ts.status = 'stuck'
    ts.stuck_reason = reason
    state.stuck = { ticket: t.number, reason }
    journal.write('stuck', { ticket: t.number, reason })
    console.error(`\n### STUCK: ticket #${t.number}: ${reason}\n`)
    printState(`stuck #${t.number}`)
  }
  printState(`building #${t.number}`)

  const red = await redPhase(wt, t, baseline, null)
  if (!red.ok) return stuck(red.reason)
  ts.mapping = red.mapping

  const impl = await startAgent(
    implementerSpec({
      name: `implementer#${t.number}`,
      ticket: `#${t.number}`,
      cwd: wt.path,
      model,
      mainGitDir: wt.commonGitDir,
      testDenyGlob: `${wt.path}/${TEST_GLOB}`,
    }),
    ctx,
  )
  printState(`started ${impl.name}`)
  try {
    const tries = createTries(`implementer #${t.number}`, LIMITS.gateRuns)
    let prompt = implementerPrompt(wt, t, red)
    while (true) {
      const g = await implementUntilGreen(wt, t, impl, prompt, tries)
      if (g.kind === 'stuck') return stuck(g.reason)
      if (g.kind === 'green') break
      if (ts.bad_test_bounces >= LIMITS.badTestBounces) return stuck(`a second "bad test" from the implementer: ${g.output.bad_test?.reason ?? ''}`)
      ts.bad_test_bounces++
      const aside = await setAside(wt)
      const red2 = await redPhase(wt, t, baseline, g.output.bad_test)
      if (!red2.ok) return stuck(`after a "bad test" bounce: ${red2.reason}`)
      await restore(wt, aside)
      ts.mapping = red2.mapping
      tries.reset()
      prompt = [
        `The engine sent your "bad test" report to a fresh test-writer. Its new tests are committed (${red2.commit.sha.slice(0, 12)}).`,
        'Your earlier code changes are back in the worktree. Carry on: make every gate pass. Your fix-loop count is reset.',
        '',
        '## Failing tests now',
        mappingBlock(t, red2.mapping),
        '',
        outputText(red2.run),
      ].join('\n')
    }
    const green = await commitIfChanges(
      wt,
      t,
      `feat(tracer-sandbox): ${lowerFirst(t.title)} (#${t.number}, green)`,
      `Implementation by ${impl.name}. Gates passed: bun test; bunx --bun tsc --noEmit.`,
    )
    if (!green) return stuck('gates passed but there was nothing to commit')

    const rev = await reviewLoop(wt, t, impl)
    if (!rev.ok) return stuck(rev.reason)
    ts.status = 'done'
    ts.open_findings = []
    printState(`ticket #${t.number} done`)
  } finally {
    await closeAgent(impl, t.number)
  }
}

// ---------- usage, PR, finish ----------

const countMessages = () => {
  const counts: Record<string, number> = {}
  for (const line of readFileSync(journal.file, 'utf8').split('\n')) {
    if (!line.includes('"kind":"agent_message')) continue
    const kind = (JSON.parse(line) as { kind: string }).kind
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}

const usageSummary = (start: unknown, end: unknown) => {
  const u = (x: unknown) => (x as { usage?: Record<string, Window> } | null)?.usage ?? {}
  const pct = (w: Window | undefined) => w?.utilization ?? null
  const perTicket: Record<string, { agents: number; tokens: Tokens; cost_usd_estimate: number }> = {}
  for (const a of state.agents) {
    const k = `#${a.ticket}`
    const cur = perTicket[k] ?? { agents: 0, tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, cost_usd_estimate: 0 }
    cur.agents++
    cur.tokens = {
      input: cur.tokens.input + a.tokens.input,
      output: cur.tokens.output + a.tokens.output,
      cache_read: cur.tokens.cache_read + a.tokens.cache_read,
      cache_creation: cur.tokens.cache_creation + a.tokens.cache_creation,
    }
    cur.cost_usd_estimate += a.cost_usd_estimate
    perTicket[k] = cur
  }
  return {
    note: 'Plan utilization is whole percent from the usage endpoint; rate_limit_event unifiedWindows are fractions. cost_usd is the SDK estimate at list price, not a bill.',
    run: {
      five_hour: { start: pct(u(start).five_hour), end: pct(u(end).five_hour) },
      seven_day: { start: pct(u(start).seven_day), end: pct(u(end).seven_day) },
      seven_day_opus: { start: pct(u(start).seven_day_opus), end: pct(u(end).seven_day_opus) },
    },
    per_ticket: perTicket,
    per_agent: state.agents.map((a) => ({
      name: a.name,
      role: a.role,
      duration_s: Math.round(a.duration_ms / 1000),
      model_turns: a.model_turns,
      tokens: a.tokens,
      cost_usd_estimate: Number(a.cost_usd_estimate.toFixed(4)),
      five_hour: [a.usage_before?.five_hour?.utilization ?? null, a.usage_after?.five_hour?.utilization ?? null],
      seven_day: [a.usage_before?.seven_day?.utilization ?? null, a.usage_after?.seven_day?.utilization ?? null],
      rate_limit_first: (a.rate_limit_first as { unifiedWindows?: unknown } | null)?.unifiedWindows ?? null,
      rate_limit_last: (a.rate_limit_last as { unifiedWindows?: unknown } | null)?.unifiedWindows ?? null,
    })),
  }
}

const prBody = (t: Ticket, usage: ReturnType<typeof usageSummary>) => {
  const journalUrl = `https://github.com/${REPO_SLUG}/blob/prototype/tracer-bullet/prototypes/tracer-bullet/runs/PROTOTYPE-wipe-me-${runId}.jsonl`
  const list = (items: string[], empty = 'None.') => (items.length ? items.map((i) => `- ${i}`).join('\n') : empty)
  return [
    `> **PROTOTYPE, throwaway.** Draft PR opened by the Luca v1 tracer bullet (#334). Never merge it; it gets closed.`,
    '',
    `Builds ticket #${t.number} of spec #${specIssue.number}. (No closing keyword, on purpose.)`,
    '',
    '## What changed',
    state.implementer_summary || '(no summary)',
    '',
    '## Commits (made by the engine)',
    list(state.commits.map((c) => `${c.sha.slice(0, 12)} ${c.subject}`)),
    '',
    '## Ticket review',
    state.review
      ? `Approved in round ${state.review.approved_in_round} of ${LIMITS.reviewRounds} (a fresh, read-only reviewer each round).\n\n${state.review.criteria.map((c) => `- ${c.criterion_id}: ${c.met ? 'met' : 'NOT met'}. ${c.evidence}`).join('\n')}`
      : '(no review result)',
    '',
    '### Nits (left as is)',
    list(state.nits.map((n) => `${n.id} ${n.file ?? ''}: ${n.title}. ${n.detail}`)),
    '',
    '### Declined findings',
    list(state.declined.map((d) => `${d.id} ${d.title}: declined, because ${d.reason}. Reviewer: ${d.ruling}`)),
    '',
    '## Assumptions',
    list(state.assumptions.map((a) => `(${a.agent}) ${a.text}`)),
    '',
    '## Run notes',
    list(state.run_notes.map((n) => `(${n.agent}) ${n.text}`)),
    '',
    `## Plan usage (every role on ${model})`,
    `Five-hour window: ${usage.run.five_hour.start}% → ${usage.run.five_hour.end}%. Weekly: ${usage.run.seven_day.start}% → ${usage.run.seven_day.end}%.`,
    '',
    '| agent | model turns | tokens in / out / cache read / cache write | est. cost (list price) | 5h % before → after |',
    '|---|---|---|---|---|',
    ...usage.per_agent.map(
      (a) =>
        `| ${a.name} | ${a.model_turns} | ${a.tokens.input} / ${a.tokens.output} / ${a.tokens.cache_read} / ${a.tokens.cache_creation} | $${a.cost_usd_estimate} | ${a.five_hour[0]} → ${a.five_hour[1]} |`,
    ),
    '',
    `Journal: [PROTOTYPE-wipe-me-${runId}.jsonl](${journalUrl}) on branch \`prototype/tracer-bullet\`.`,
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n')
}

const openPr = async (wt: RunWorktree, t: Ticket, usage: ReturnType<typeof usageSummary>) => {
  await runOk(['git', 'push', '-u', 'origin', wt.branch], { cwd: wt.path, timeoutMs: 180_000 })
  printState('pushed the run branch')
  const body = prBody(t, usage)
  const bodyFile = join(wt.runDir, 'pr-body.md')
  writeFileSync(bodyFile, body)
  const title = `[tracer bullet, do not merge] ${t.title} (#${t.number})`
  const r = await gh(['pr', 'create', '--repo', REPO_SLUG, '--draft', '--base', 'main', '--head', wt.branch, '--title', title, '--body-file', bodyFile])
  const url = r.stdout.trim().split('\n').pop() ?? ''
  state.pr = { url, branch: wt.branch }
  journal.write('pr', { url, branch: wt.branch, title, body })
  printState('opened the draft PR')
}

const finish = async (wt: RunWorktree | null, startUsage: unknown) => {
  const end = await preflight(ctx, PROTO_DIR).catch((err: unknown) => ({ error: String(err) }))
  state.usage = usageSummary(startUsage, end)
  state.messages = countMessages()
  printState('final')
  if (wt && !flags['keep-worktree']) {
    const pushed = !!state.pr
    const cleanup = await removeRunWorktree(wt, true)
    journal.write('cleanup', { pushed, results: cleanup.map((c) => ({ cmd: c.cmd, exit: c.exitCode, out: c.stdout + c.stderr })) })
  }
  const secrets = secretScan(journal.file)
  journal.write('secret_scan', { hits: secrets })
  console.log(`\nJournal: ${journal.file}${secrets.length ? `\nWARNING: secret scan hits: ${secrets.join(', ')}` : ''}`)
}

// ---------- main ----------

const main = async (): Promise<number> => {
  journal.write('run_start', { run_type: 'spine', mode, model, spec: specNumber, open_pr: !!flags['open-pr'], argv: process.argv.slice(2) })
  console.log(`PROTOTYPE tracer run ${runId} (mode ${mode}, every role on ${model})\njournal: ${journal.file}`)

  const pre = await preflight(ctx, PROTO_DIR)
  state.preflight = pre
  printState('preflight')
  if (pre.problems.length) {
    console.error(`Refusing to run: ${pre.problems.join('; ')}`)
    return 2
  }

  const intake = await runIntake(specNumber)
  journal.write('intake_snapshot', { spec: intake.spec, tickets: intake.tickets, closed_tickets: intake.closedTickets })
  journal.write('intake', { ok: intake.ok, nothing_to_do: intake.nothingToDo, problems: intake.problems })
  state.intake = { ok: intake.ok, problems: intake.problems, tickets: intake.tickets.map((t) => t.number) }
  specIssue = { number: intake.spec.number, title: intake.spec.title, body: intake.spec.body }
  printState('intake')
  if (intake.nothingToDo) {
    console.log('Nothing to do: the spec has no open tickets.')
    return 0
  }
  if (!intake.ok) {
    console.error(`Intake refused the run:\n${intake.problems.map((p) => `- ${p}`).join('\n')}`)
    return 2
  }
  state.tickets = intake.tickets.map((t) => ({
    number: t.number,
    title: t.title,
    status: 'pending' as const,
    criteria: t.criteria,
    red_rounds: 0,
    gate_runs: 0,
    review_rounds: 0,
    bad_test_bounces: 0,
    mapping: null,
    commits: [],
    open_findings: [],
    stuck_reason: null,
  }))

  const wt = await createRunWorktree(runId, `luca/tracer-${runId}`)
  state.worktree = wt
  journal.write('worktree', { ...wt })
  try {
    const install = await runOk(['bun', 'install', '--frozen-lockfile'], { cwd: wt.path, timeoutMs: 300_000 })
    journal.write('install', { stdout: install.stdout, stderr: install.stderr })
    claudeMd = existsSync(join(wt.path, 'CLAUDE.md')) ? readFileSync(join(wt.path, 'CLAUDE.md'), 'utf8') : ''
    printState('worktree')

    const base = await runGates(wt.path, junitPath(wt, 'baseline'))
    recordGates('baseline', base)
    state.baseline = { tests: base.tests.cases.length, test_files: base.tests.testFiles.length, types_ok: base.types.exitCode === 0 }
    printState('baseline gates')
    if (!base.ok) {
      console.error(`Refusing: the base is not green.\n${base.report}`)
      return 2
    }

    for (const t of intake.tickets) {
      await buildTicket(wt, t, base.tests)
      if (state.stuck) break
    }
    const allDone = state.tickets.every((t) => t.status === 'done')
    if (allDone && flags['open-pr']) {
      const first = intake.tickets[0]
      const now = await preflight(ctx, PROTO_DIR)
      if (first) await openPr(wt, first, usageSummary(pre, now))
    } else if (allDone) {
      const first = intake.tickets[0]
      if (first) {
        const body = prBody(first, usageSummary(pre, await preflight(ctx, PROTO_DIR)))
        writeFileSync(join(wt.runDir, 'pr-body-preview.md'), body)
        journal.write('pr_preview', { body })
        console.log(`\n----- PR body preview (not opened) -----\n${body}\n-----`)
      }
      console.log('\nAll tickets done. No --open-pr flag, so no push and no PR (debug run).')
    }
    return state.stuck ? 4 : 0
  } finally {
    await finish(wt, pre)
  }
}

main()
  .then((code) => process.exit(ctx.stoppedReason() ? 3 : code))
  .catch((err: unknown) => {
    if (isRunStopped(err)) {
      state.stopped = ctx.stoppedReason()
      printState('RUN STOPPED')
      console.error(String(err))
      process.exit(3)
    }
    journal.write('fatal', { error: err })
    console.error(err)
    printState('fatal error')
    process.exit(1)
  })
