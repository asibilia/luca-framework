# Git & CLI Tooling — Technical Reference

Research date: 2026-03-31

## 1. GitHub CLI (gh)

### Installed Version

- **gh 2.88.1** (2026-03-12)
- Docs: https://cli.github.com/manual
- Releases: https://github.com/cli/cli/releases

### v2.88 Notable Features

- Copilot code review as a reviewer (`--add-reviewer @copilot`)
- `gh issue create` supports `--assignee "@copilot"`
- `gh pr diff --exclude` to filter files from diff output
- `gh pr view/list` gains `changeType` field in `--json files` output
- Search-based reviewer/assignee selection (performance improvement for large orgs)
- Close issues as duplicates: `gh issue close --duplicate-of <number|url>`
- `gh repo clone --no-upstream`
- `gh agent-task list|view --json` support

### `gh issue create` — Current Flags

```
-a, --assignee login       Assign people (@me, @copilot)
-b, --body string          Body text
-F, --body-file file       Body from file (- for stdin)
-e, --editor               Open editor for title+body
-l, --label name           Labels (repeatable)
-m, --milestone name       Milestone by name
-p, --project title        Project by title
-T, --template name        Issue template name
-t, --title string         Title
-w, --web                  Open browser
-R, --repo [HOST/]OWNER/REPO
    --recover string       Recover from failed run
```

### `gh pr create` — Current Flags

```
-a, --assignee login       Assignees
-B, --base branch          Target branch
-b, --body string          Body text
-F, --body-file file       Body from file
-d, --draft                Mark as draft
    --dry-run              Print without creating
-e, --editor               Open editor
-f, --fill                 Auto-fill from commits
    --fill-first           Use first commit only
    --fill-verbose         Use commit msg+body
-H, --head branch          Source branch (default: current)
-l, --label name           Labels
-m, --milestone name       Milestone
    --no-maintainer-edit   Disable maintainer edits
-p, --project title        Project
    --recover string       Recover from failed run
-r, --reviewer handle      Reviewers (repeatable)
-T, --template file        PR template file
-t, --title string         Title
-w, --web                  Open browser
-R, --repo [HOST/]OWNER/REPO
```

Note: `gh pr create` does NOT support `--json` output. It prints the PR URL to stdout on success. To get structured output, use `gh pr view <number> --json <fields>` after creation.

### `gh api` — Programmatic Access

```
gh api <endpoint> [flags]
```

Key flags:
- `-F key=value` — Typed parameters (magic type conversion: true/false/null/int)
- `-f key=value` — Raw string parameters
- `-X METHOD` — HTTP method (default GET, POST if params added)
- `-q jq-expr` — Filter output with jq
- `--paginate` — Follow pagination
- `--slurp` — Wrap paginated results in array
- `--input file` — Request body from file
- `-H key:value` — Custom headers
- `--cache duration` — Cache responses

Placeholders: `{owner}`, `{repo}`, `{branch}` auto-resolve from current repo.

### `gh pr view/list` JSON Fields

```
additions, assignees, author, autoMergeRequest, baseRefName, body,
changedFiles, closed, closedAt, closingIssuesReferences, comments,
commits, createdAt, deletions, files, headRefName, headRefOid,
headRepository, headRepositoryOwner, id, isCrossRepository, isDraft,
labels, latestReviews, maintainerCanModify, mergeCommit,
mergeStateStatus, mergeable, mergedAt, mergedBy, milestone, number,
potentialMergeCommit, projectCards, projectItems, reactionGroups,
reviewDecision, reviewRequests, reviews, state, statusCheckRollup,
title, updatedAt, url
```

---

## 2. Git Diff for Drift Detection

### Installed Version

- **git 2.53.0**
- Docs: https://git-scm.com/docs/git-diff

### Key Patterns for Per-Phase Drift Detection

**List changed files between two commits:**

```bash
git diff --name-only <commit-A> <commit-B>
```

**List changed files with status (Added/Modified/Deleted):**

```bash
git diff --name-status <commit-A> <commit-B>
# Output: M  src/foo.ts
#         A  src/bar.ts
#         D  src/old.ts
```

**Restrict to specific paths:**

