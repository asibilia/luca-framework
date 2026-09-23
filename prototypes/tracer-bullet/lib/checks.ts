/**
 * PROTOTYPE (tracer bullet, #334). Plain-code checks: test runs, red check, gates,
 * leftover scan, role path rules, and a secret scan for journals.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import { TEST_GLOB } from './config'
import { git, isDeleted, isUntracked, type StatusEntry } from './git'
import { cleanEnv, run, type ShellResult } from './shell'

// ---------- test runs ----------

export type TestCase = { file: string; name: string; fullName: string; status: 'passed' | 'failed' | 'skipped' }
export type TestRun = {
  shell: ShellResult
  cases: TestCase[]
  noTestFiles: boolean
  testFiles: string[]
  filesWithoutResults: string[]
  ok: boolean
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  return m ? decode(m[1] ?? '') : undefined
}

/** bun's JUnit: one <testsuite file=..> per file, nested <testsuite> per describe, <testcase>. */
export const parseJunit = (xml: string): TestCase[] => {
  const cases: TestCase[] = []
  const stack: string[] = []
  let open: TestCase | null = null
  const tagRe = /<(\/?)(testsuite|testcase|failure|error|skipped)\b([^>]*?)(\/?)>/g
  for (let m = tagRe.exec(xml); m; m = tagRe.exec(xml)) {
    const [, closing, tag, attrs = '', selfClosing] = m
    if (tag === 'testsuite') {
      if (closing) stack.pop()
      else if (!selfClosing) stack.push(attr(attrs, 'name') ?? '')
    } else if (tag === 'testcase') {
      if (closing) {
        if (open) cases.push(open)
        open = null
      } else {
        const name = attr(attrs, 'name') ?? ''
        const file = attr(attrs, 'file') ?? stack[0] ?? ''
        const path = [...stack.slice(1), name]
        const tc: TestCase = { file, name, fullName: path.join(' > '), status: 'passed' }
        if (selfClosing) cases.push(tc)
        else open = tc
      }
    } else if (open && !closing) {
      open.status = tag === 'skipped' ? 'skipped' : 'failed'
    }
  }
  return cases
}

export const listTestFiles = async (cwd: string) =>
  (await git(cwd, ['ls-files', '-co', '--exclude-standard', '--', '*.test.ts'])).stdout
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('node_modules/'))
    .sort()

export const runTests = async (cwd: string, junitFile: string): Promise<TestRun> => {
  const shell = await run(['bun', 'test', '--reporter=junit', `--reporter-outfile=${junitFile}`], {
    cwd,
    timeoutMs: 180_000,
    env: cleanEnv(),
  })
  const noTestFiles = /0 test files matching/.test(shell.stderr + shell.stdout)
  const cases = existsSync(junitFile) ? parseJunit(readFileSync(junitFile, 'utf8')) : []
  const testFiles = await listTestFiles(cwd)
  const filesWithResults = new Set(cases.map((c) => c.file))
  const filesWithoutResults = testFiles.filter((f) => !filesWithResults.has(f))
  const ok = !shell.timedOut && (shell.exitCode === 0 || (noTestFiles && testFiles.length === 0))
  return { shell, cases, noTestFiles, testFiles, filesWithoutResults, ok }
}

// ---------- red check ----------

export type NamedTest = { file: string; name: string }
export type CriterionMap = { criterion_id: string; tests: NamedTest[] }[]

