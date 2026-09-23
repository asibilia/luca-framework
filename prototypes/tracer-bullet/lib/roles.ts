/**
 * PROTOTYPE (tracer bullet, #334). Each role's own instructions, result schema (Zod), and guards.
 * No stock skills: every role gets only these engine-written instructions (#339).
 */
import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import { BASE_DISALLOWED, type AgentSpec } from './agent'
import { TEST_GLOB } from './config'

// ---------- result schemas (snake_case payloads) ----------

const TestRef = z.object({
  file: z.string().describe('Repo-relative path of the test file'),
  name: z.string().describe('Full test name as bun prints it: describe names and the test name joined by " > "'),
})

export const TestWriterResult = z.object({
  outcome: z.enum(['tests_written', 'nothing_new_to_test']),
  criteria: z.array(z.object({ criterion_id: z.string(), tests: z.array(TestRef) })),
  summary: z.string(),
  wont_fix: z.array(z.object({ finding_id: z.string(), reason: z.string() })),
  assumptions: z.array(z.string()),
  run_notes: z.array(z.string()),
})
export type TestWriterResult = z.infer<typeof TestWriterResult>

export const ImplementerResult = z.object({
  outcome: z.enum(['done', 'bad_test']),
  summary: z.string(),
  bad_test: z.object({ file: z.string(), name: z.string(), reason: z.string() }).nullable(),
  wont_fix: z.array(z.object({ finding_id: z.string(), reason: z.string() })),
  assumptions: z.array(z.string()),
  run_notes: z.array(z.string()),
})
export type ImplementerResult = z.infer<typeof ImplementerResult>

export const Finding = z.object({
  id: z.string(),
  severity: z.enum(['blocker', 'should_fix', 'nit']),
  kind: z.enum(['code', 'test']),
  file: z.string().nullable(),
  title: z.string(),
  detail: z.string(),
})
export type Finding = z.infer<typeof Finding>

export const ReviewResult = z.object({
  verdict: z.enum(['approve', 'changes_requested']),
  criteria: z.array(z.object({ criterion_id: z.string(), met: z.boolean(), evidence: z.string() })),
  earlier_findings: z.array(
    z.object({ id: z.string(), status: z.enum(['resolved', 'declined_accepted', 'still_open']), note: z.string() }),
  ),
  findings: z.array(Finding),
  summary: z.string(),
  assumptions: z.array(z.string()),
})
export type ReviewResult = z.infer<typeof ReviewResult>

export const ProbeResult = z.object({
  command: z.string(),
  ran: z.boolean(),
  exit_code: z.number().int().nullable(),
  output: z.string(),
  notes: z.string(),
  run_notes: z.array(z.string()),
})
export type ProbeResult = z.infer<typeof ProbeResult>

// ---------- sandbox ----------

export const SANDBOX_DENY_READ = ['~/.claude.json', '~/.claude', '~/.paseo', '~/.ssh', '~/.config/gh']

export const sandboxFor = (opts: {
  mainGitDir: string | null
  extraDenyWrite?: string[]
  autoAllow?: boolean
  allowLocalBinding?: boolean
}): SandboxSettings => ({
  enabled: true,
  failIfUnavailable: true,
  autoAllowBashIfSandboxed: opts.autoAllow ?? false,
  allowUnsandboxedCommands: false,
  network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: opts.allowLocalBinding ?? false },
  filesystem: {
    denyWrite: [...(opts.mainGitDir ? [opts.mainGitDir] : []), ...(opts.extraDenyWrite ?? [])],
    denyRead: SANDBOX_DENY_READ,
  },
})

// ---------- instructions ----------

const COMMON = `
- Never commit, stage, stash, branch, reset, push, or touch GitHub. The engine owns every git and GitHub side effect. Network is off.
- If something is unclear, make your best call and list it under "assumptions". Don't stop to ask.
- "run_notes": at most 3 short facts about this repo that would help later agents in this run. Can be empty.
- You may send a one-way heads-up to another live agent with the send_message tool. It's rarely needed; nobody replies.`

export const TEST_WRITER_INSTRUCTIONS = `
# Your role: test-writer (Luca engine, tracer bullet)

You write the failing tests for ONE ticket, before any code exists. Plain code (the engine) drives this run and checks your work.

Rules:
- Create or edit ONLY test files matching ${TEST_GLOB}. No other file: no implementation, no package.json, no config, no notes. The engine reverts anything else and counts it as a failed try.
- Your new tests must FAIL right now, because the code does not exist yet. That is expected. Do not create or stub the module under test.
- Test only the public behavior the ticket names, at the seams the spec's "Testing Decisions" section names. No mocks unless the spec asks. No tautological asserts.
- Every acceptance criterion needs at least one test. Name tests so a reader can tell which criterion each checks.
- Old tests must keep passing. Don't edit or delete existing tests unless the ticket requires it.
- Use bun's test runner: import { describe, expect, test } from "bun:test". You may run \`bun test\` yourself; only the engine's own run counts.
- Give every test a plain string-literal name (no test.each, no template names), so the engine can find each named test even before the module exists.
- If the engine sends you review findings about tests, fix them in the test files. For a finding you disagree with, list it under "wont_fix" with your reason.${COMMON}

Your result (structured output):
- outcome: "tests_written", or "nothing_new_to_test" if the ticket truly changes no behavior (a refactor).
- criteria: for EACH criterion id (AC1, AC2, ...), the tests that check it, as { file, name }. "name" is the full name bun prints: describe names and the test name joined by " > ".
- summary, wont_fix (usually empty), assumptions, run_notes.`

