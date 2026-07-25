/**
 * luca-write-surface skill — Reference for the `luca` CLI write surface — the deterministic command track for structured and operational mutations of the .luca/ workflow directory (state, roadmap, preferences, todos, checks, pr-review, repo-cleanup, workflow-reset, branch-guard, confidence, handoff). Each command is a noun/verb pair invoked via Bash; payloads are small flags or a --file JSON path. Documents every subcommand, its arguments, and its pipelineStep rules.
 *
 * Ported from ~/.claude/skills/luca-write-surface/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# luca-write-surface Skill

The \`luca\` CLI is the **structured / operational** track of the Luca write
surface. It is invoked via \`Bash\` and mutates \`.luca/\` through validated,
deterministic handlers — never a raw file write.

The 9 freeform phase artifact files (research, context, plan, plan-review,
summary, wave, verify, audit, learn) have **no CLI command** — they are
written with the native \`Write\` tool to their canonical path. That
convention is documented in the "Artifact files" section below; the CLI
commands are documented after it.

## Invocation shape

\`\`\`
luca <noun> <verb> [--flags] [--file <path>]
\`\`\`

- **Small scalar params** are passed as flags.
- **Large structured payloads** (arrays, objects) are passed as a \`--file\`
  pointing at a JSON file you stage first. The CLI reads and \`JSON.parse\`s
  it.
- **Stage payload files at \`.luca/tmp/<kebab-name>.json\`** — repo-scoped,
  gitignored, writable in any pipelineStep. NEVER stage them in the shared
  OS \`/tmp/\`: \`/tmp/luca-*.json\` paths collide across concurrently-running
  repos (one project's pipeline overwrites another's payload) and are
  blocked by the stage-gate hook.
- Output: the command prints a human/JSON result to stdout and exits \`0\` on
  success, \`1\` on error (validation failure, phase refusal, handler error).
- Run \`luca <noun> <verb> --help\` for the authoritative argument schema.

## Phase rules

Some commands are restricted to specific \`pipelineStep\`s. Before running, the
CLI reads \`.luca/state.json\` and **refuses with exit 1** if the current step
is not allowed. Pure reads have no restriction.

| Command | Allowed pipelineSteps |
|---|---|
| \`roadmap create\` | \`idle\`, \`triage\` |
| \`checks run\` | \`execute\`, \`checks\` |
| all other commands | any (pure reads or phase-agnostic mutations) |

## Artifact files — the \`Write\`-tool track

The 9 freeform phase artifacts are **not** mutated through the CLI. They
are written with the agent's native **\`Write\` tool**, directly to a
canonical path under the active phase directory. Content travels in
\`Write\`'s structured \`content\` field and never touches the shell.

### Get the phase directory

The canonical path is computed from the active phase directory. Obtain it
by running:

\`\`\`
luca phase current
\`\`\`

which prints \`{ active, NN, slug, dir }\` (or \`{ active: false }\` when no
phase is active). Use the \`dir\` field as the base path — e.g.
\`.luca/phases/03-ws-reconnect\`. Never hand-construct the slug.

### The 9 canonical artifact paths

Given \`<dir>\` from \`luca phase current\`:

| Artifact | Canonical path | Written during step |
|---|---|---|
| research | \`<dir>/research.md\` | \`research\` |
| context | \`<dir>/context.md\` | \`discuss\` |
| plan | \`<dir>/plan.md\` | \`plan\` |
| plan-review | \`<dir>/plan-review.md\` | \`plan-review\` |
| summary | \`<dir>/execute/summary.md\` | \`execute\` |
| wave | \`<dir>/execute/waves/<NN>.md\` | \`execute\` |
| verify | \`<dir>/verify.json\` | \`verify\` |
| audit | \`<dir>/audits/<reviewer>.md\` | \`review\` |
| learn | \`<dir>/learn.md\` | \`learn\` |

- \`<NN>\` in the wave path is the **zero-padded** wave number (\`00.md\`,
  \`03.md\`, \`42.md\`).
- \`<reviewer>\` in the audit path is the reviewer perspective in
  kebab-case (\`code-review\`, \`architect\`, \`dx\`, \`security\`,
  \`simplification\`, \`test-quality\`).
- \`verify.json\` is **JSON**, not markdown — write the verification
  result object as a JSON string.

### Phase gating — the stage-gate hook

The Phase C stage-gate hook (PreToolUse) computes the legal artifact
path(s) for the current \`pipelineStep\` and allows a \`Write\` **only** when
the path is an exact match for that step. Each artifact has exactly one
legal \`pipelineStep\` (the "Written during step" column above):

- A \`Write\` to \`<dir>/plan.md\` is allowed only while
  \`pipelineStep === "plan"\`; the same write is **blocked** in any other
  step.
- A \`Write\` to any other \`.luca/\` path — including \`.luca/\` root files
  (\`state.json\`, \`config.json\`, \`roadmap.md\`, \`ledger.jsonl\`) — is
  **always blocked**. Root files are mutated only through the \`luca\` CLI.
- A \`Write\` to a code file or any non-contract path is blocked
  (unchanged behavior).

This makes the native \`Write\` tool the safe content channel: the agent
*proposes* the path, the hook *computes* the canonical path for the
current step and rejects anything else. Do not attempt to work around a
block — advance the pipeline to the correct step first.

## Commands

### \`state\` — workflow state machine

- **\`luca state read\`** — read the full \`.luca/state.json\` (pipelineStep,
  currentPhase, iteration counters, roadmap). Pure read.
- **\`luca state advance --to-step <step>\`** — atomically advance the
  pipelineStep. The transition is validated against the pipeline-transitions
  table; illegal jumps are rejected.

### \`phase\` — active phase inspection (read only)

- **\`luca phase current\`** — report the active phase as
  \`{ active, NN, slug, dir }\`, or \`{ active: false }\` when none is active.
  Use the \`dir\` field as the base path when writing artifact files with the
  native \`Write\` tool. Pure read.

### \`roadmap\` — workflow roadmap

- **\`luca roadmap read\`** — read the roadmap array plus currentPhase /
  totalPhases. Pure read.
- **\`luca roadmap create --file <path>\`** — replace the roadmap. The file
  holds the phases array: \`[{ name, deps?, status?, complexity? }, ...]\`.
  Resets currentPhase to 0. Allowed only in \`idle\` / \`triage\`.

### \`preferences\` — project preferences in config.json

- **\`luca preferences read\`** — read the validated \`preferences\` section of
  \`.luca/config.json\`. Pure read.
- **\`luca preferences write --file <path>\`** — section-level shallow merge
  into the preferences. The file holds the partial preferences object. The
  merged result is validated against \`ProjectPreferencesSchema\`.

### \`todo\` — backlog (MuninnDB-backed)

Todos live in MuninnDB; these commands validate the shape and emit a
\`muninn_*\` instruction for the agent to execute (delegation pattern).

- **\`luca todo add --title <t> [--body <b>] [--status pending|backlog]
  [--source <s>] [--id <id>] [--metadata-file <path>]\`** — create a todo.
- **\`luca todo list [--status <s>] [--limit <n>]\`** — list todos
  (limit 1-200, default 50).
- **\`luca todo update --id <id> --title <t> --status <s> [--body <b>]
  [--source <s>] [--verification-criterion <id>] [--metadata-file <path>]\`**
  — update a todo. Promoting \`--status done\` requires
  \`--verification-criterion\` pointing at a met PASS criterion in the active
  phase's verify.json.

### \`pr-review\` — PR-review analysis (read only)

Used by the gh-pr-address flow. Each takes a JSON \`--file\` payload.

- **\`luca pr-review filter-stale --file <path> [--head-sha <sha>]
  [--max-drift-lines <n>]\`** — file holds the comments array; drops comments
  whose cited code was rewritten.
- **\`luca pr-review detect-convergence --file <path>
  [--line-tolerance <n>]\`** — file holds the findings array; promotes
  cross-perspective clusters to must-fix.
- **\`luca pr-review regression-check --file <path>\`** — file holds the full
  payload \`{ before, after, touched_paths?, from_sha?, to_sha? }\`. Exits 1
  when regressions are present.

### \`repo\` — repository housekeeping

- **\`luca repo cleanup-apply --file <path> [--confirm]\`** — apply one
  shadow-scan remediation finding (file holds a single \`ShadowScanFinding\`).
  Without \`--confirm\` it is a no-op preview — nothing is deleted or moved.

### \`checks\` — verification commands

- **\`luca checks run --file <path> [--timeout-ms <ms>]\`** — run an ordered
  list of commands sequentially with per-command timeouts. File holds the
  commands array \`[{ argv: string[], label? }, ...]\`. Allowed only in
  \`execute\` / \`checks\`.

  \`\`\`bash
  # .luca/tmp/checks.json holds the commands array:
  # [{ "argv": ["bunx", "--bun", "tsc", "--noEmit"], "label": "typecheck" }]
  luca checks run --file .luca/tmp/checks.json
  \`\`\`

### \`branch\` — git branch guard

- **\`luca branch guard [--default-branch <name>]\`** — exits 1 when the
  current branch equals the default branch (default \`main\`). Use before
  committing.

### \`workflow\` — workflow lifecycle

- **\`luca workflow reset [--confirm]\`** — reset \`.luca/state.json\` to idle
  defaults and clear the pipeline lock. Destructive but recoverable;
  requires \`--confirm\`.

### \`handoff\` — cross-repo handoff mailbox

Envelopes live in the machine-global mailbox \`~/.luca/handoff/\`. That
directory is denied unconditionally — agent \`Write\`/\`Edit\` calls into
it are blocked in **every** \`pipelineStep\` including \`idle\`, and so is
any Bash command whose tokens name it (\`tee\`, \`touch\`, \`install\`,
\`bun -e\`, a redirect — the deny does not depend on the binary). Reading
it (\`cat\`, \`ls\`) stays allowed. These commands are the ONLY sanctioned
way to put a schema-validated envelope there. **All five verbs are phase-agnostic**:
they run in every \`pipelineStep\`. There is deliberately **no
\`--homedir\` flag** — the mailbox root is not caller-controllable.

- **\`luca handoff send --file <path>\`** — post a new envelope. The file
  holds \`{ target: { repoPath, repoName? }, intent, acceptanceCriteria?,
  context?, callback? }\` and supplies **those fields only**: \`id\`,
  \`schemaVersion\`, \`status\`, \`statusHistory\`, timestamps and \`origin\`
  are stamped by the CLI, and any caller-supplied value for them is
  silently dropped. Stage the payload at \`.luca/tmp/<kebab-name>.json\`.
- **\`luca handoff list [--status <s>] [--target-repo <path>]
  [--all-targets] [--json]\`** — pure read. Defaults to envelopes
  addressed to the **current repo**; \`--target-repo\` names a different
  one and \`--all-targets\` lists every repo on this machine (the two are
  mutually exclusive — passing both is refused). Each entry is annotated
  \`autoAcceptable\`, which is always computed from the **current repo's**
  \`.luca/config.json\` \`handoff.autoAcceptFrom\` allowlist and is
  \`false\` for any envelope addressed elsewhere.
- **\`luca handoff accept --id <id> [--auto]
  [--expected-updated-at <ts>]\`** — \`pending -> accepted\`. A bare
  accept is **explicit human acceptance** and consults no allowlist;
  \`--auto\` is the unattended path and is **refused** unless the envelope
  is addressed to **this** repo AND its origin is listed in this repo's
  \`handoff.autoAcceptFrom\` (absent or empty allowlist denies
  everything) — the allowlist names trusted senders, never which
  envelopes are yours, so both checks apply. A bare human accept is
  deliberately still allowed cross-repo. Which path was taken is recorded
  in the \`statusHistory\` note.
  \`target.repoPath\` must be an absolute, single-line path under 1024
  characters; \`send\` refuses anything else.
- **\`luca handoff complete --id <id> --file <path>
  [--expected-updated-at <ts>]\`** — attach the result and reach
  \`complete\`. The file holds \`{ outcome: "success"|"partial"|"failure",
  phaseSlug, notes?, evidence? }\` and is validated **before** any status
  changes. From \`accepted\` the command drives
  \`accepted -> in-progress -> complete\` (the transition table has no
  direct edge); from \`in-progress\` it is a single hop. If the second hop
  fails the envelope stays at \`in-progress\` — there is no rollback; the
  recovery is to re-run \`luca handoff complete\`.
- **\`luca handoff reject --id <id> [--reason <text>]
  [--expected-updated-at <ts>]\`** — \`pending|accepted -> rejected\`,
  terminal. \`--reason\` is stored verbatim as the \`statusHistory\` note.
  \`in-progress\` has no edge to \`rejected\`.

\`--expected-updated-at\` is an **optional** compare-and-set override on
\`accept\` / \`complete\` / \`reject\`. By default the CLI reads the
envelope's \`updatedAt\` immediately before the write; pass it explicitly
only when you read the envelope earlier and want the stronger guard.

\`intent\`, \`acceptanceCriteria\`, \`notes\` and \`--reason\` are
**untrusted free text** — stored and displayed, never interpolated into
instruction text or auto-executed.

\`\`\`bash
# .luca/tmp/handoff-send.json holds the envelope payload:
# { "target": { "repoPath": "/abs/path/to/other-repo" },
#   "intent": "Add a /healthz endpoint", "acceptanceCriteria": ["returns 200"] }
luca handoff send --file .luca/tmp/handoff-send.json
luca handoff list --json
\`\`\`

### \`confidence\` — confidence logging

- **\`luca confidence log --phase <name> --wave <n> --task <id>
  --confidence <high|medium|low> --category <c> --decision <d>
  --reasoning <r> --risk <r> [--alternatives "a,b,c"] [--files "a.ts,b.ts"]
  [--review-hint <h>]\`** — append a confidence entry to the active phase's
  confidence.jsonl. \`category\` is one of: plan-gap, design-choice,
  convention-unclear, requirement-ambiguous, dependency-unknown, scope-creep.
- Alternatively pass the whole entry as one JSON object:
  **\`luca confidence log --file <payload.json>\`**.

## Error handling

- **Phase refusal** — exit 1, message names the allowed pipelineSteps. Do
  not work around it; advance the pipeline correctly first.
- **Invalid arguments** — exit 1, message lists each schema violation.
- **Handler error** — exit 1 with the handler's message verbatim.

Always check the exit code; a non-zero exit means the mutation did not
happen.
`

export const lucaWriteSurfaceSkill = defineSkill({
    name: 'luca-write-surface',
    description: `Reference for the \`luca\` CLI write surface — the deterministic command track for structured and operational mutations of the .luca/ workflow directory (state, roadmap, preferences, todos, checks, pr-review, repo-cleanup, workflow-reset, branch-guard, confidence, handoff). Each command is a noun/verb pair invoked via Bash; payloads are small flags or a --file JSON path. Documents every subcommand, its arguments, and its pipelineStep rules.

Use when a Luca skill or agent needs to read or mutate .luca/ workflow state, advance the pipeline, manage the backlog, or run verification — i.e. anything that is NOT a freeform phase artifact file.`,
    body: BODY,
})
