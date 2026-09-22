/**
 * todo-ingest skill — research → plan → parallel review → atomic todos.
 *
 * Ingests a raw batch of task ideas and produces a reviewed,
 * dependency-linked backlog that an execution workflow can pick up cold.
 *
 * Design notes (validated by an A/B eval, 3 cases × with/without skill):
 * - The two stage barriers (research→plan, review→deconstruct) are the
 *   load-bearing part. Both were crossed early in unaided runs, and
 *   persisted todos are write-once in practice (`luca todo update` is
 *   full-replace; `muninn_evolve` orphans tree children), so a late
 *   finding can only be bolted on as a sibling.
 * - Premise validation leads the research output: a meaningful fraction
 *   of user-listed tasks turn out to be already-fixed or aimed at the
 *   wrong file, and a backlog built on a false premise gets built.
 * - Reviewers share no context with the orchestrator, so the plan text
 *   must be inlined into each reviewer prompt; a reviewer that
 *   reconstructs the plan has reviewed a guess.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>

# Todo Ingest

Convert a raw batch of task ideas into a backlog that an execution workflow can pick up
cold — with the research already done, the plan already stress-tested, and the
dependencies already mapped.

**Arguments:** the task list (inline in the user's message, or a path/issue reference).

\`\`\`
0. INTAKE      → normalized task inventory, confirmed count
1. RESEARCH    → parallel investigation per task; validate the premise ─┐ barrier
   ├ GATE      → one batch of clarifying questions (only if blocking)   │
2. PLAN        → comprehensive written plan, per task + cross-cutting   │
3. REVIEW      → 3 parallel reviewers stress-test the plan ─────────────┤ barrier
4. DECONSTRUCT → atomic dependency-linked todos via \`luca todo add\`     │
5. SUMMARY     → table, waves, premise corrections, assumptions
\`\`\`

**The two barriers are the load-bearing part of this skill.** Research shapes the plan;
review shapes the todos. Cross either one early and the work downstream is built on
partial information — and because persisted todos are effectively write-once (see Stage 4),
a late finding can't be folded in, only bolted on as a sibling. Both barriers get crossed
early in practice, so they're called out again at each stage.

**You are not implementing anything.** No edits to source files at any stage. If you find
yourself reaching for Edit on a file the plan mentions, stop — that's the next skill's job.

---

## Stage 0 — Intake

Normalize the user's list into a numbered inventory. Give each item a kebab-case working
slug you'll carry through every later stage, so nothing silently merges or disappears
between plan and todos.

\`\`\`
1. modal-zindex      — "modal renders behind the sticky header"        (bug)
2. auth-refresh      — "add silent token refresh"                       (feature)
3. drop-legacy-cfg   — "kill the old config loader"                     (chore)
\`\`\`

Two things to resolve before moving on:

- **Vault.** Read \`.luca/config.json\` → \`muninn.vault\`; fall back to \`LUCA_MUNINN_VAULT\`,
  then \`"default"\`. You need this for both recall and the todos.
- **Existing backlog.** Run \`luca todo list\` and execute the procedure it returns (see
  Stage 4 — the CLI hands back muninn steps rather than a list). Note near-duplicates now;
  you'll fold new detail into the existing todo at Stage 4 rather than adding a competitor.

Echo the inventory back, one line each. Keep it short — this is a checkpoint, not a report.
If an item is so vague you can't even slug it, that's the one exception to "questions come
after research": ask now, because researching the wrong thing is pure waste.

---

## Stage 1 — Research

Research **before** planning and **before** asking questions. Most of what looks like a
clarifying question ("which config loader do you mean?") is answered by the code in thirty
seconds, and asking anyway spends the user's attention on something you could have looked up.

Fan out in parallel — one investigation per task, all launched in a single message. Use the
\`Researcher\` agent type when available, \`Explore\` for pure "where does X live" sweeps,
\`general-purpose\` as fallback. Group two tasks into one agent when they touch the same
subsystem; duplicated research produces conflicting summaries.

Each investigation should come back with:

- **Premise check — put this first.** Is the thing the user believes actually true? Does the
  command they named still exist? Is the field they want already there? Is the file they
  called tangled actually tangled, measured against its siblings? Say so plainly, with
  evidence, before describing any fix.
- **Current state** — the real files, symbols, and call paths (with \`path:line\`)
- **Root cause** for bugs; **integration points** for features
- **Constraints** — tests, types, public API, config, migrations that will bite
- **Prior art** — has this pattern been solved elsewhere in the repo?
- **Unknowns** — what it could not determine, and why

Premise checking leads the list because it is the highest-value thing this stage produces and
the easiest to skip. Users write task lists from memory, at speed, and a meaningful fraction
of items turn out to be already-fixed, already-present, or aimed at the wrong file. A backlog
built on a false premise is worse than no backlog: an execution team will confidently build
it. When a premise is wrong, the real work usually still exists but has a different shape —
a removed command that four docs still tell people to run is more urgent than the migration
someone thought they wanted.

In the same message, query stored knowledge — two lookups, per the vault-routing rules:

\`\`\`
muninn_recall(vault: <repo vault>,  context: "<task area> — prior work, decisions, session context")
muninn_recall(vault: "default",     context: "<task area> — patterns, pitfalls, preferences")
\`\`\`

Merge by score. A \`pitfall:*\` hit is the highest-value result: someone already tried the
obvious approach and it didn't work. Surface those in the plan rather than quietly routing
around them.

### While the agents run

Wait. Don't start reading the same files yourself — you delegated that work, and racing your
own agents produces a worse answer than theirs plus wasted tokens. Idle time feels wasteful
and the pull to fill it is strong; resist it. Useful things you *can* do meanwhile: re-read
the user's list for items you mis-slugged, or check the backlog for near-duplicates.

**A missing completion notification is not evidence an agent failed.** Notifications are
unreliable. Before concluding an investigation is lost, go read its output or transcript
directly. Only after actually looking should you record a gap — and then say which task is
under-researched rather than letting the plan imply full coverage.

**This is the first barrier: do not begin the plan until every investigation has reported.**
A plan drafted from two of three findings gets revised by the third anyway, and the revision
is always worse than having written it right.

### Clarifying-question gate

Now — once, in one batch, via \`AskUserQuestion\` — ask what's genuinely blocking. A question
is blocking only if different answers produce materially different plans. "Should the refresh
be silent or prompt the user?" is blocking. "What should I name the helper?" is not.

If nothing is blocking, don't ask; record the judgment call as a stated assumption.

**If something is blocking and you can't get an answer** — no live user, or the question
needs thought the user hasn't given yet — don't guess and don't stall. File the decision
itself as a \`critical\` todo that blocks its dependents, and separately file any work that is
correct under *every* candidate answer so it isn't held hostage to the decision. A tracked
decision todo survives; an assumption buried in a summary scrolls away. Note which candidate
you'd pick and why, so answering it is a yes/no rather than an essay.

---

## Stage 2 — Detailed plan

Write the plan out in the conversation. It is not a file — the durable form is the todo
bodies and the memory you write at Stage 4, and a standalone plan file in \`.luca/\` would
violate the directory contract.

Per task:

\`\`\`markdown
### N. <slug> — <one-line intent>

**Premise:** confirmed, or corrected — what the user believed vs. what research found
**Current state:** what's true today, grounded in \`path:line\`
**Root cause / gap:** why the change is needed (bugs: the cause, not the symptom)
**Approach:** the change, in enough detail that someone else could implement it
**Files:** every file expected to change, and what changes in each
**Risks:** what could break, and how you'd know
**Acceptance criteria:** observable, checkable statements — not "works correctly"
**Depends on:** other slugs that must land first, or "none"
\`\`\`

Then a cross-cutting section, which is what earns the planning stage:

- **Premise corrections** — every task whose framing changed, and what it became.
- **Shared prerequisites** — refactors more than one task needs. These become their own
  todos, not a duplicated paragraph in three others.
- **Ordering / dependency graph** — what's parallelizable and what isn't.
- **Conflicts** — tasks touching the same file incompatibly. Name them here or the execution
  team meets them as merge pain.
- **Discovered adjacent work** — real problems research surfaced that the user didn't ask
  about. Keep them; label them.
- **Assumptions** — every judgment call you made instead of asking.

Write acceptance criteria as though you'll be graded on them, because you will: they become
each todo's verification hook, and \`luca todo update --status done\` requires a met criterion
in verify.json. Also make sure each one is *observable at the layer it names* — "omitting the
flag doesn't drop the field" is unfalsifiable if the CLI never sees prior state, and needs
restating as an assertion on the emitted procedure. Criteria that can't be checked produce
todos that can never honestly be closed.

If any \`path:line\` citation came from a dirty worktree, say so — line numbers measured against
uncommitted changes won't match HEAD.

---

## Stage 3 — Parallel plan review

Decomposition bakes the plan into N persistent todos. A flaw caught here costs one revision;
the same flaw caught later costs N corrections plus whatever was built on top.

Spawn three reviewers **in a single message** so they run concurrently and independently.

| Lens | Agent | Charge |
|------|-------|--------|
| Completeness / feasibility | \`Plan Reviewer\` | Are steps missing? Are acceptance criteria checkable? Is sequencing sound? |
| Codebase grounding | \`Researcher\` or \`Code Reviewer\` | Do the cited files, symbols, and call paths exist and behave as claimed? |
| Adversarial | \`Adversarial Debater\` (CHALLENGE) | What breaks? What did this not consider? Where is it fixing a symptom? |

**Paste the full plan text into every reviewer's prompt.** Reviewers share none of your
context — the plan exists only in this conversation, and there is no file for them to open.
A reviewer that can't find it will hunt the repo, find a stale unrelated \`plan.md\`, and review
that instead, silently. If a reviewer reports that it reconstructed the plan from your prompt,
its findings are about a guess: re-run that lens with the text inlined rather than triaging
what it returned. Ask each for findings as
\`severity (blocking | should-fix | nit) — claim — evidence — suggested change\`.

**This is the second barrier: wait for all three before decomposing.** A late adversarial
finding can't reshape a todo you already wrote — todos are write-once in practice (Stage 4) —
so it degrades into a bolted-on sibling that its dependents don't mention by name.

If a lens genuinely never returns after you've checked its output directly, proceed and say
which lens is missing. Two-lens coverage honestly reported beats three-lens coverage implied.

Triage:

- **Blocking** — revise before continuing.
- **Should-fix** — apply unless you can articulate why the reviewer is wrong.
- **Nit** — note in the summary, don't churn the plan.
- **Two or more reviewers independently flagging the same thing** — treat as blocking
  regardless of the severity each assigned. Convergence from independent lenses is the
  strongest signal available here.

Reviewers are sometimes confidently wrong about code they only sampled. When a finding
contradicts what you verified in Stage 1, check the specific claim rather than deferring —
and note that a second reviewer refuting the first is strong grounds to reject. Say plainly
in the summary which findings you rejected and why; a silently discarded blocking finding is
how bad plans survive review.

The best outcome available here is **deleting a planned todo** because review showed the
problem wasn't real. Take it when you get it.

---

## Stage 4 — Deconstruct into todos

Split each planned task into independently-verifiable units. Split when the plan shows
multiple pieces that could be verified and finished separately, or when a shared prerequisite
is holding up more than one task. Don't split a two-line fix into ceremony — "add the missing
null check" is a complete todo. Fewer, well-scoped todos beat many thin ones; if you're
producing roughly one todo per sentence of plan, you've gone too far.

Extract shared prerequisites first, then have dependents reference them — that's what lets the
execution team run a real first wave instead of racing on the same refactor.

### How persistence actually works

\`luca todo add\` **validates and returns a muninn procedure — it does not write anything.**
The todo exists only once you execute the returned steps. The same is true of
\`luca todo list\`: it returns a \`muninn_recall_tree\` step, so its stdout is never a list of
todos. Any verification that doesn't execute what \`list\` returns has verified nothing.

On the first todo in a fresh vault you get a two-step bootstrap: create the backlog root, then
run \`luca todo set-root --id <root_id>\` immediately so every later add is a single step.

\`\`\`bash
luca todo add \\
  --id "extract-portal-root" \\
  --title "Extract portal root resolution into a shared hook" \\
  --area "ui" --priority "high" \\
  --source "todo-ingest:<batch-slug>"
\`\`\`

**Always pass an explicit \`--id\`.** Auto-derived ids are truncated from the title and come out
as garbage like \`reject-fractional-currentphase-and-fix-the-misleading-resolv\`. Ids are
referenced by \`## Depends on\` / \`## Blocks\`, so a bad one corrupts the dependency graph.

Pass the body **in the \`muninn_add_child\` step**, not as a shell \`--body\` argument. Long
markdown through a heredoc is fragile and gets refused by command guards. The body is what
survives — an agent picking this up next week sees it and nothing else, so no "as discussed
above", no references to this conversation:

\`\`\`markdown
## Context
Both the modal and the tooltip resolve their portal root inline, with different
z-index assumptions (\`modal.tsx:41\`, \`tooltip.tsx:29\`). The modal z-index bug is a
symptom of this duplication, not a standalone defect.

## Approach
Extract a \`usePortalRoot()\` hook owning root lookup and stacking context. Migrate
both call sites. No visual change intended.

## Files
- \`src/ui/hooks/use-portal-root.ts\` (new)
- \`src/ui/modal.tsx\`, \`src/ui/tooltip.tsx\` — replace inline resolution

## Acceptance criteria
- [ ] Neither component resolves a portal root inline; both call the hook
- [ ] Modal renders above the sticky header at every viewport width
- [ ] \`bunx --bun tsc --noEmit\` passes

## Depends on
none

## Blocks
todo:fix-modal-zindex

## Assumptions
- The sticky header's z-index is intentional and stays as-is (not confirmed with user).
\`\`\`

Remaining notes:

- **Dependencies go both directions** — \`## Depends on\` on the dependent, \`## Blocks\` on the
  prerequisite. A one-directional link reads as "no dependencies" from the other side.
- **Bodies cap at 8192 characters.** Hitting it is a design signal, not a formatting problem.
- **Priority from the plan**, not vibe: \`critical\` for a live break or actively wrong shipped
  instruction, \`high\` for a blocker of other todos, \`medium\` default, \`low\` for nice-to-have.
- **One \`--source\`** for the whole batch (\`todo-ingest:<batch-slug>\`) so it's recoverable as a set.
- **Never \`muninn_evolve\` a todo** — it orphans tree-parented engrams and they vanish from
  \`luca todo list\`. Near-duplicates from Stage 0 get \`luca todo update\`; note that update is
  full-replace, so re-send every field you want to keep.
- **Treat persisted todos as write-once.** This is why the barriers matter.

Then write one memory holding the cross-cutting view no individual todo owns:

\`\`\`
muninn_remember(
  vault:   <repo vault>,          # session:* routes to the repo vault
  concept: "session:todo-ingest-<batch-slug>",
  content: <plan overview, dependency graph, premise corrections,
            rejected approaches AND why, open assumptions>
)
\`\`\`

The rejected approaches are the expensive knowledge and are invisible in the todo bodies.

---

## Stage 5 — Summary

The user is deciding whether to launch execution. Lead with the backlog; put the caveats
where they can't be missed.

\`\`\`markdown
## Ingested N todos from M tasks

| # | Todo | Area | Pri | Depends on |
|---|------|------|-----|------------|
| 1 | Extract portal root resolution | ui | high | — |
| 2 | Fix modal z-index | ui | high | #1 |
| 3 | Add silent token refresh | auth | medium | — |

**Waves:** #1, #3 in parallel → #2

**Premise corrections — two of your three tasks turned out differently:**
- "modal z-index bug" — real, but caused by duplicated portal resolution, not the modal.
- "kill the old config loader" — already deleted in \`48128621\`. What remains is four docs
  still telling users to run it, which is now the batch's only \`critical\` todo.

**Also found, not requested:** \`luca todo update\` silently drops omitted fields (#7). Say the
word and I'll drop it.

**Split:** "modal z-index" became 2 todos — the extraction is verifiable on its own.

**Review:** 3 lenses, 14 findings — 11 applied, 2 partly, 1 rejected (reviewer misread
\`phase-add.ts:52\`; a second reviewer independently refuted it). One planned todo deleted: the
"exits 0" claim was measured through a pipe and is actually exit 1.

**Assumptions — correct me if any are wrong:**
- The sticky header's z-index is intentional and stays as-is.

**Open decision (#4, critical):** decimal phases can't work without a real phase-number field.
Make them work, or drop them for an honest renumbering insert? Everything downstream is gated
on this. I'd pick the latter.

Backlog is ready. Next: run the execution workflow against wave 1.
\`\`\`

Surface premise corrections and assumptions even when confident. This is the cheapest moment
for the user to catch a wrong premise — after this it's embedded in N todos and whatever gets
built on them.

## Success criteria

- [ ] Every user task is traceable to at least one todo, and every todo is either traceable to
      a user task or explicitly labelled as discovered adjacent work
- [ ] Each task's premise was checked against the code and confirmed or corrected in the summary
- [ ] Research fully returned before the plan began; review fully returned before decomposition
- [ ] Clarifying questions asked once, after research, only when blocking — and any unanswerable
      blocking question filed as a \`critical\` decision todo
- [ ] Three lenses reviewed the actual plan text; findings triaged; rejections stated with reasons
- [ ] Todos persisted — the returned muninn procedure was executed and \`luca todo list\`'s
      procedure was executed to confirm they enumerate
- [ ] Each body stands alone: context, approach, files, checkable acceptance criteria, dependencies
- [ ] Dependencies linked both directions; summary shows executable waves
- [ ] A \`session:todo-ingest-<batch-slug>\` memory holds the cross-cutting plan in the repo vault
- [ ] No source files modified

## Next steps

**Primary:** launch the execution workflow against wave 1.

**Also available:**
- \`/todo-check\` — review or re-prioritize the backlog
- \`/todo-add\` — capture a one-off that came up during ingestion
- \`/lu <todo>\` — run a single todo through the full Luca pipeline

</main>
`

export const todoIngestSkill = defineSkill({
    name: 'todo-ingest',
    description:
        'Turn a batch of raw task ideas into a researched, peer-reviewed, dependency-linked todo backlog. Runs a fixed pipeline — RESEARCH the codebase and MuninnDB, write a DETAILED PLAN, have a parallel review team stress-test it, DECONSTRUCT into atomic todos via `luca todo add`, then SUMMARY. Use this whenever the user drops a list of two or more things they want to work on, or says things like "I\'ve got a handful of tasks", "here are some bugs/features I want to tackle", "research these against the codebase and write up a plan", "break this into todos", "let\'s plan these out before we build", or "split the plan into todos we can work through next". Also use it for a single task that obviously decomposes into several pieces. This skill deliberately stops at a reviewed backlog — it does not implement anything, so reach for it whenever planning should happen before code.',
    body: BODY,
})
