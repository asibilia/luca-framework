/**
 * PROTOTYPE (tracer bullet, #334). Remove every tracer worktree under /tmp/luca-tracer and its
 * local run branch. Journals stay. A branch that exists on origin keeps its remote copy.
 *
 *   bun prototypes/tracer-bullet/cleanup.ts
 */
import { TMP_ROOT } from './lib/config'
import { git, hostRepo } from './lib/git'

const list = (await git(hostRepo, ['worktree', 'list', '--porcelain'])).stdout
const entries = list
  .split('\n\n')
  .map((block) => ({
    path: /^worktree (.+)$/m.exec(block)?.[1] ?? '',
    branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '',
  }))
  .filter((e) => e.path.startsWith(`${TMP_ROOT}/`))

for (const e of entries) {
  const removed = await git(hostRepo, ['worktree', 'remove', '--force', e.path])
  console.log(`worktree remove ${e.path}: exit ${removed.exitCode} ${removed.stderr.trim()}`)
  if (e.branch.startsWith('luca/tracer-')) {
    const deleted = await git(hostRepo, ['branch', '-D', e.branch])
    console.log(`branch -D ${e.branch}: exit ${deleted.exitCode} ${deleted.stdout.trim()} ${deleted.stderr.trim()}`)
  }
}
const pruned = await git(hostRepo, ['worktree', 'prune'])
console.log(`worktree prune: exit ${pruned.exitCode}`)
const left = (await git(hostRepo, ['branch', '--list', 'luca/tracer-*'])).stdout.trim()
console.log(left ? `local tracer branches left:\n${left}` : 'no local tracer branches left')
