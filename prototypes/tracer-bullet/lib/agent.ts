/**
 * PROTOTYPE (tracer bullet, #334). Launch one agent with the Claude Agent SDK's query(),
 * in streaming-input mode, with every guard option set. Journals every SDK message.
 */
import { realpathSync } from 'node:fs'

import {
  createSdkMcpServer,
  query,
  tool,
  type HookCallback,
  type HookJSONOutput,
  type Options,
  type SandboxSettings,
  type SDKMessage,
  type SDKRateLimitInfo,
  type SDKResultMessage,
  type SDKResultSuccess,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import type { RoleName } from './checks'
import { assertClaudeModel, EFFORT, LIMITS } from './config'
import type { Journal } from './journal'
import { cleanEnv } from './shell'

// ---------- run stop (rate limits, billing, credential or MCP leaks) ----------

export type RunStoppedError = Error & { runStopped: true }
export const runStopped = (reason: string): RunStoppedError =>
  Object.assign(new Error(`RUN STOPPED: ${reason}`), { runStopped: true as const })
export const isRunStopped = (e: unknown): e is RunStoppedError =>
  e instanceof Error && (e as Partial<RunStoppedError>).runStopped === true

// ---------- engine context ----------

export type RateLimitRecord = { at: string; agent: string; info: SDKRateLimitInfo }

export type EngineCtx = {
  journal: Journal
  bus: MessageBus
  rateLimits: RateLimitRecord[]
  stop: (reason: string) => void
  stoppedReason: () => string | null
  live: Set<{ close: () => void }>
}

export const createEngineCtx = (journal: Journal): EngineCtx => {
  let reason: string | null = null
  const live = new Set<{ close: () => void }>()
  const ctx: EngineCtx = {
    journal,
    bus: createMessageBus(journal),
    rateLimits: [],
    live,
    stoppedReason: () => reason,
    stop: (r: string) => {
      if (reason) return
      reason = r
      journal.write('run_stop', { reason: r })
      console.error(`\n!!! RUN STOPPED: ${r}\n`)
      for (const s of live) s.close()
    },
  }
  return ctx
}

// ---------- agent messages (#338) ----------

export type AgentMessage = { id: string; from: string; to: string; text: string; queuedAt: string }

export type MessageBus = ReturnType<typeof createMessageBus>

export const createMessageBus = (journal: Journal) => {
  const live = new Map<string, { role: RoleName; ticket: string }>()
  const inbox = new Map<string, AgentMessage[]>()
  const sentCount = new Map<string, number>()

  const register = (name: string, role: RoleName, ticket: string) => live.set(name, { role, ticket })
  const unregister = (name: string) => {
    live.delete(name)
    const left = inbox.get(name) ?? []
    for (const m of left) journal.write('agent_message_undelivered', { ...m, reason: 'receiver finished first' })
    inbox.delete(name)
  }

  /** from: an agent name, or "engine" for probes. Reviewers can't send or receive. */
  const send = (from: string, to: string, text: string) => {
    const id = crypto.randomUUID()
    const sender = live.get(from)
    const refuse = (reason: string) => {
      journal.write('agent_message_refused', { id, from, to, text, reason })
      return { ok: false as const, detail: `Refused: ${reason}` }
    }
    if (from !== 'engine') {
      if (!sender) return refuse('sender is not a live agent')
      if (sender.role === 'ticket-reviewer') return refuse('reviewers cannot send messages')
      const key = `${from}|${sender.ticket}`
      const count = sentCount.get(key) ?? 0
      if (count >= LIMITS.messagesPerAgentPerTicket)
        return refuse(`at most ${LIMITS.messagesPerAgentPerTicket} messages per agent per ticket`)
      sentCount.set(key, count + 1)
    }
    const receivers = [...live.entries()]
      .filter(([name, a]) => name !== from && a.role !== 'ticket-reviewer')
      .filter(([name, a]) => to === 'all' || name === to || a.role === to)
      .map(([name]) => name)
    const message = { id, from, to, text, queuedAt: new Date().toISOString() }
    if (receivers.length === 0) {
      journal.write('agent_message', { ...message, receivers: [], status: 'kept in journal: no live receiver' })
      return { ok: true as const, detail: 'No live agent matches; the message is kept in the journal only.' }
    }
    for (const r of receivers) inbox.set(r, [...(inbox.get(r) ?? []), message])
    journal.write('agent_message', { ...message, receivers, status: 'queued' })
    return { ok: true as const, detail: `Queued for ${receivers.join(', ')}; delivered at their next tool call.` }
  }

  const take = (name: string) => {
    const msgs = inbox.get(name) ?? []
    inbox.set(name, [])
    return msgs
  }

  return { register, unregister, send, take, liveNames: () => [...live.keys()] }
}

// ---------- input channel for streaming-input mode ----------

export const createInputChannel = () => {
  const queue: SDKUserMessage[] = []
  let wake: (() => void) | null = null
  let closed = false
  const push = (m: SDKUserMessage) => {
    queue.push(m)
    wake?.()
    wake = null
  }
  const close = () => {
    closed = true
    wake?.()
    wake = null
  }
  async function* iterate(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const next = queue.shift()
      if (next) {
        yield next
        continue
      }
      if (closed) return
      await new Promise<void>((r) => {
        wake = r
      })
    }
  }
  return { push, close, iterable: iterate() }
}