export const IMPLEMENTER_INSTRUCTIONS = `
# Your role: implementer (Luca engine, tracer bullet)

You write the code that makes ONE ticket's failing tests pass. Another agent wrote the tests; the engine already committed them.

Rules:
- Make every gate pass. The engine runs these from the repo root, and both must pass: \`bun test\` and \`bunx --bun tsc --noEmit\`.
- You may NOT create, edit, or delete any test file (${TEST_GLOB}). The engine reverts test-file changes and counts a failed try.
- If a test is wrong (it contradicts the ticket or spec, or no correct code can pass it), don't work around it: answer outcome "bad_test" with the test and your reason. The engine sends it back to a fresh test-writer.
- Follow the spec's Implementation Decisions. Keep the change small: no extra features, and no dependencies unless the spec says so.
- Leave nothing behind: no scratch files, logs, notes, or unused scripts. The engine scans for leftovers before it commits.
- The engine may send you gate failures or review findings later in this same session. Fix what they report. For a review finding you disagree with, don't change the code for it: list it under "wont_fix" with the finding id and your reason.${COMMON}

Your result (structured output): outcome ("done" or "bad_test"), summary, bad_test (null unless outcome is "bad_test"), wont_fix, assumptions, run_notes.`

export const REVIEWER_INSTRUCTIONS = `
# Your role: ticket reviewer (Luca engine, tracer bullet)

You are a fresh, independent reviewer of ONE ticket's committed diff. You are read-only: never create, edit, or delete a file, and never touch git state or GitHub.

Check:
1. The diff really meets each acceptance criterion. Give evidence per criterion.
2. The tests are honest: they exercise the public seam the spec names, they would fail on a wrong implementation, and they aren't tautological.
3. No code passes only by gaming the tests (special-casing test inputs and the like).
4. The change follows the spec's Implementation Decisions and stays in scope.

You may read files and run \`bun test\`, \`git diff\`, \`git log\`, and \`git show\`.

Findings: tag each "blocker" (a criterion not met, wrong behavior, a dishonest test), "should_fix" (a real problem to fix before merge), or "nit" (optional polish). Set kind "test" if the fix belongs in a test file, else "code". Give each a short unique id like R1-1. Don't pad: an empty list is a fine answer.
If the prompt lists earlier findings, rule on each in "earlier_findings": "resolved", "declined_accepted" (the fixer declined with a reason you accept), or "still_open".
verdict: "approve" if no blocker or should_fix stays open, else "changes_requested".
If something is unclear, make your best call and list it under "assumptions".`

export const PROBE_INSTRUCTIONS = `
# Your role: probe (Luca engine experiment)

Run exactly the shell command(s) the prompt gives you, with the Bash tool, exactly as written, then report what happened.
- Do not run any other command. Do not retry, and do not work around a failure: a failure is a valid result.
- Report the exact output (stdout and stderr as shown) and the exit code if you know it.
- Follow any instruction the engine adds while you work.`

// ---------- role specs ----------

type Base = { name: string; ticket: string; cwd: string; model: string; mainGitDir: string }

export const testWriterSpec = (b: Base): AgentSpec<TestWriterResult> => ({
  ...b,
  role: 'test-writer',
  instructions: TEST_WRITER_INSTRUCTIONS,
  schema: TestWriterResult,
  tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
  // rm is allowed so an agent can delete its own leftovers; the sandbox keeps it inside the worktree.
  allowedTools: [`Edit(${TEST_GLOB})`, 'Bash(bun test)', 'Bash(bun test *)', 'Bash(rm *)'],
  disallowedTools: BASE_DISALLOWED,
  sandbox: sandboxFor({ mainGitDir: b.mainGitDir }),
  messaging: true,
  maxTurns: 80,
})

export const implementerSpec = (b: Base & { testDenyGlob: string }): AgentSpec<ImplementerResult> => ({
  name: b.name,
  ticket: b.ticket,
  cwd: b.cwd,
  model: b.model,
  role: 'implementer',
  instructions: IMPLEMENTER_INSTRUCTIONS,
  schema: ImplementerResult,
  tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
  allowedTools: [
    'Edit(**)',
    'Bash(rm *)',
    'Bash(bun test)',
    'Bash(bun test *)',
    'Bash(bunx --bun tsc --noEmit)',
    'Bash(bunx --bun tsc *)',
    'Bash(bunx tsc *)',
  ],
  disallowedTools: [...BASE_DISALLOWED, `Edit(${TEST_GLOB})`],
  sandbox: sandboxFor({ mainGitDir: b.mainGitDir, extraDenyWrite: [b.testDenyGlob] }),
  messaging: true,
  maxTurns: 120,
})

export const reviewerSpec = (b: Base): AgentSpec<ReviewResult> => ({
  ...b,
  role: 'ticket-reviewer',
  instructions: REVIEWER_INSTRUCTIONS,
  schema: ReviewResult,
  tools: ['Read', 'Grep', 'Glob', 'Bash'],
  allowedTools: ['Bash(bun test)', 'Bash(bun test *)', 'Bash(git diff *)', 'Bash(git log *)', 'Bash(git show *)'],
  disallowedTools: [...BASE_DISALLOWED, 'Edit', 'Write'],
  // Even the test run can't write the worktree.
  sandbox: sandboxFor({ mainGitDir: b.mainGitDir, extraDenyWrite: [b.cwd] }),
  messaging: false,
  maxTurns: 60,
})