```bash
git diff --name-only <commit-A> <commit-B> -- src/ packages/
```

**Statistics (insertions/deletions per file):**

```bash
git diff --stat <commit-A> <commit-B>
```

**Changes since branch diverged from main:**

```bash
git diff --name-only main...HEAD
# Three-dot syntax: changes since merge-base
```

**Merge-base explicitly:**

```bash
git diff --name-only $(git merge-base main HEAD) HEAD
```

**Combined: changed files since phase start commit:**

```bash
PHASE_START_COMMIT=$(git log --format=%H --grep="phase-${N}" --reverse | head -1)
git diff --name-only ${PHASE_START_COMMIT} HEAD
```

### Programmatic Git from TypeScript/Bun

**Option A: Bun Shell (`Bun.$`)**

```typescript
import { $ } from 'bun'

const result = await $`git diff --name-only main...HEAD`.text()
const changedFiles = result.trim().split('\n').filter(Boolean)
```

Caveat: Known issue with `git show` hanging in Bun Shell (oven-sh/bun#26580). Use `Bun.spawn` or `node:child_process` as fallback for problematic commands.

**Option B: Bun.spawn (lower-level)**

```typescript
const proc = Bun.spawn(['git', 'diff', '--name-only', 'main...HEAD'], {
  cwd: process.cwd(),
  stdout: 'pipe',
})
const output = await new Response(proc.stdout).text()
const changedFiles = output.trim().split('\n').filter(Boolean)
```

**Option C: simple-git (npm library)**

```typescript
import simpleGit from 'simple-git'

const git = simpleGit()
const diff = await git.diffSummary(['main...HEAD'])
const changedFiles = diff.files.map(f => f.file)
```

- Fully typed (TypeScript definitions bundled)
- Promise-based, method chaining
- Supports diff, log, status, branch, etc.
- npm: https://www.npmjs.com/package/simple-git

**Recommendation for Luca:** Use `Bun.$` for simple commands (diff, log, status). Fall back to `Bun.spawn` if Bun Shell hangs. Avoid adding `simple-git` dependency unless complex git operations are needed.

---

## 3. Process Management — Lock Files

### PID-Based Stale Lock Detection

**Check if PID is alive (cross-platform for macOS/Linux):**

```typescript
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)  // Signal 0 = existence check, no signal sent
    return true
  } catch {
    return false           // ESRCH = no such process
  }
}
```

- Works in both Bun and Node.js
- Signal 0 is POSIX standard; does not kill the process
- On Windows, `process.kill` with signal 0 has limited support — works but behavior may vary
- `process.pid` returns current process PID

**Lock file schema:**

```typescript
interface LockFile {
  pid: number
  started_at: string  // ISO 8601
  hostname: string
  phase_id?: number
}
```

**Stale lock detection pattern:**

```typescript
function acquireLock(lockPath: string): boolean {
  const file = Bun.file(lockPath)

  if (await file.exists()) {
    const lock = await file.json() as LockFile
    if (isPidAlive(lock.pid)) {
      return false  // Lock is held by a live process
    }
    // Stale lock — previous process died, safe to reclaim
  }

  // Write new lock atomically (write-to-temp + rename)
  const tmpPath = `${lockPath}.${process.pid}.tmp`
  const lockData: LockFile = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    hostname: os.hostname(),
  }
  await Bun.write(tmpPath, JSON.stringify(lockData))
  fs.renameSync(tmpPath, lockPath)
  return true
}
```

### Atomic File Write (Write-to-Temp + Rename)

**Pattern:**

```typescript
import { renameSync, unlinkSync } from 'node:fs'

async function atomicWrite(targetPath: string, data: string): Promise<void> {
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  try {
    await Bun.write(tmpPath, data)
    renameSync(tmpPath, targetPath)  // Atomic on same filesystem
  } catch (err) {
    try { unlinkSync(tmpPath) } catch {}  // Clean up temp on failure
    throw err
  }
}
```

**Key constraints:**
- Temp file MUST be on the same filesystem as target (rename is atomic only within same FS)
- Use `process.pid` in temp filename to avoid collisions between concurrent processes
- `Bun.write()` creates parent directories automatically
- `renameSync` (from `node:fs`) is atomic on POSIX systems
- Always clean up temp file in error path

---

## 4. JSONL Append Patterns

### Specification

- Spec: https://jsonlines.org/
- File extension: `.jsonl`
- Each line: exactly one valid JSON value, terminated by `\n` (LF, U+000A)
- No literal newlines within JSON strings (must escape as `\n`)
- Empty lines discouraged but tolerated

### Appending in Bun

**No native `Bun.file.append()` yet** (tracked: oven-sh/bun#16768). Use `node:fs` for append operations.

**Async append:**

```typescript
import { appendFile } from 'node:fs/promises'

async function appendJsonl(filePath: string, record: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify(record) + '\n'
  await appendFile(filePath, line, 'utf-8')
}
```

**Sync append (for hooks/critical paths):**

```typescript
import { appendFileSync } from 'node:fs'

function appendJsonlSync(filePath: string, record: Record<string, unknown>): void {
  const line = JSON.stringify(record) + '\n'
  appendFileSync(filePath, line, 'utf-8')
}
```

**Batch append (multiple records):**

```typescript
async function appendJsonlBatch(
  filePath: string,
  records: Record<string, unknown>[],
): Promise<void> {
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n'
  await appendFile(filePath, lines, 'utf-8')
}
```

### Reading JSONL

```typescript
async function readJsonl<T = Record<string, unknown>>(filePath: string): Promise<T[]> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return []
  const text = await file.text()
  return text
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T)
}
```

**Tail N lines (for recent entries):**

```typescript
async function tailJsonl<T>(filePath: string, n: number): Promise<T[]> {
  const all = await readJsonl<T>(filePath)
  return all.slice(-n)
}
```

### Best Practices for Append-Only Logs

1. **Always terminate with `\n`** — ensures next append starts on a new line
2. **Never rewrite the entire file** — append-only semantics prevent data loss
3. **Escape newlines in string values** — `JSON.stringify` handles this automatically
4. **Use UTF-8 encoding** — JSONL spec recommends UTF-8
5. **Compress archived logs** — use `.jsonl.gz` for historical data
6. **Include timestamps** — every record should have an ISO 8601 timestamp field
7. **Idempotency** — include unique IDs (session ID, event ID) for dedup on replay
8. **Rotation** — for high-volume logs, rotate by size or date (not needed for routing-history or session-ledger at current scale)

### Crash Safety for JSONL

JSONL is inherently crash-tolerant: a partial write corrupts at most the last line. Recovery pattern:

```typescript
function readJsonlSafe<T>(text: string): T[] {
  const results: T[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      results.push(JSON.parse(line) as T)
    } catch {
      // Skip corrupted last line (partial write from crash)
      continue
    }
  }
  return results
}
```

---

## Quick Reference: Versions

| Tool | Version | Date |
|------|---------|------|
| gh (GitHub CLI) | 2.88.1 | 2026-03-12 |
| git | 2.53.0 | — |
| Bun | 1.2.18 | — |

## Sources

- [GitHub CLI Manual](https://cli.github.com/manual)
- [GitHub CLI v2.88.0 Release](https://github.com/cli/cli/releases/tag/v2.88.0)
- [Git Diff Documentation](https://git-scm.com/docs/git-diff)
- [Bun.write API Reference](https://bun.com/reference/bun/write)
- [Bun Shell Documentation](https://bun.com/docs/runtime/shell)
- [Bun appendFile Reference](https://bun.com/reference/node/fs/promises/appendFile)
- [Bun.file.append Feature Request (oven-sh/bun#16768)](https://github.com/oven-sh/bun/issues/16768)
- [Bun Shell git show hang (oven-sh/bun#26580)](https://github.com/oven-sh/bun/issues/26580)
- [Node.js process.kill Documentation](https://nodejs.org/api/process.html)
- [JSON Lines Specification](https://jsonlines.org/)
- [simple-git npm package](https://www.npmjs.com/package/simple-git)
- [Atomic File Write Pattern (GitHub Gist)](https://gist.github.com/datenwolf/a8f5d194b268659e3d37)
