/**
 * PROTOTYPE (tracer bullet, #334). Git and GitHub side effects. Only the engine calls these.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { PROTO_DIR, TMP_ROOT } from './config'
import { run, runOk, type ShellResult } from './shell'

export const git = (cwd: string, args: string[], timeoutMs = 120_000) => run(['git', ...args], { cwd, timeoutMs })
export const gitOk = (cwd: string, args: string[], timeoutMs = 120_000) => runOk(['git', ...args], { cwd, timeoutMs })
export const gh = (args: string[]) => runOk(['gh', ...args], { cwd: PROTO_DIR, timeoutMs: 120_000 })
export const ghJson = async <T>(args: string[]): Promise<T> => JSON.parse((await gh(args)).stdout) as T

/** The repo this prototype lives in (a linked worktree of the main checkout). */
export const hostRepo = PROTO_DIR

export const commonGitDir = async (cwd: string) =>
  (await gitOk(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).stdout.trim()

export type RunWorktree = { runDir: string; path: string; branch: string; base: string; baseSha: string; commonGitDir: string }

/** Engine-made worktree outside this checkout, on a run branch from origin/main. */
export const createRunWorktree = async (runId: string, branch: string): Promise<RunWorktree> => {
  const runDir = join(TMP_ROOT, runId)
  mkdirSync(runDir, { recursive: true })
  const path = join(runDir, 'wt')
  await gitOk(hostRepo, ['fetch', 'origin', 'main'])
  await gitOk(hostRepo, ['worktree', 'add', '--no-track', '-b', branch, path, 'origin/main'])
  const baseSha = (await gitOk(path, ['rev-parse', 'HEAD'])).stdout.trim()
  return { runDir, path, branch, base: 'origin/main', baseSha, commonGitDir: await commonGitDir(path) }
}

export const removeRunWorktree = async (wt: { path: string; branch: string }, deleteBranch: boolean) => {
  const results: ShellResult[] = []
  if (existsSync(wt.path)) results.push(await git(hostRepo, ['worktree', 'remove', '--force', wt.path]))
  results.push(await git(hostRepo, ['worktree', 'prune']))
  if (deleteBranch) results.push(await git(hostRepo, ['branch', '-D', wt.branch]))
  return results
}

export type StatusEntry = { x: string; y: string; path: string; origPath?: string }

/** Parse `git status --porcelain=v1 -z --untracked-files=all`. */
export const statusEntries = async (cwd: string): Promise<StatusEntry[]> => {
  const out = (await gitOk(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout
  const parts = out.split('\0').filter((p) => p.length > 0)
  const entries: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? ''
    const x = part[0] ?? ' '
    const y = part[1] ?? ' '
    const path = part.slice(3)
    if (x === 'R' || x === 'C') {
      entries.push({ x, y, path, origPath: parts[i + 1] })
      i++
    } else entries.push({ x, y, path })
  }
  return entries
}

export const isDeleted = (e: StatusEntry) => e.x === 'D' || e.y === 'D'
export const isUntracked = (e: StatusEntry) => e.x === '?'

/** path -> content hash (or "<deleted>") for every changed path in the worktree. */
export const fileStates = async (cwd: string): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  for (const e of await statusEntries(cwd)) {
    const full = join(cwd, e.path)
    if (!existsSync(full)) map.set(e.path, '<deleted>')
    else map.set(e.path, Bun.hash(readFileSync(full)).toString(16))
    if (e.origPath) map.set(e.origPath, '<renamed-away>')
  }
  return map
}

export const deltaPaths = (before: Map<string, string>, after: Map<string, string>) => {
  const paths = new Set<string>()
  for (const [p, h] of after) if (before.get(p) !== h) paths.add(p)
  for (const p of before.keys()) if (!after.has(p)) paths.add(p)
  return [...paths].sort()
}

export type GitState = {
  branch: string
  head: string
  branchRef: string
  refsAtHead: string[]
  stash: string[]
  worktrees: string[]
  staged: string
  configHash: string
  hooksListing: string
}

/** Everything an agent must never change (backstop, #347). */
export const gitState = async (wt: RunWorktree): Promise<GitState> => {
  const head = (await gitOk(wt.path, ['rev-parse', 'HEAD'])).stdout.trim()
  const branchRef = (await git(wt.path, ['rev-parse', `refs/heads/${wt.branch}`])).stdout.trim()
  const refs = (await gitOk(wt.path, ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags'])).stdout
  // Other sessions share this repo's refs, so only refs pointing at the run's HEAD are attributable to an agent.
  const refsAtHead = refs
    .split('\n')
    .filter((l) => l.endsWith(` ${head}`))
    .map((l) => l.split(' ')[0] ?? '')
    .filter((r) => r !== `refs/heads/${wt.branch}`)
    .sort()
  // The stash stack is shared too; only entries made on the run branch count.
  const stash = (await git(wt.path, ['stash', 'list', '--format=%H %gs'])).stdout
    .split('\n')
    .filter((l) => l.includes(wt.branch))
  const worktrees = (await gitOk(wt.path, ['worktree', 'list', '--porcelain'])).stdout
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length))
  const staged = (await gitOk(wt.path, ['diff', '--cached', '--name-only'])).stdout.trim()
  const configPath = join(wt.commonGitDir, 'config')
  const configHash = existsSync(configPath) ? Bun.hash(readFileSync(configPath)).toString(16) : 'missing'
  // Names, modes, and content hashes only. (`ls -la` also listed `..`, the shared .git dir, whose
  // mtime moves on any write to .git, so the backstop flagged a reviewer that wrote nothing.)
  const hooksDir = join(wt.commonGitDir, 'hooks')
  const hooksListing = existsSync(hooksDir)
    ? readdirSync(hooksDir)
        .sort()
        .map((n) => {
          const p = join(hooksDir, n)
          const st = statSync(p)
          return `${n} ${st.mode.toString(8)} ${st.isFile() ? Bun.hash(readFileSync(p)).toString(16) : 'dir'}`
        })
        .join('\n')
    : 'missing'
  return { branch: wt.branch, head, branchRef, refsAtHead, stash, worktrees, staged, configHash, hooksListing }
}

export const compareGitState = (before: GitState, after: GitState): string[] => {
  const problems: string[] = []
  if (before.head !== after.head) problems.push(`HEAD moved ${before.head} -> ${after.head}`)
  if (before.branchRef !== after.branchRef) problems.push(`run branch moved ${before.branchRef} -> ${after.branchRef}`)
  const newRefs = after.refsAtHead.filter((r) => !before.refsAtHead.includes(r))
  if (newRefs.length) problems.push(`new refs at the run HEAD: ${newRefs.join(', ')}`)
  const newStash = after.stash.filter((s) => !before.stash.includes(s))
  if (newStash.length) problems.push(`new stash entries: ${newStash.join(' | ')}`)
  // Other sessions add worktrees elsewhere; an agent could only write under its cwd or a temp dir.
  const newWorktrees = after.worktrees.filter(
    (w) => !before.worktrees.includes(w) && /^(\/private)?\/(tmp|var\/folders)\//.test(w),
  )
  if (newWorktrees.length) problems.push(`new worktrees: ${newWorktrees.join(', ')}`)
  if (after.staged) problems.push(`staged files in the index: ${after.staged}`)
  if (before.configHash !== after.configHash) problems.push('shared .git/config changed')
  if (before.hooksListing !== after.hooksListing) problems.push('shared .git/hooks changed')
  return problems
}

/** Restore paths an agent was not allowed to touch. */
export const revertPaths = async (cwd: string, paths: string[]) => {
  const done: string[] = []
  for (const p of paths) {
    const tracked = (await git(cwd, ['cat-file', '-e', `HEAD:${p}`])).exitCode === 0
    if (tracked) await gitOk(cwd, ['checkout', 'HEAD', '--', p])
    else await run(['rm', '-rf', '--', p], { cwd })
    done.push(`${tracked ? 'restored' : 'removed'} ${p}`)
  }
  return done
}

export const engineCommit = async (cwd: string, subject: string, body: string, runId: string) => {
  await gitOk(cwd, ['add', '-A'])
  const message = `${subject}\n\n${body}\n\nLuca-Run: ${runId} (PROTOTYPE tracer bullet, #334)\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  await gitOk(cwd, ['commit', '-m', message])
  const sha = (await gitOk(cwd, ['rev-parse', 'HEAD'])).stdout.trim()
  const files = (await gitOk(cwd, ['show', '--name-status', '--format=', sha])).stdout.trim()
  return { sha, subject, files }
}
