/**
 * workflow-authoring skill — how to write a Workflow script that carries
 * Luca's verification techniques.
 *
 * A "Workflow script" here means exactly one thing: the deterministic
 * JavaScript orchestration you author per-invocation for Claude Code's
 * harness-provided Workflow tool (`pipeline()` / `parallel()` / `agent()`,
 * with the script owning the agent lifecycle and awaiting promises).
 *
 * Nothing ships in this repo for it — no dependency, no executor, no
 * `defineWorkflow` artifact kind. This skill is pure authoring guidance:
 * it teaches four techniques Luca paid for in production (convergence
 * promotion, perspective diversity, bounded iteration, output pruning)
 * and cites the running implementation of each so a reader can go look.
 *
 * Every `path:line` in the body is asserted to resolve by the sibling
 * test — citations that rot fail the build rather than mislead.
 *
 * Scope: the verification cluster (`convergence.ts`, the claim-verifier,
 * the deferred-criterion rule) is DOCUMENTED here, never modified.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>

# Workflow Authoring

Write a **Workflow script** that keeps Luca's verification quality instead of
degrading into "spawn five agents, concatenate their text, hope."

A Workflow script is the deterministic JavaScript orchestration you author
**per-invocation** for the harness-provided Workflow tool: \`pipeline(...)\`,
\`parallel(...)\`, \`agent(...)\`. The script owns the agent lifecycle and
\`await\`s their promises. Control flow lives in JS — loops, counters, and
branch conditions are real code, not prose instructions an orchestrating model
may or may not follow.

**Nothing ships in this repo for this.** There is no Workflow dependency to
install, no executor to import, and no \`defineWorkflow\` artifact kind. If you
find yourself adding one, stop — that is a different, unmade decision. This
skill is authoring guidance only.

**Why JS instead of prose.** Everything below was first written as prose in a
skill body, and the prose versions leak: a model told "stop after 2 iterations"
runs 4, and a model told "discard the raw output" keeps it because it might
need it later. In a Workflow script the counter is a variable and the pruning
is a \`.map()\` — the guarantee is structural.

---

## The four techniques

Each has a running implementation in this repo. Read the cited code before you
reimplement it in a script; the edge cases are already paid for.

### 1. Convergence promotion

**The rule:** when **two or more** independent lenses flag the same location,
that location is blocking — **regardless of the severity** each individual lens
assigned it. Three reviewers each calling something a "nit" is not three nits;
it is one real defect that no single lens had the standing to escalate.

Implementation: \`packages/luca-core/src/review-analysis/convergence.ts:180\`
(\`detectConvergence\`). Findings are grouped by \`(path, line ± tolerance)\`;
groups with \`perspectives.length >= 2\` are convergent
(\`packages/luca-core/src/review-analysis/convergence.ts:190\`), and every
weaker-than-must-fix finding in a convergent group is rewritten to
\`must-fix\`. Findings are never mutated in place — the promoted set is a fresh
array, so the original severities stay auditable.

In a Workflow script:

\`\`\`js
const lenses = await parallel([
  agent({ name: 'architecture', prompt: archPrompt }),
  agent({ name: 'security',     prompt: secPrompt }),
  agent({ name: 'simplifier',   prompt: simpPrompt }),
])

// Group by (file, line ± 2). >= 2 distinct lenses in a group ⇒ blocking.
const groups = groupByLocation(lenses.flatMap(l => l.findings), 2)
const blocking = groups.filter(g => distinct(g, 'lens').length >= 2)
\`\`\`

Two details that matter: **grouping needs a line tolerance** (lenses rarely
agree on the exact line), and **the lens name must survive into the finding**
or you cannot count distinct perspectives at all.

Note the current wiring: convergence promotion runs on the PR-review path, not
on in-pipeline review. Extending its reach is a separate proposal with its own
decision to make — out of scope here, and not something this skill asks you to
do.

### 2. Perspective-diverse verifiers

Parallel agents are only worth their cost if they are **differently lensed**.
Three agents given the same prompt are **redundant** — they produce correlated
findings, and correlated findings defeat technique 1 outright: convergence
between two copies of the same reviewer is evidence of nothing.

Luca's seven lenses are enumerated at
\`packages/luca-tools/src/artifacts/subagents/reviewer.ts:42\` — architecture,
developer experience, security, simplification, test quality, cross-phase
integration, and independence. Two design choices there are worth stealing:

- **Lane discipline.** Each lens is told to stay strictly inside its
  perspective. Overlap double-counts findings and corrupts the convergence
  math above.
- **Cold isolation for the adversarial lens.** The "independence" reviewer
  receives only the diff and the project identity — none of the other lenses'
  findings, summaries, or verdicts. It exists to catch blind-shared-context
  errors: bugs the in-context reviewers cannot see because they inherit the
  planner's framing. Denying it the shared context is what makes it
  independent.

In a script, diversity is a data structure, not a hope:

\`\`\`js
const LENSES = [
  { name: 'architecture', brief: '...' },
  { name: 'security',     brief: '...' },
  { name: 'independence', brief: '...', coldIsolated: true },
]

const results = await parallel(
  LENSES.map(l => agent({
    name: l.name,
    // Cold-isolated lenses get the diff and nothing else.
    prompt: l.coldIsolated ? diffOnly(diff) : withContext(diff, priorFindings),
  }))
)
\`\`\`

Also worth carrying over: an APPROVE verdict with no cited evidence is a
rubber-stamp. Luca requires a clean verdict to cite verified \`file:line\`
locations. Make the script enforce it — reject an approval whose citation list
is empty rather than trusting the agent to self-police.

### 3. Bounded iteration with a hard stop

Every fix loop needs a counter and a **hard stop**. Not "try not to loop
forever" — an integer, compared, with a defined terminal behaviour when it is
exhausted.

Luca's caps live at
\`packages/luca-core/src/state/configs/budget-matrix.ts:23\`
(\`BUDGET_BY_COMPLEXITY\` — \`maxChecksFixIterations\`,
\`maxVerifyIterations\`, \`maxReviewIterations\`, scaled by complexity level).
The counters are bumped deterministically on rework edges and reset to 0 on
forward-exit edges: \`packages/luca-core/src/state/machine/actions.ts:57\`
(\`FIX_LOOP_EDGES\` — exactly six edges, three increment, three reset).

**Learn from the gap.** In Luca the counters are deterministic but the caps are
**advisory** — the state machine tracks them; the decision to stop is prose in
an orchestrating body. That is precisely the weakness a Workflow script fixes,
because the comparison can be a real \`if\`:

\`\`\`js
const MAX_REVIEW_ITERATIONS = 2   // from the complexity budget
let iteration = 0
let findings = await runReview()

while (findings.blocking.length > 0) {
  if (iteration >= MAX_REVIEW_ITERATIONS) {
    // Hard stop: halt with the unresolved findings surfaced. Do NOT
    // silently proceed, and do NOT quietly raise the cap.
    return halt({ reason: 'review-budget-exhausted', findings })
  }
  iteration += 1
  await agent({ name: 'fixer', prompt: fixPrompt(findings.blocking) })
  findings = await runReview()
}
\`\`\`

The terminal behaviour is the load-bearing half. A loop that exits on budget
exhaustion and reports success has converted a quality gate into a delay.
Reset the counter on forward progress (a clean pass), so a later unrelated loop
starts from zero rather than inheriting an exhausted budget.

### 4. Orchestrator output pruning

The orchestrator's resident context is the dominant cost driver, and the
mechanism is boring: parallel agents each return 50–100k tokens, the
orchestrator holds all of it while planning the next six steps, and every
subsequent turn re-reads the whole pile at cache-read prices. The audit and the
accepted decision are at \`docs/decisions/orchestrator-context-pruning.md:1\`.

**The rule:** after parsing each agent result, keep only the compact envelope —
\`status\`, a short \`summary\`, artifact **paths**, and issue severities — and
**discard** the raw text. Re-read the artifact file if narrative detail is
needed later; the file is on disk and costs nothing until it is opened.

\`\`\`js
const raw = await parallel(tasks.map(t => agent({ name: t.id, prompt: t.prompt })))

// Prune at the boundary. The raw array goes out of scope here and never
// enters the orchestrator's working set.
const pruned = raw.map(r => ({
  id:        r.id,
  status:    r.status,
  summary:   r.summary.slice(0, 500),
  artifacts: r.artifacts,            // paths only, never contents
  issues:    r.issues.slice(0, 10).map(i => ({ severity: i.severity, message: i.message })),
}))
\`\`\`

The complementary half is **agents writing their own artifacts**. Luca's
researcher used to return its full findings so the orchestrator could write
\`research.md\`; it now writes the file itself and returns 3–5 lines. If an
agent's output is destined for a file, have the agent write the file — routing
it through the orchestrator is pure context tax.

---

## The \`full-auto\` yield limitation — do not overstate this one

Pruning has two halves, and **they do not have the same reach**:

- **Per-phase compact envelopes** — agents return summaries instead of
  payloads. This lands in **every** mode, unconditionally. It is the win you
  can always count on.
- **Yield at the phase boundary** — end the turn between phases so the next
  phase starts with a fresh context instead of accumulating the whole run in
  one transcript. This lands **only** in the \`checkpoint\` and
  \`human-in-loop\` oversight modes, where a human re-invokes the pipeline.

In \`full-auto\` the yield is **not active**: there is **no autonomous re-invoker**
in current source (the autopilot loop was removed), so yielding would stall the
run outright rather than resume it. The handoff is still persisted for
durability, but control continues in the same turn. See
\`packages/luca-tools/src/artifacts/skills/lu/index.ts:198\`.

If your Workflow script relies on a boundary yield, it needs its own outer
loop to re-enter — the script itself can be that re-invoker, which is one of
the better reasons to write one. Do not carry over the claim that the yield
works everywhere; it does not.

---

## Scope boundary — the verification cluster is read-only

This skill **documents** the verification cluster. It does not change it.
**Do not rewire** any of the following from a Workflow script, or while
following this skill:

- \`convergence.ts\` and its promotion rule
- the \`claim-verifier\` and its evidence requirements
- the \`deferred-criterion\` rule
- the convention that a CLEAN verdict must cite verified \`file:line\`
  locations

Reimplement their *shape* inside your script — group by location, require
citations, promote on convergence. Changing the shipped implementations is a
separate decision with its own review.

---

## Checklist for a Workflow script

- [ ] Lenses are **differently** briefed; at least one is cold-isolated.
- [ ] Findings carry their lens name and a \`file:line\`, so convergence is
      computable.
- [ ] Convergence (\`>= 2\` lenses, same location ± tolerance) promotes to
      blocking in code, not in prose.
- [ ] Every loop has an integer cap **and** a defined terminal behaviour on
      exhaustion. Counters reset on forward progress.
- [ ] Agent returns are pruned to \`status\` / \`summary\` / paths / severities
      at the boundary; raw text is discarded.
- [ ] Artifacts are written by the agent that produced them.
- [ ] Any boundary yield has a re-invoker, or it is not claimed.

</main>`

export const workflowAuthoringSkill = defineSkill({
    name: 'workflow-authoring',
    description:
        "Author a Workflow script — the deterministic JavaScript orchestration you write per-invocation for Claude Code's Workflow tool (pipeline/parallel/agent) — that carries Luca's verification techniques: convergence promotion (two or more independent lenses on one location is blocking), perspective-diverse rather than redundant verifiers, bounded iteration with a real hard stop, and orchestrator output pruning. Use when the user is writing or reviewing a Workflow script, asks how to orchestrate parallel agents or reviewers reliably, wants a multi-agent review or verification loop that will not run away or blow up the context, or invokes /workflow-authoring. Documents the shipped implementations; it never modifies them.",
    body: BODY,
})