// ---------- agent spec and session ----------

export type AgentSpec<T> = {
  name: string
  role: RoleName
  ticket: string
  cwd: string
  model: string
  instructions: string
  schema: z.ZodType<T>
  tools: string[]
  allowedTools: string[]
  disallowedTools: string[]
  sandbox: SandboxSettings
  messaging: boolean
  maxTurns: number
  extraEnv?: Record<string, string>
  /** Default true. Only the strict-MCP control probe turns it off. */
  strictMcp?: boolean
}

export type ToolCall = { id: string; name: string; input: unknown; result?: string; isError?: boolean }

export type AgentInfo = {
  name: string
  role: RoleName
  model: string
  sessionId: string | null
  claudeCodeVersion: string | null
  init: Record<string, unknown> | null
  account: Record<string, unknown> | null
  context: Record<string, unknown> | null
  turns: number
  toolCalls: ToolCall[]
  permissionDenials: unknown[]
  rateLimitEvents: SDKRateLimitInfo[]
  usageSnapshots: Record<string, unknown>[]
  modelUsage: Record<string, unknown> | null
  costUsd: number
  numTurnsTotal: number
  durationMs: number
}

export type TurnOutcome<T> =
  | { ok: true; output: T; result: SDKResultSuccess }
  | { ok: false; kind: 'schema' | 'error' | 'timeout'; detail: string; result?: SDKResultMessage }

export type AgentSession<T> = {
  name: string
  role: RoleName
  info: AgentInfo
  turn: (prompt: string, timeoutMs?: number) => Promise<TurnOutcome<T>>
  usageSnapshot: (label: string) => Promise<Record<string, unknown> | null>
  close: () => Promise<void>
}

export const toJsonSchema = (schema: z.ZodType) => {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>
  delete json.$schema
  return json
}

/** The installed `claude` (same binary the user and Paseo run). */
export const claudeBinary = () => {
  const found = Bun.which('claude')
  if (!found) throw new Error('claude binary not found on PATH')
  return realpathSync(found)
}

export const BASE_DISALLOWED = [
  'Agent',
  'Task',
  'Workflow',
  'Skill',
  'WebFetch',
  'WebSearch',
  'Monitor',
  'PowerShell',
  'NotebookEdit',
  'SendMessage',
  'Artifact',
  'RemoteTrigger',
  'CronCreate',
  'PushNotification',
  'SendUserFile',
  'EnterWorktree',
  'ExitWorktree',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'Bash(run_in_background:true)',
  'Read(~/.claude.json)',
  'Read(~/.claude/**)',
  'Read(~/.paseo/**)',
  'Read(~/.ssh/**)',
  'Read(~/.config/gh/**)',
]

const redactAccount = (a: Record<string, unknown>) => ({
  subscriptionType: a.subscriptionType,
  tokenSource: a.tokenSource,
  apiKeySource: a.apiKeySource,
  apiProvider: a.apiProvider,
  hasEmail: typeof a.email === 'string',
  hasOrganization: typeof a.organization === 'string',
})

const PLAN_TYPES = ['pro', 'max', 'team', 'enterprise']