const normPath = (p: string) => p.replace(/^\.\//, '').trim()
const lastSegment = (name: string) => (name.split(' > ').pop() ?? name).trim()

const findCase = (cases: TestCase[], t: NamedTest) => {
  const inFile = cases.filter((c) => c.file === normPath(t.file))
  const exact = inFile.find((c) => c.fullName.trim() === t.name.trim())
  if (exact) return exact
  const byLast = inFile.filter((c) => c.name.trim() === lastSegment(t.name))
  return byLast.length === 1 ? byLast[0] : undefined
}

export type RedCheckResult = { ok: boolean; problems: string[]; notes: string[] }

export const redCheck = (args: {
  cwd: string
  criterionIds: string[]
  mapping: CriterionMap
  baseline: TestRun
  current: TestRun
}): RedCheckResult => {
  const { cwd, criterionIds, mapping, baseline, current } = args
  const problems: string[] = []
  const notes: string[] = []
  const glob = new Bun.Glob(TEST_GLOB)
  for (const id of criterionIds) {
    const entry = mapping.find((m) => m.criterion_id === id)
    if (!entry || entry.tests.length === 0) problems.push(`${id} has no test`)
  }
  for (const m of mapping) if (!criterionIds.includes(m.criterion_id)) notes.push(`unknown criterion id ${m.criterion_id}`)
  for (const t of mapping.flatMap((m) => m.tests)) {
    const file = normPath(t.file)
    const label = `"${t.name}" in ${file}`
    if (!glob.match(file)) {
      problems.push(`${label}: file does not match ${TEST_GLOB}`)
      continue
    }
    if (!existsSync(join(cwd, file))) {
      problems.push(`${label}: file does not exist`)
      continue
    }
    const found = findCase(current.cases, t)
    if (found) {
      if (found.status === 'passed') problems.push(`${label}: passes already (it must fail before any code is written)`)
      else if (found.status === 'skipped') problems.push(`${label}: is skipped`)
      else notes.push(`${label}: fails, as required`)
      continue
    }
    if (current.filesWithoutResults.includes(file)) {
      const source = readFileSync(join(cwd, file), 'utf8')
      if (source.includes(lastSegment(t.name))) notes.push(`${label}: fails (its file does not load yet)`)
      else problems.push(`${label}: not found in the file`)
      continue
    }
    problems.push(`${label}: not found in the test results`)
  }
  for (const old of baseline.cases.filter((c) => c.status === 'passed')) {
    const now = current.cases.find((c) => c.file === old.file && c.fullName === old.fullName)
    if (!now) problems.push(`old test "${old.fullName}" in ${old.file} is missing`)
    else if (now.status !== 'passed') problems.push(`old test "${old.fullName}" in ${old.file} no longer passes`)
  }
  return { ok: problems.length === 0, problems, notes }
}

// ---------- gates ----------

export type GateResult = { ok: boolean; tests: TestRun; types: ShellResult; report: string }

export const runGates = async (cwd: string, junitFile: string): Promise<GateResult> => {
  const tests = await runTests(cwd, junitFile)
  const types = await run(['bunx', '--bun', 'tsc', '--noEmit'], { cwd, timeoutMs: 300_000, env: cleanEnv() })
  const typesOk = types.exitCode === 0 && !types.timedOut
  const report = [
    `bun test: ${tests.ok ? 'PASS' : 'FAIL'} (exit ${tests.shell.exitCode})`,
    tests.ok ? '' : clip(tests.shell.stdout + '\n' + tests.shell.stderr),
    `bunx --bun tsc --noEmit: ${typesOk ? 'PASS' : 'FAIL'} (exit ${types.exitCode})`,
    typesOk ? '' : clip(types.stdout + '\n' + types.stderr),
  ]
    .filter(Boolean)
    .join('\n')
  return { ok: tests.ok && typesOk, tests, types, report }
}

export const clip = (s: string, n = 6000) => (s.length > n ? s.slice(0, n / 2) + '\n[...]\n' + s.slice(-n / 2) : s)

// ---------- leftover scan (#337) ----------

export type LeftoverHit = { path: string; reason: string }

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sh', '.bash', '.zsh', '.py', '.rb', '.pl'])

export const leftoverScan = async (args: {
  cwd: string
  entries: StatusEntry[]
  mentionText: string
}): Promise<LeftoverHit[]> => {
  const { cwd, entries, mentionText } = args
  const hits: LeftoverHit[] = []
  const testGlob = new Bun.Glob(TEST_GLOB)
  const added = entries.filter((e) => !isDeleted(e) && (isUntracked(e) || e.x === 'A'))
  const live = entries.filter((e) => !isDeleted(e))
  for (const e of live) {
    const base = basename(e.path)
    if (base === '.DS_Store') hits.push({ path: e.path, reason: 'tool leftover (.DS_Store)' })
    else if (/\.(log|orig|rej|bak|swp|swo|tmp|temp)$/i.test(base) || base.endsWith('~'))
      hits.push({ path: e.path, reason: 'temp file or tool leftover' })
    else if (/^(tmp|temp|scratch|scratchpad|debug|notes?|todo)([-_.]|$)/i.test(base))
      hits.push({ path: e.path, reason: 'scratch file' })
    else if (/^junit.*\.xml$/i.test(base) || e.path.startsWith('coverage/'))
      hits.push({ path: e.path, reason: 'test tool output' })
  }
  for (const e of added) {
    const base = basename(e.path)
    if (extname(base).toLowerCase() === '.md' && !mentionText.includes(base))
      hits.push({ path: e.path, reason: 'new markdown file the ticket and spec do not name' })
  }
  const newCode = added.filter((e) => CODE_EXT.has(extname(e.path).toLowerCase()) && !testGlob.match(e.path))
  for (const e of newCode) {
    const stem = basename(e.path).replace(/\.[^.]+$/, '')
    if (stem === 'index') continue
    const trackedRefs = (await git(cwd, ['grep', '-l', '-F', stem, '--', '.'])).stdout
      .split('\n')
      .filter((f) => f && f !== e.path)
    const newRefs = added
      .filter((o) => o.path !== e.path && existsSync(join(cwd, o.path)))
      .filter((o) => readFileSync(join(cwd, o.path), 'utf8').includes(stem))
    if (trackedRefs.length === 0 && newRefs.length === 0)
      hits.push({ path: e.path, reason: 'new script or module that nothing uses' })
  }
  return hits
}

// ---------- role rules for the backstop ----------

export type RoleName = 'test-writer' | 'implementer' | 'ticket-reviewer' | 'probe'

export const rolePathViolations = (role: RoleName, paths: string[]) => {
  const glob = new Bun.Glob(TEST_GLOB)
  if (role === 'test-writer') return paths.filter((p) => !glob.match(p))
  if (role === 'implementer') return paths.filter((p) => glob.match(p))
  if (role === 'ticket-reviewer') return paths
  return []
}

// ---------- secret scan ----------

const SECRET_PATTERNS: [string, RegExp][] = [
  ['anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['openai key', /sk-(proj-)?[A-Za-z0-9]{20,}/],
  ['github token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
  ['github pat', /github_pat_[A-Za-z0-9_]{20,}/],
  ['bearer token', /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/],
  ['authorization header value', /"Authorization"\s*:\s*"[^"]{8,}"/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

export const secretScan = (file: string) => {
  const text = readFileSync(file, 'utf8')
  const hits: string[] = []
  for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(label)
  return hits
}
