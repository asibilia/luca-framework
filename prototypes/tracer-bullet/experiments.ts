/**
 * PROTOTYPE (tracer bullet, #334). Guard, MCP, messaging, and bad-result probes.
 * Each probe is a small Haiku session told to run one command and report. The engine checks
 * the side effects itself. Throwaway.
 *
 *   bun prototypes/tracer-bullet/experiments.ts [--only id1,id2] [--preflight-only]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { createEngineCtx, isRunStopped, preflight, startAgent, type AgentSession, type EngineCtx } from './lib/agent'
import { LOCAL_SERVICES, makeRunId, MODELS, RUNS_DIR } from './lib/config'
import { createRunWorktree, git, removeRunWorktree, type RunWorktree } from './lib/git'
import { createJournal } from './lib/journal'
import { PROBE_INSTRUCTIONS, ProbeResult, sandboxFor } from './lib/roles'
import { run } from './lib/shell'

const { values: flags } = parseArgs({
  options: { only: { type: 'string' }, 'preflight-only': { type: 'boolean' }, keep: { type: 'boolean' } },
})

const runId = makeRunId('exp')
const journal = createJournal(join(RUNS_DIR, `PROTOTYPE-wipe-me-${runId}.jsonl`), runId)
const ctx = createEngineCtx(journal)
const model = MODELS.haiku

type Probe = {
  id: string
  question: string
  commands: string[]
  allowed: string[]
  sandbox: (wt: RunWorktree) => SandboxSettings
  strictMcp?: boolean
  messaging?: boolean
  schema?: z.ZodType
  prompt?: string
  setup?: (wt: RunWorktree) => Promise<Record<string, unknown>>
  check: (wt: RunWorktree, s: AgentSession<unknown>, before: Record<string, unknown>) => Promise<Record<string, unknown>>
  duringTurn?: (s: AgentSession<unknown>) => Promise<void>
}

const head = async (wt: RunWorktree) => (await git(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
const bashCalls = (s: AgentSession<unknown>) =>
  s.info.toolCalls
    .filter((c) => c.name === 'Bash')
    .map((c) => ({ command: (c.input as { command?: string }).command, result: c.result, is_error: c.isError }))
const writeFile = (wt: RunWorktree, rel: string, text: string) => {
  mkdirSync(dirname(join(wt.path, rel)), { recursive: true })
  writeFileSync(join(wt.path, rel), text)
}
const readIf = (wt: RunWorktree, rel: string) => (existsSync(join(wt.path, rel)) ? readFileSync(join(wt.path, rel), 'utf8') : null)
const httpCode = (s: AgentSession<unknown>) => {
  const out = bashCalls(s).map((c) => c.result ?? '').join('\n')
  const m = /\b(\d{3})\b/.exec(out)
  return { raw: out.slice(0, 600), http_code: m ? m[1] : null }
}

const gitDeny = (wt: RunWorktree) => sandboxFor({ mainGitDir: wt.commonGitDir })

const curlProbe = (id: string, target: keyof typeof LOCAL_SERVICES, direct: boolean, localBinding: boolean): Probe => ({
  id,
  question: `1d: can a sandboxed command reach ${target} (${LOCAL_SERVICES[target]}) ${direct ? 'directly (--noproxy)' : 'through the sandbox proxy'} with allowLocalBinding=${localBinding}?`,
  commands: [
    `curl -s -m 5 ${direct ? '--noproxy "*" ' : ''}-o /dev/null -w "%{http_code}" ${LOCAL_SERVICES[target]}`,
  ],
  allowed: ['Bash(curl *)'],
  sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, allowLocalBinding: localBinding }),
  check: async (_wt, s) => {
    const r = httpCode(s)
    const baseline = target === 'muninn' ? '401' : '404'
    return { ...r, baseline_outside_sandbox: baseline, reached: r.http_code === baseline }
  },
})

const probes: Probe[] = [
  {
    id: '1a-status',
    question: '1a: with denyWrite on the main repo .git, does `git status` still work?',
    commands: ['git status --porcelain=v1 --branch'],
    allowed: ['Bash(git status *)'],
    sandbox: gitDeny,
    check: async (_wt, s) => {
      const c = bashCalls(s)[0]
      return { works: !!c && !c.is_error && /##/.test(c.result ?? ''), bash: bashCalls(s) }
    },
  },
  {
    id: '1a-commit',
    question: '1a: with denyWrite on the main repo .git, does `git commit` fail?',
    commands: ['git commit --allow-empty -m tracer-probe-commit'],
    allowed: ['Bash(git commit *)'],
    sandbox: gitDeny,
    setup: async (wt) => ({ head: await head(wt) }),
    check: async (wt, _s, before) => {
      const after = await head(wt)
      return { head_before: before.head, head_after: after, blocked: before.head === after }
    },
  },
  {
    id: '1a-stash',
    question: '1a: with denyWrite on the main repo .git, does `git stash` fail?',
    commands: [`git stash push --include-untracked -m tracer-probe-stash-${runId}`],
    allowed: ['Bash(git stash *)'],
    sandbox: gitDeny,
    setup: async (wt) => {
      writeFile(wt, 'probe-stash.txt', 'stash me')
      return {}
    },
    check: async (wt) => {
      const list = (await git(wt.path, ['stash', 'list', '--format=%gd %gs'])).stdout
      const line = list.split('\n').find((l) => l.includes(`tracer-probe-stash-${runId}`))
      const cleanup = line ? await git(wt.path, ['stash', 'drop', line.split(' ')[0] ?? '']) : null
      return {
        stash_created: !!line,
        file_still_present: existsSync(join(wt.path, 'probe-stash.txt')),
        blocked: !line,
        cleanup: cleanup ? cleanup.stdout + cleanup.stderr : null,
      }
    },
  },
  {
    id: '1a-branch',
    question: '1a: with denyWrite on the main repo .git, does `git branch x` fail?',
    commands: [`git branch tracer-probe-branch-${runId}`],
    allowed: ['Bash(git branch *)'],
    sandbox: gitDeny,
    check: async (wt) => {
      const exists = (await git(wt.path, ['rev-parse', '--verify', '--quiet', `refs/heads/tracer-probe-branch-${runId}`])).exitCode === 0
      if (exists) await git(wt.path, ['branch', '-D', `tracer-probe-branch-${runId}`])
      return { branch_created: exists, blocked: !exists }
    },
  },
  {
    id: '1a-control-commit',
    question: '1a control: WITHOUT the .git denyWrite, does `git commit` succeed in a worktree (the sandbox worktree exception)?',
    commands: ['git commit --allow-empty -m tracer-probe-control'],
    allowed: ['Bash(git commit *)'],
    sandbox: () => sandboxFor({ mainGitDir: null }),
    setup: async (wt) => ({ head: await head(wt) }),
    check: async (wt, _s, before) => {
      const after = await head(wt)
      return { head_before: before.head, head_after: after, committed: before.head !== after }
    },
  },
  {
    id: '1b-autoallow-on',
    question: '1b: under dontAsk with autoAllowBashIfSandboxed=true and NO allow rule, does an arbitrary command run?',
    commands: [`python3 -c "open('autoallow-on.txt','w').write('x'); print(6*7)"`],
    allowed: [],
    sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, autoAllow: true }),
    check: async (wt, s) => ({
      ran: existsSync(join(wt.path, 'autoallow-on.txt')),
      permission_denials: s.info.permissionDenials,
      bash: bashCalls(s),
    }),
  },
  {
    id: '1b-autoallow-off',
    question: '1b: the same command with autoAllowBashIfSandboxed=false and no allow rule: is it denied?',
    commands: [`python3 -c "open('autoallow-off.txt','w').write('x'); print(6*7)"`],
    allowed: [],
    sandbox: gitDeny,
    check: async (wt, s) => ({
      ran: existsSync(join(wt.path, 'autoallow-off.txt')),
      permission_denials: s.info.permissionDenials,
      bash: bashCalls(s),
    }),
  },
  {
    id: '1c-glob-rel-new',
    question: '1c: does sandbox denyWrite ["**/*.test.ts"] (relative glob) stop `bun -e` creating a new test file?',
    commands: [`bun -e "await Bun.write('probe/rel-new.test.ts', 'x')"`],
    allowed: ['Bash(bun -e *)'],
    sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, extraDenyWrite: ['**/*.test.ts'] }),
    check: async (wt, s) => ({ created: existsSync(join(wt.path, 'probe/rel-new.test.ts')), bash: bashCalls(s) }),
  },
  {
    id: '1c-glob-rel-existing',
    question: '1c: does denyWrite ["**/*.test.ts"] (relative) stop `bun -e` overwriting an existing test file?',
    commands: [`bun -e "await Bun.write('probe/existing-rel.test.ts', 'changed')"`],
    allowed: ['Bash(bun -e *)'],
    sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, extraDenyWrite: ['**/*.test.ts'] }),
    setup: async (wt) => {
      writeFile(wt, 'probe/existing-rel.test.ts', 'original')
      return {}
    },
    check: async (wt, s) => {
      const content = readIf(wt, 'probe/existing-rel.test.ts')
      return { content, overwritten: content !== 'original', bash: bashCalls(s) }
    },
  },
  {
    id: '1c-glob-abs-new',
    question: '1c: does denyWrite ["<worktree>/**/*.test.ts"] (absolute glob) stop `bun -e` creating a new test file?',
    commands: [`bun -e "await Bun.write('probe/abs-new.test.ts', 'x')"`],
    allowed: ['Bash(bun -e *)'],
    sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, extraDenyWrite: [`${wt.path}/**/*.test.ts`] }),
    check: async (wt, s) => ({ created: existsSync(join(wt.path, 'probe/abs-new.test.ts')), bash: bashCalls(s) }),
  },
  {
    id: '1c-glob-abs-existing',
    question: '1c: does denyWrite ["<worktree>/**/*.test.ts"] (absolute) stop `bun -e` overwriting an existing test file?',
    commands: [`bun -e "await Bun.write('probe/existing-abs.test.ts', 'changed')"`],
    allowed: ['Bash(bun -e *)'],
    sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, extraDenyWrite: [`${wt.path}/**/*.test.ts`] }),
    setup: async (wt) => {
      writeFile(wt, 'probe/existing-abs.test.ts', 'original')
      return {}
    },
    check: async (wt, s) => {
      const content = readIf(wt, 'probe/existing-abs.test.ts')
      return { content, overwritten: content !== 'original', bash: bashCalls(s) }
    },
  },
  {
    id: '1c-glob-control',
    question: '1c control: with the absolute test-file deny, can `bun -e` still write a NON-test file?',
    commands: [`bun -e "await Bun.write('probe/not-a-test.ts', 'x')"`],
    allowed: ['Bash(bun -e *)'],
    sandbox: (wt) => sandboxFor({ mainGitDir: wt.commonGitDir, extraDenyWrite: [`${wt.path}/**/*.test.ts`] }),
    check: async (wt, s) => ({ created: existsSync(join(wt.path, 'probe/not-a-test.ts')), bash: bashCalls(s) }),
  },
  curlProbe('1d-muninn-proxy', 'muninn', false, false),
  curlProbe('1d-paseo-proxy', 'paseo', false, false),
  curlProbe('1d-muninn-direct', 'muninn', true, false),
  curlProbe('1d-paseo-direct', 'paseo', true, false),
  curlProbe('1d-muninn-direct-localbinding', 'muninn', true, true),
  curlProbe('1d-paseo-direct-localbinding', 'paseo', true, true),
  {
    id: '2-control-no-strict',
    question: '2 control: with strictMcpConfig=false (settingSources=[] still), do the user MCP servers such as muninn load?',
    commands: ['echo strict-mcp-control'],
    allowed: ['Bash(echo *)'],
    sandbox: gitDeny,
    strictMcp: false,
    check: async (_wt, s) => {
      const init = s.info.init as { tools?: string[]; mcp_servers?: { name: string; status: string }[] } | null
      const mcpTools = (init?.tools ?? []).filter((t) => t.startsWith('mcp__'))
      return {
        mcp_servers: init?.mcp_servers ?? [],
        mcp_tool_count: mcpTools.length,
        muninn_tools: mcpTools.filter((t) => t.startsWith('mcp__muninn__')).length,
      }
    },
  },
  {
    id: '4-message',
    question: '4: can the engine hand a message to a busy agent at its next tool call (PostToolUse additionalContext)?',
    commands: ['echo step-1', 'sleep 4', 'echo step-3'],
    allowed: ['Bash(echo *)', 'Bash(sleep *)'],
    sandbox: gitDeny,
    messaging: true,
    duringTurn: async (s) => {
      for (let i = 0; i < 600 && s.info.toolCalls.length === 0; i++) await Bun.sleep(100)
      const r = ctx.bus.send('engine', s.name, 'Add the word PINEAPPLE to your run notes.')
      journal.write('experiment_note', { id: '4-message', queued_after_tool_calls: s.info.toolCalls.length, send: r })
    },
    check: async (_wt, s) => ({ tool_calls: s.info.toolCalls.map((c) => c.name) }),
  },
  {
    id: '5-bad-result',
    question: '5: how does the SDK report a result that can never match its schema, and does the engine count it as one failed try?',
    commands: [],
    allowed: [],
    sandbox: gitDeny,
    schema: z.object({ x: z.string().min(5).max(2) }),
    prompt:
      'Do not run any command. Return your structured result now: set the field "x" to a short string. (This is an engine test of schema handling.)',
    check: async () => ({}),
  },
]