const checkAccount = (account: Record<string, unknown>): string | null => {
  const sub = String(account.subscriptionType ?? '').toLowerCase()
  if (!PLAN_TYPES.some((p) => sub.includes(p))) return `no Claude subscription (subscriptionType=${account.subscriptionType})`
  if (account.apiKeySource && account.apiKeySource !== 'none') return `apiKeySource=${account.apiKeySource}`
  if (account.apiProvider && account.apiProvider !== 'firstParty') return `apiProvider=${account.apiProvider}`
  return null
}

const summarizeUsage = (label: string, u: Awaited<ReturnType<ReturnType<typeof query>['usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET']>>) => {
  const rl = u.rate_limits
  const win = (w: { utilization: number | null; resets_at: string | null } | null | undefined) =>
    w ? { utilization: w.utilization, resets_at: w.resets_at } : null
  return {
    label,
    at: new Date().toISOString(),
    subscription_type: u.subscription_type,
    rate_limits_available: u.rate_limits_available,
    five_hour: win(rl?.five_hour),
    seven_day: win(rl?.seven_day),
    seven_day_opus: win(rl?.seven_day_opus),
    seven_day_sonnet: win(rl?.seven_day_sonnet),
    seven_day_oauth_apps: win(rl?.seven_day_oauth_apps),
    model_scoped: rl?.model_scoped ?? null,
    // Money figures are left out on purpose; only whether usage credits are on.
    extra_usage_enabled: rl?.extra_usage?.is_enabled ?? null,
    extra_usage_utilization: rl?.extra_usage?.utilization ?? null,
  }
}

export const shouldStopForRateLimit = (info: SDKRateLimitInfo): string | null => {
  if (info.status === 'rejected') return `rate_limit_event status=rejected (type=${info.rateLimitType}, resetsAt=${info.resetsAt})`
  if (info.isUsingOverage === true) return `rate_limit_event isUsingOverage=true (type=${info.rateLimitType})`
  if (info.overageInUse === true) return `rate_limit_event overageInUse=true (type=${info.rateLimitType})`
  if (info.rateLimitType === 'overage') return 'rate_limit_event rateLimitType=overage'
  return null
}

