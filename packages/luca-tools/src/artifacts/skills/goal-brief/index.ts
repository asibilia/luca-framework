/**
 * goal-brief skill — compose a short `/goal` execution brief from the backlog.
 *
 * Pairs with todo-ingest: ingest plans and persists todos, goal-brief turns
 * them into a compact prompt the user pastes into `/goal`.
 *
 * Design notes (both learned from a real failed run of its predecessor,
 * which was named `todo-execute` and went straight into implementing):
 * - The skill NEVER executes. The prior name literally said "execute" and
 *   its description sanctioned "or have run directly as a workflow", so the
 *   model collapsed offer-then-run into run. The name now describes the
 *   artifact, the run branch is gone, and the hard stop sits near the top
 *   (mirroring todo-ingest, which held at 100% across three eval runs).
 * - `/goal` has a hard length cap, so the brief targets ~200 words. The
 *   executing team shares this environment and can read the backlog itself,
 *   so the brief carries only what it cannot re-derive: wave order,
 *   same-file conflicts, blocked work, and the rejected approaches from the
 *   ingestion session memory.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>

# Goal Brief

Turn a planned backlog into a short execution brief: a \`/goal\` prompt that stands up a
workflow team along the real dependency graph, with adversarial verification built in.

**Arguments:** optional scope or framing override (e.g. "just the auth ones", "wave 1 only").

\`\`\`
0. LOAD     → pending todos, ingestion memory, conversation framing
1. GRAPH    → waves from the dependency links; find blockers
2. COMPRESS → keep only what the executing team cannot re-derive
3. COMPOSE  → the /goal prompt, ~200 words
4. DELIVER  → show the prompt block; stop
\`\`\`

**You are not doing any of this work.** No edits, no tests, no agents, no workflow runs —
not even the first "easy" todo, and not if the user's phrasing sounded like a go-ahead. They
are asking you to *write the brief*; running it is a separate decision they make afterwards,
by pasting it. The single deliverable of this skill is a block of text. If you find yourself
opening a source file that a todo mentions in order to change it, stop — you've slipped from
describing the work into doing it.

This is the failure mode the skill exists to avoid, because the pull is strong: you'll be
holding a backlog of concrete, well-specified, actionable work, and starting on it will feel
more helpful than handing back a prompt. It isn't. The user reframes at this exact point
often enough that composing-then-stopping is the whole point — they may want a subset, a
different emphasis, or to run it in another repo entirely.

---

## Stage 0 — Load context

**The backlog.** Run \`luca todo list\` and execute the \`muninn_recall_tree\` procedure it
returns — the CLI hands back steps, not a list, so stdout alone tells you nothing. Read the
full body of every pending todo: title, priority, area, acceptance criteria, \`## Depends on\`,
\`## Blocks\`, \`## Assumptions\`.

Reading source files for *context* is fine — understanding what a todo refers to helps you
write a sharper brief. Changing one is not.

**The ingestion memory.** Recall \`session:todo-ingest-*\` from the repo vault. It holds the
**rejected approaches and why**, the premise corrections, and the open assumptions. A team
that doesn't know an approach was already considered and killed will rediscover it, argue for
it, and sometimes build it. This is the one thing they cannot re-derive from the backlog.

**The conversation.** The user often reframes here — a subset, a different emphasis, a
constraint that came up since ingestion. Take the framing from what they just said. An
argument passed to the skill wins over the default "all pending".

If the backlog is empty or there's no ingestion memory, say so and stop. An execution brief
for unplanned work is a confident-sounding prompt with nothing behind it; \`/todo-ingest\` first.

---

## Stage 1 — Build the wave graph

Waves come from the todos' own \`## Depends on\` / \`## Blocks\` links, not from your reading of
what seems related. Todos with no unmet dependencies form wave 1; each later wave is what
those unblock.

**Open decision todos.** If ingestion left a \`critical\` decision todo — a question that
couldn't be answered, filed as a blocker — everything downstream is not ready to run. Don't
quietly include the dependents. Name the blocked work in the brief as explicitly out of
scope, and tell the user which decision is holding it. A brief that runs past an unmade
decision is how a team builds the wrong thing efficiently.

**File conflicts inside a wave.** Two todos in one wave touching the same file collide when
run in parallel. Sequence them across waves, or say in the brief that they share a file and
must not run concurrently. Parallelism that produces merge carnage is slower than serial.

---

## Stage 2 — Compress

**\`/goal\` has a hard length cap. Target about 200 words — a couple of paragraphs.** This is
the constraint that shapes the whole brief, so decide what earns its place before writing.

The executing team runs in this same environment. It can read the backlog itself. So don't
carry anything it can look up:

| Leave out — they can re-derive it | Keep in — they cannot |
|---|---|
| Full acceptance criteria (point at the todo bodies) | Which todos, and the wave order |
| Per-todo context, file lists, approach | Same-file conflicts within a wave |
| Anything already in a todo body | Rejected approaches, and why |
| Restating what \`/goal\` already does well | Work that is blocked and must not start |
| | The verification lens rule |

Pointing beats inlining: "read each todo's body for acceptance criteria" costs eight words and
replaces several hundred. Identify todos by number and short title, not by pasting them.

If the backlog is too big to summarize in a couple of paragraphs, brief **one wave at a
time** and say so — a truncated brief that silently drops half the work is worse than an
explicitly partial one.

---

## Stage 3 — Compose

Keep the user's spine: an expert product-development workflow team, the right mix of
specialized agents per task, TDD, parallel where possible, adversarial review and
verification. Then the three things only you know — waves, conflicts, and what's settled.

Shape to aim for:

\`\`\`
/goal Stand up an expert product-development workflow team to complete todos #1–#6 in the
backlog (\`luca todo list\`, source \`todo-ingest:<batch>\`) — read each todo's body for its
acceptance criteria. Use the right mix of specialized agents per task; executors work TDD
(failing test first, confirm it fails for the right reason, then implement) and run in
parallel wherever dependencies allow.

Waves: #1, #3, #5 are independent — run them concurrently. #2 needs #1; #4 and #6 need #3.
#4 and #6 both touch \`<file>\`, so don't run those two together. Leave #7 alone — it's
blocked on an open decision.

Finish with an adversarial review and verification pass: independent verifiers with DIFFERENT
lenses (correctness / does-the-repro-now-pass / consumer impact), and treat anything two
lenses independently flag as blocking, whatever severity each assigned. Settled during
planning, don't relitigate: <approach> (<why it was killed>), and <approach> (<why>).
\`\`\`

Rules:

- **The "don't relitigate" clause earns its words.** It's the only content that can't be
  recovered from the backlog, and skipping it means paying twice for the same analysis.
  One clause each, not a section.
- **Name the dependency reason when it's short and load-bearing** — "#2 needs #1's extracted
  hook" survives #1 landing differently; bare "#2 needs #1" doesn't. Drop it if it costs a line.
- **Don't restate \`/goal\`'s own competence.** It knows how to organize a team. Tell it the
  things specific to *this* backlog.
- **Verbatim acceptance criteria are out** — they live in the todo bodies, which the team reads.

---

## Stage 4 — Deliver

Show the prompt in a single fenced block so it copies cleanly. Then two or three lines:

- what's in it (N todos, M waves, rough word count)
- anything deliberately excluded and why (blocked on an open decision, out of requested scope,
  deferred to a later wave because of the length cap)

Then **stop.** Don't offer to run it, don't ask whether to proceed, don't start a todo. If the
user wants it run they'll paste it into \`/goal\`, which is built for this. If they later ask you
directly to run it, that's their call — but it is not this skill's job to propose it, and a
request to *write* the brief is never a request to run it.

## Success criteria

- [ ] Nothing implemented, edited, tested, or orchestrated — the only deliverable is prompt text
- [ ] Prompt is roughly 200 words; nothing in it could have been looked up in the backlog
- [ ] Pending todos loaded by executing the procedure \`luca todo list\` returns, not its stdout
- [ ] Waves derived from the todos' own dependency links, not topical similarity
- [ ] Blocked-on-decision todos named as out of scope, not silently included
- [ ] Same-file conflicts within a wave called out
- [ ] Rejected approaches carried across as a "don't relitigate" clause
- [ ] Verification names DIFFERENT lenses and the two-lens-convergence blocking rule
- [ ] Partial coverage, if any, stated explicitly rather than silently truncated
- [ ] Ends with the prompt block and a short note; no offer to execute

## Next steps

**Primary:** paste the brief into \`/goal\` when ready.

**Also available:**
- \`/todo-ingest\` — plan a new batch of tasks into the backlog first
- \`/todo-check\` — review or re-prioritize before running
- \`/todo-add\` — capture something that came up while reading the brief

</main>
`

export const goalBriefSkill = defineSkill({
    name: 'goal-brief',
    description:
        'Write a short execution brief for a planned todo backlog — a `/goal` prompt that stands up an expert product-development workflow team, with TDD executors fanned out in dependency waves and an adversarial review and verification pass. Reads the pending todos, the ingestion session memory, and the current conversation, then hands back a compact prompt (a couple of paragraphs, since `/goal` has a hard length cap) for the user to tweak and paste. Use this after `/todo-ingest`, or whenever the user is ready to start on a planned backlog and says things like "let\'s run these", "kick off the todos", "build the workflow team", "spin up agents for this backlog", "write me the goal prompt", or "let\'s execute". The output of this skill is always the prompt text itself — it drafts the brief for the user to run, and never performs the work.',
    body: BODY,
})