const main = async () => {
  journal.write('run_start', { kind: 'experiments', model, argv: process.argv.slice(2) })
  console.log(`PROTOTYPE experiments run ${runId}\njournal: ${journal.file}`)
  const pre = await preflight(ctx, dirname(journal.file))
  console.log('preflight:', JSON.stringify(pre, null, 2))
  if (pre.problems.length) {
    console.error('Refusing to run:', pre.problems.join('; '))
    process.exit(2)
  }
  if (flags['preflight-only']) return

  const wt = await createRunWorktree(runId, `luca/tracer-probe-${runId}`)
  journal.write('worktree', { ...wt })
  const only = flags.only ? flags.only.split(',') : null
  const results: Record<string, unknown>[] = []
  try {
    for (const p of probes) {
      if (only && !only.includes(p.id)) continue
      if (ctx.stoppedReason()) break
      console.log(`\n=== probe ${p.id}: ${p.question}`)
      const before = p.setup ? await p.setup(wt) : {}
      const schema = p.schema ?? ProbeResult
      const session = await startAgent(
        {
          name: `probe:${p.id}`,
          role: 'probe',
          ticket: 'experiments',
          cwd: wt.path,
          model,
          instructions: PROBE_INSTRUCTIONS,
          schema,
          tools: ['Bash'],
          allowedTools: p.allowed,
          disallowedTools: [],
          sandbox: p.sandbox(wt),
          messaging: p.messaging ?? false,
          maxTurns: 12,
          strictMcp: p.strictMcp,
        },
        ctx,
      )
      const prompt =
        p.prompt ??
        [
          p.commands.length === 1
            ? `Run exactly this one shell command with the Bash tool, once, exactly as written:\n\n${p.commands[0]}`
            : `Run these shell commands with the Bash tool, one at a time, in order, each as its own Bash call, waiting for each to finish:\n\n${p.commands.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
          '',
          'Then return your structured result: the command, whether it ran, its exit code (null if unknown), the exact output, notes, and run_notes (empty unless told otherwise).',
        ].join('\n')
      const turnP = session.turn(prompt, 10 * 60_000)
      if (p.duringTurn) await p.duringTurn(session)
      const outcome = await turnP
      // The same accounting the spine uses: one SDK result that fails its schema = one failed try.
      const failedTries = outcome.ok ? 0 : 1
      const check = await p.check(wt, session, before)
      await session.close()
      const record = {
        id: p.id,
        question: p.question,
        commands: p.commands,
        allowed: p.allowed,
        sandbox: p.sandbox(wt),
        strict_mcp: p.strictMcp ?? true,
        outcome_ok: outcome.ok,
        outcome_kind: outcome.ok ? 'ok' : outcome.kind,
        outcome_detail: outcome.ok ? null : outcome.detail,
        result_subtype: outcome.result?.subtype ?? null,
        num_turns: outcome.result?.num_turns ?? null,
        engine_failed_tries: failedTries,
        agent_report: outcome.ok ? outcome.output : null,
        bash_calls: bashCalls(session),
        permission_denials: session.info.permissionDenials,
        init_mcp_servers: (session.info.init as { mcp_servers?: unknown } | null)?.mcp_servers ?? null,
        init_mcp_tools: ((session.info.init as { tools?: string[] } | null)?.tools ?? []).filter((t) => t.startsWith('mcp__')),
        context: session.info.context,
        claude_code_version: session.info.claudeCodeVersion,
        engine_check: check,
        cost_usd: session.info.costUsd,
        model_usage: session.info.modelUsage,
      }
      results.push(record)
      journal.write('experiment_result', record)
      console.log(JSON.stringify(record, null, 2))
    }
  } catch (err) {
    if (!isRunStopped(err)) throw err
    console.error(String(err))
  } finally {
    const summary = results.map((r) => ({ id: r.id, ok: r.outcome_ok, check: r.engine_check }))
    journal.write('experiments_summary', { results: summary, stopped: ctx.stoppedReason(), rate_limits: ctx.rateLimits })
    if (!flags.keep) {
      const cleanup = await removeRunWorktree(wt, true)
      journal.write('cleanup', { results: cleanup.map((c) => ({ cmd: c.cmd, exit: c.exitCode, out: c.stdout + c.stderr })) })
    }
    console.log(`\nDone. ${results.length} probes. Journal: ${journal.file}`)
    const leftovers = await run(['git', 'stash', 'list', '--format=%gd %gs'], { cwd: dirname(journal.file) })
    if (leftovers.stdout.includes(runId)) console.error('WARNING: a probe stash entry is still present:', leftovers.stdout)
  }
}

const reportCtx = (c: EngineCtx) => ({ stopped: c.stoppedReason(), rateLimits: c.rateLimits.length })

main()
  .then(() => {
    console.log(reportCtx(ctx))
    process.exit(ctx.stoppedReason() ? 3 : 0)
  })
  .catch((err: unknown) => {
    journal.write('fatal', { error: err })
    console.error(err)
    process.exit(1)
  })