export const startAgent = async <T>(spec: AgentSpec<T>, ctx: EngineCtx): Promise<AgentSession<T>> => {
  const { journal, bus } = ctx
  if (ctx.stoppedReason()) throw runStopped(ctx.stoppedReason() ?? '')
  assertClaudeModel(spec.model)
  const strictMcp = spec.strictMcp ?? true
  const started = Date.now()
  const info: AgentInfo = {
    name: spec.name,
    role: spec.role,
    model: spec.model,
    sessionId: null,
    claudeCodeVersion: null,
    init: null,
    account: null,
    context: null,
    turns: 0,
    toolCalls: [],
    permissionDenials: [],
    rateLimitEvents: [],
    usageSnapshots: [],
    modelUsage: null,
    costUsd: 0,
    numTurnsTotal: 0,
    durationMs: 0,
  }

  const deliver: HookCallback = async (input) => {
    const msgs = bus.take(spec.name)
    if (msgs.length === 0) return {}
    const text = msgs.map((m) => `[Agent message ${m.id} from ${m.from}]: ${m.text}`).join('\n')
    const event = input.hook_event_name === 'PostToolUseFailure' ? 'PostToolUseFailure' : 'PostToolUse'
    journal.write('agent_message_delivered', {
      to: spec.name,
      ids: msgs.map((m) => m.id),
      via: event,
      tool_name: 'tool_name' in input ? input.tool_name : null,
      tool_use_id: 'tool_use_id' in input ? input.tool_use_id : null,
      additional_context: text,
    })
    const out: HookJSONOutput =
      event === 'PostToolUse'
        ? { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }
        : { hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: text } }
    return out
  }

  const sendMessageTool = tool(
    'send_message',
    'Send a short one-way heads-up to another live agent in this run (or "all"). Nobody replies. At most 5 per ticket.',
    {
      to: z.string().describe('A live agent name or role (test-writer, implementer), or "all".'),
      text: z.string().max(2000).describe('The message. Keep it short and factual.'),
    },
    async (args) => {
      const r = bus.send(spec.name, args.to, args.text)
      return { content: [{ type: 'text', text: r.detail }], isError: !r.ok }
    },
  )

  const mcpServers: Options['mcpServers'] = spec.messaging
    ? { luca: createSdkMcpServer({ name: 'luca', version: '0.0.0', tools: [sendMessageTool] }) }
    : {}

  const env = cleanEnv({
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    CLAUDE_AGENT_SDK_CLIENT_APP: 'luca-tracer-prototype/0.0.0',
    ...spec.extraEnv,
  })

  const input = createInputChannel()
  const abort = new AbortController()
  const options: Options = {
    cwd: spec.cwd,
    model: spec.model,
    effort: EFFORT,
    pathToClaudeCodeExecutable: claudeBinary(),
    systemPrompt: { type: 'preset', preset: 'claude_code', append: spec.instructions },
    outputFormat: { type: 'json_schema', schema: toJsonSchema(spec.schema) },
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    tools: spec.tools,
    allowedTools: [...spec.allowedTools, ...(spec.messaging ? ['mcp__luca__send_message'] : [])],
    disallowedTools: spec.disallowedTools,
    settingSources: [],
    strictMcpConfig: strictMcp,
    mcpServers,
    skills: [],
    sandbox: spec.sandbox,
    env,
    persistSession: false,
    maxTurns: spec.maxTurns,
    abortController: abort,
    hooks: spec.messaging
      ? { PostToolUse: [{ hooks: [deliver] }], PostToolUseFailure: [{ hooks: [deliver] }] }
      : undefined,
    stderr: (data: string) => journal.write('agent_stderr', { agent: spec.name, data }),
  }

  journal.write('agent_start', {
    agent: spec.name,
    role: spec.role,
    ticket: spec.ticket,
    options: {
      ...options,
      mcpServers: Object.keys(mcpServers ?? {}),
      env: Object.keys(env).sort(),
      hooks: spec.messaging ? ['PostToolUse', 'PostToolUseFailure'] : [],
      abortController: undefined,
      stderr: undefined,
    },
  })

  const q = query({ prompt: input.iterable, options })
  const slot: { waiter: { resolve: (r: SDKResultMessage) => void; reject: (e: Error) => void } | null } = { waiter: null }
  let ended = false

  const handle = (msg: SDKMessage) => {
    if (msg.type === 'system' && msg.subtype === 'init') {
      info.sessionId = msg.session_id
      info.claudeCodeVersion = msg.claude_code_version
      info.init = {
        model: msg.model,
        apiKeySource: msg.apiKeySource,
        permissionMode: msg.permissionMode,
        claude_code_version: msg.claude_code_version,
        cwd: msg.cwd,
        tools: msg.tools,
        mcp_servers: msg.mcp_servers,
        skills: msg.skills,
        plugins: msg.plugins,
        effort: msg.effort ?? null,
      }
      if (msg.apiKeySource !== 'none') ctx.stop(`${spec.name}: init apiKeySource=${msg.apiKeySource} (expected "none")`)
      if (/fable/i.test(msg.model)) ctx.stop(`${spec.name}: init model is a Fable model (${msg.model})`)
      if (msg.model !== spec.model) journal.write('warning', { agent: spec.name, warning: `init model ${msg.model} != requested ${spec.model}` })
      const leakedTools = msg.tools.filter((t) => t.startsWith('mcp__') && !t.startsWith('mcp__luca__'))
      const leakedServers = msg.mcp_servers.map((s) => s.name).filter((n) => n !== 'luca')
      if (strictMcp && (leakedTools.length || leakedServers.length))
        ctx.stop(`${spec.name}: strict MCP leak: servers=${leakedServers.join(',')} tools=${leakedTools.slice(0, 5).join(',')}`)
    } else if (msg.type === 'rate_limit_event') {
      const i = msg.rate_limit_info
      info.rateLimitEvents.push(i)
      ctx.rateLimits.push({ at: new Date().toISOString(), agent: spec.name, info: i })
      const why = shouldStopForRateLimit(i)
      if (why) ctx.stop(`${spec.name}: ${why}`)
    } else if (msg.type === 'assistant') {
      if (msg.error === 'billing_error') ctx.stop(`${spec.name}: assistant error billing_error`)
      const content = msg.message.content
      if (Array.isArray(content))
        for (const block of content)
          if (block.type === 'tool_use') info.toolCalls.push({ id: block.id, name: block.name, input: block.input })
    } else if (msg.type === 'user') {
      const content = msg.message.content
      if (Array.isArray(content))
        for (const block of content) {
          if (block.type !== 'tool_result') continue
          const call = info.toolCalls.find((c) => c.id === block.tool_use_id)
          if (!call) continue
          const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
          call.result = text.length > 4000 ? text.slice(0, 4000) + '[...]' : text
          call.isError = block.is_error === true
        }
    } else if (msg.type === 'system' && msg.subtype === 'permission_denied') {
      info.permissionDenials.push({ tool: msg.tool_name, tool_use_id: msg.tool_use_id, reason: msg.decision_reason_type })
    } else if (msg.type === 'result') {
      info.turns++
      info.modelUsage = msg.modelUsage
      info.costUsd = msg.total_cost_usd
      info.numTurnsTotal += msg.num_turns
      if (msg.permission_denials.length) info.permissionDenials.push(...msg.permission_denials)
      const w = slot.waiter
      slot.waiter = null
      w?.resolve(msg)
    }
  }

  const pump = (async () => {
    try {
      for await (const msg of q) {
        journal.write('sdk_message', { agent: spec.name, message: msg })
        handle(msg)
      }
    } catch (err) {
      journal.write('agent_error', { agent: spec.name, error: err })
      slot.waiter?.reject(err instanceof Error ? err : new Error(String(err)))
      slot.waiter = null
    } finally {
      ended = true
      slot.waiter?.reject(new Error(`session of ${spec.name} ended`))
      slot.waiter = null
    }
  })()

  const closeNow = () => {
    input.close()
    q.close()
  }
  const liveHandle = { close: closeNow }
  ctx.live.add(liveHandle)
  bus.register(spec.name, spec.role, spec.ticket)

  const usageSnapshot = async (label: string) => {
    try {
      const u = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
      const snap = summarizeUsage(label, u)
      info.usageSnapshots.push(snap)
      journal.write('usage_snapshot', { agent: spec.name, snapshot: snap })
      if (snap.extra_usage_enabled === true) ctx.stop(`${spec.name}: usage credits (extra usage) are enabled`)
      return snap
    } catch (err) {
      journal.write('usage_snapshot_error', { agent: spec.name, label, error: err })
      return null
    }
  }

  // Credential check before any prompt is sent (no model call needed).
  const account = (await q.accountInfo()) as Record<string, unknown>
  info.account = redactAccount(account)
  journal.write('account_check', { agent: spec.name, account: info.account })
  const bad = checkAccount(account)
  if (bad) {
    ctx.stop(`${spec.name}: credential check failed: ${bad}`)
    throw runStopped(bad)
  }
  try {
    const cu = await q.getContextUsage({ detail: 'summary' })
    info.context = {
      memoryFiles: cu.memoryFiles.map((m) => ({ path: m.path, type: m.type })),
      mcpTools: cu.mcpTools.map((t) => `${t.serverName}:${t.name}`),
      skills: cu.skills ?? null,
      agents: cu.agents.map((a) => `${a.source}:${a.agentType}`),
    }
    journal.write('context_check', { agent: spec.name, context: info.context })
  } catch (err) {
    journal.write('context_check_error', { agent: spec.name, error: err })
  }
  await usageSnapshot('before')

  const interpret = (r: SDKResultMessage): TurnOutcome<T> => {
    if (r.subtype === 'success') {
      if (r.is_error) return { ok: false, kind: 'error', detail: r.result, result: r }
      if (r.structured_output === undefined || r.structured_output === null)
        return { ok: false, kind: 'schema', detail: 'success result without structured_output', result: r }
      const parsed = spec.schema.safeParse(r.structured_output)
      if (!parsed.success) return { ok: false, kind: 'schema', detail: `engine zod check failed: ${parsed.error.message}`, result: r }
      return { ok: true, output: parsed.data, result: r }
    }
    if (r.subtype === 'error_max_structured_output_retries')
      return { ok: false, kind: 'schema', detail: `${r.subtype}: ${r.errors.join('; ')}`, result: r }
    return { ok: false, kind: 'error', detail: `${r.subtype}: ${r.errors.join('; ')}`, result: r }
  }

  const turn = async (prompt: string, timeoutMs = 40 * 60_000): Promise<TurnOutcome<T>> => {
    const stopped = ctx.stoppedReason()
    if (stopped) throw runStopped(stopped)
    if (ended) return { ok: false, kind: 'error', detail: 'session already ended' }
    journal.write('prompt', { agent: spec.name, turn: info.turns + 1, text: prompt })
    const resultP = new Promise<SDKResultMessage>((resolve, reject) => {
      slot.waiter = { resolve, reject }
    })
    input.push({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutP = new Promise<'timeout'>((r) => {
      timer = setTimeout(() => r('timeout'), timeoutMs)
    })
    const res = await Promise.race([resultP, timeoutP]).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
    clearTimeout(timer)
    const stoppedAfter = ctx.stoppedReason()
    if (stoppedAfter) throw runStopped(stoppedAfter)
    let outcome: TurnOutcome<T>
    if (res === 'timeout') {
      await q.interrupt().catch(() => undefined)
      await Promise.race([resultP.catch(() => undefined), Bun.sleep(30_000)])
      outcome = { ok: false, kind: 'timeout', detail: `no result within ${timeoutMs} ms; interrupted` }
    } else if (res instanceof Error) outcome = { ok: false, kind: 'error', detail: res.message }
    else outcome = interpret(res)
    journal.write('agent_result', {
      agent: spec.name,
      turn: info.turns,
      ok: outcome.ok,
      outcome_kind: outcome.ok ? 'ok' : outcome.kind,
      detail: outcome.ok ? null : outcome.detail,
      output: outcome.ok ? outcome.output : null,
      structured_output: outcome.result && outcome.result.subtype === 'success' ? outcome.result.structured_output : null,
      result_subtype: outcome.result?.subtype ?? null,
      num_turns: outcome.result?.num_turns ?? null,
      total_cost_usd: outcome.result?.total_cost_usd ?? null,
      usage: outcome.result?.usage ?? null,
      model_usage: outcome.result?.modelUsage ?? null,
      permission_denials: outcome.result?.permission_denials ?? null,
    })
    return outcome
  }

  const close = async () => {
    if (!ended && !ctx.stoppedReason()) await usageSnapshot('after')
    closeNow()
    await Promise.race([pump, Bun.sleep(15_000)])
    ctx.live.delete(liveHandle)
    bus.unregister(spec.name)
    info.durationMs = Date.now() - started
    journal.write('agent_end', { agent: spec.name, info })
  }

  return { name: spec.name, role: spec.role, info, turn, usageSnapshot, close }
}

/**
 * Credential and plan check before a run: accountInfo() and the usage windows, with no prompt
 * sent, so it costs no model usage.
 */
export const preflight = async (ctx: EngineCtx, cwd: string) => {
  const input = createInputChannel()
  const q = query({
    prompt: input.iterable,
    options: {
      cwd,
      pathToClaudeCodeExecutable: claudeBinary(),
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      permissionMode: 'dontAsk',
      persistSession: false,
      tools: [],
      env: cleanEnv({ CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false' }),
      stderr: (data: string) => ctx.journal.write('preflight_stderr', { data }),
    },
  })
  const pump = (async () => {
    for await (const msg of q) ctx.journal.write('sdk_message', { agent: 'preflight', message: msg })
  })().catch((err: unknown) => ctx.journal.write('preflight_error', { error: err }))
  try {
    const account = (await q.accountInfo()) as Record<string, unknown>
    const usage = summarizeUsage('preflight', await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }))
    const problems: string[] = []
    const bad = checkAccount(account)
    if (bad) problems.push(bad)
    if (!usage.subscription_type) problems.push('usage endpoint reports no subscription')
    if (usage.extra_usage_enabled === true) problems.push('usage credits (extra usage) are enabled')
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'])
      if (k in cleanEnv()) problems.push(`${k} would reach agents`)
    const report = { account: redactAccount(account), usage, claude_binary: claudeBinary(), problems }
    ctx.journal.write('preflight', report)
    return report
  } finally {
    input.close()
    q.close()
    await Promise.race([pump, Bun.sleep(10_000)])
  }
}
