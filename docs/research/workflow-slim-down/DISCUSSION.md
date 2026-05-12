# Workflow Slim-Down — Discussion Log

**Status:** in-progress discussion
**Started:** 2026-05-08
**Goal:** Reduce token spend in the Luca workflow without losing performance, tighten interactivity, and lean harder on verified MuninnDB context.

---

## Context

User noticed token waste across the workflow and surfaced two related concerns:
1. We previously planned to record/measure workflow runs to make data-informed decisions about which pieces are less effective. Are we doing this?
2. The workflow needs to be slimmed deliberately to cut tokens, improve UX, and maintain performance.

This document captures the design discussion before any audit or code changes.

---

## User's proposed flow

A loose restatement of the desired shape:

**a. Create todos** — manually or ingested from GitHub. Todos may or may not contain implementation details.

**b. Start the `lu` workflow** — specify which todos to work on. This is also where the branch is created (and an initial changeset file is added if the repo's preferences say to use changesets).

**c. Triage** — todos are read into a loose work plan. Each gets its own context file(s).

**d. Plan files get expanded via research.** Research can come from:
- The initial todo
- The user (prompted by the workflow)
- MuninnDB
- Internal research (codebase)
- External research (web, docs)

This phase should be **more interactive**. The `grill-me` skill is a good candidate to interrogate information and inform the plan files. Saves cycles by surfacing what the user already knows.

**e. Execute** — no significant change.

**f. Verify** — no significant change. Loop back to execute with findings + adjustments.

**g. Finalize** — check that all steps were completed, double-check tracking requirements from repo preferences, open a PR.

### Two key principles

1. **Lean harder on MuninnDB.** Before making assumptions anywhere in the workflow, recall verified context. Store verified learnings. Verified means:
   - Definitive things the user tells us about the way the repo works
   - Research grounded in reality + sources
   - Code-review feedback that has been dually verified by the coding agent with repo knowledge and acted upon (we already do this, partially)

2. **High-level phase shape:** STAGING → PLANNING → EXECUTION → VERIFICATION → FINALIZATION + ITERATION. Between **staging** and **planning** we interrogate the user to maximize verified context. Sometimes the user says "I don't know, you research" — that's fine, then we research and ground in real sources. During todo creation we can ask the user if they want to tease out details then or defer to planning.

---

## Assistant response (initial pushback + agreement)

### On point 1 (telemetry)

We are **not** doing this. What exists:
- Postmortems — qualitative, per-run, stored as memories
- `luca-state.json` — transient, overwritten each phase

What's missing:
- Wave/phase duration timing
- Subagent invocation counts and token costs per role
- Review iteration convergence rates (how often does iter-2 still find MUST-FIX?)
- Recall hit/miss rates (are we recalling and getting useful results, or wasting tokens?)
- Tool call distribution per phase

**This matters for the stated goal.** You can't claim "research is too expensive" or "review iter-2 is wasted" without data. If we slim on intuition, we cut the wrong things. Telemetry is arguably a **prerequisite** for the slim-down.

Compromise: add **lightweight, append-only run logging now** (cheap), then make slim-down decisions data-informed in a follow-up pass. Not "instrument everything perfectly first."

### On point 2 (workflow shape)

The proposed STAGING → PLANNING → EXECUTION → VERIFICATION → FINALIZATION shape is basically what exists, just renamed:
- triage ≈ staging
- research + architect ≈ planning
- execute ≈ execution
- review ≈ verification
- finalize ≈ finalization

The real change isn't structural — it's **moving interactivity earlier and making it grounded.**

#### Strong agreement

- **Todo capture should optionally include user context.** Today todos are titles + areas. Bodies can be empty or rich, and we don't lean on bodies. We should prompt at todo-creation time: "Want to attach context now or defer to planning?"
- **`grill-me` belongs between staging and planning.** Today users can run grill-me manually but it isn't woven into `lu`. It should be a first-class phase or a triage sub-step, gated on classification.
- **Verified learnings should be the recall target.** We just shipped tier discipline + recall filtering. The workflow should **consult MuninnDB before research** (cheap) and **store verified outcomes after execution** (we partially do, via post-merge hooks and review captures). What's missing: explicit *"before assuming X, recall verified context about X"* gates at decision points.
- **Branch + initial changeset at workflow start, not architect Step 1.** Today architect creates the branch. Moving it to `lu` start eliminates a class of "committed to wrong branch" bugs and makes the changeset entry a known artifact from the get-go.

#### Pushback

- **"This part should be more interactive"** — yes, but interactive phases burn user time. If grill-me runs every triage we'll resent it.
  Proposal: **grill-me runs by default for COMPLEX/CRITICAL only, opt-in for MODERATE, skipped for TRIVIAL/SIMPLE.** User can `--skip-grill` or `--full-grill` to override.

- **"Store verified learnings everywhere"** — we just did the tier work. Risk: over-promotion dilutes the tier. Tighten the criteria:
  - Definitive user statements → verified
  - Research grounded in source citations → verified
  - Code-review feedback **shipped + merged + still green after 7 days** → verified; before merge it's `inferred`.
  The 7-day soak is what makes "verified" mean something.

- **"Each todo gets its own context file"** — we sort of do this (phase dirs). But if the goal is *per-todo, persistent, surviving the workflow* — that's new. Question to settle: is this cross-pipeline memory (so the next run on the same area gets context), or just this-run scratchpad? If cross-pipeline, it's basically a structured MuninnDB memory with stable id. If this-run, current phase dirs already cover it.

### Diagnostic question (open)

Where does the token burn feel worst? Pick top 3:

1. Research phase (5 parallel subagents, often re-discovering the same stuff)
2. Review iterations (4 perspectives × N iterations × full file reads)
3. Mode prefixes / tool descriptions (every turn, every mode)
4. Recall calls returning bloat
5. Subagent context (no shared knowledge between them)

Assistant's gut: #1 and #2 are biggest, but waiting on user's read before audit.

---

## Token burn — user diagnosis

**Primary pain: the research phase.**

> "I often have context for the work which would supersede research which might lead us in the wrong direction."

This reframes the problem. It's not just *expensive* — it's **wrong-direction expensive**. Research without user context isn't only wasteful, it actively pulls the plan away from what the user already knows. Then plan review tries to catch the drift, sometimes succeeds, sometimes doesn't, and the cost compounds in execute.

### Implications

1. **The fix isn't "make research cheaper" — it's "front-load user context so research is constrained, or skipped where unnecessary."**
2. Grill-me (or a similar interrogation step) belongs **before** research, not as a parallel option. It's the gate that decides whether research runs at all and, if so, what it should look for.
3. The 5-parallel-subagent research pattern is overkill when the user can supply ground truth in 2 minutes of conversation.
4. Today's flow assumes the agent knows nothing and the user has nothing to say. Both assumptions are usually wrong.

### Proposed reshape (initial)

```
STAGING       triage classification + branch + changeset stub
              ↓
USER CONTEXT  interrogation (grill-me, gated by classification)
              → user supplies what they know
              → user says "I don't know" → flag for research
              → output: CONTEXT.md with verified user knowledge + research targets
              ↓
RESEARCH      ONLY targets gaps from CONTEXT.md (not blanket discovery)
              → MuninnDB recall first (verified-tier preferred)
              → codebase / external research only for unflagged gaps
              ↓
PLAN          architect (unchanged)
              ↓
EXECUTE       (unchanged)
              ↓
VERIFY        (unchanged)
              ↓
FINALIZE      (unchanged)
```

### Open questions raised by this reshape

- [ ] Should research be *fully skippable* when CONTEXT.md is rich enough? Or always run a token-cheap "verify user claims against codebase" pass?
- [ ] How do we capture the user's context efficiently? Free-form text, structured Q&A, or grill-me's branching interrogation?
- [ ] Do we cache the user's context across pipelines? (User said something verified about repo X in run N — recall it for run N+1 in the same area.)
- [ ] Does this kill the "5 parallel subagents" pattern entirely, or just gate it behind a CONTEXT.md gap list?

---

## User answers (round 2)

**Q1 — interrogation style:** Closer to grill-me, with a general detail intake step as well.
→ Two-tier: lightweight intake first (fast, structured), then grill-me for depth on COMPLEX/CRITICAL.

**Q2 — context type:** Both — todo-specific AND repo-level.
→ Implication: the workflow needs both per-todo capture (lives in todo body / CONTEXT.md) AND a verified repo-knowledge memory layer (lives in MuninnDB, recalled on every run that touches the area).

**Q3 — research mode:** Previously discussed a **context-confidence grading system for todos** that would inform how research proceeds.
→ This is the missing piece. A todo gets a confidence rating, and research depth scales inversely:
- HIGH confidence → minimal/no research, mostly user-driven plan
- MEDIUM → targeted research at user-flagged gaps
- LOW → full research as today
→ Confidence is set during todo intake (by user) and may be re-graded during triage if classification reveals more uncertainty.

**Q4 — concrete failure pattern:** Large monorepo with heavy abstraction and duplication. Common failure mode: research finds a *plausible* change site (component that looks like the fix) but the *actual* change site is somewhere specific the user knows about and research wouldn't naturally discover. This is **the wrong-direction case in pure form** — research has plenty of evidence pointing at the wrong answer, and only user knowledge can redirect.

→ Implication: in this kind of repo, research without user context isn't just expensive — it's *adversarial* to the user. The plan converges on the wrong site, the user has to fight to redirect, and review may not catch it because the wrong site looks coherent.

→ This is a strong argument for **user-context-first, research-as-validation-not-discovery** in monorepo / heavy-abstraction contexts.

---

## Emerging design (working hypothesis)

### Three-mode research, gated by confidence

| Confidence | Source | Research mode | Token cost |
|------------|--------|---------------|------------|
| HIGH | User-supplied or verified MuninnDB memory | **Validation only** — fact-check user claims against current code (1 subagent) | Low |
| MEDIUM | Partial context, gaps flagged | **Targeted** — research only flagged gaps (1–3 subagents on specific questions) | Medium |
| LOW | Empty todo, no recall hits | **Discovery** — current 5-subagent blanket sweep | High (today's default) |

### Confidence assignment flow

1. **At todo creation** — user optionally rates: HIGH / MEDIUM / LOW. Default = LOW (safe).
2. **At staging** — workflow recalls verified MuninnDB memories tagged to the area. Hits boost confidence one tier (LOW → MEDIUM, MEDIUM → HIGH).
3. **At intake step (new)** — user is shown the proposed confidence and the planned research depth. Can override.
4. **At grill-me (new, conditional)** — runs only for COMPLEX/CRITICAL classification AND confidence < HIGH. Can re-grade up if user supplies enough context to fill gaps. User can decline ("I don't know — research it").

### Repo-level vs todo-level context

- **Todo-level** → CONTEXT.md in phase dir. Includes user statements, gap list for research, change-site hints, gotchas.
- **Repo-level** → verified MuninnDB memories. Recalled on every run that touches the area. The "actual change site lives in a specific place" knowledge belongs here so it doesn't have to be re-said every run.

### "Wrong direction" guard

When research output disagrees with user-supplied context, **surface the conflict**, don't silently overwrite. New artifact: `RESEARCH-CONFLICTS.md` listing user-said-X / research-found-Y pairs for explicit user resolution before architect consumes the plan.

---

## User answers (round 3 — recovered from prior session)

User pasted two of their own responses from a prior session whose questions weren't recorded. Reconstructing the questions from the answers:

### Round 3a

**1. Telemetry-first vs slim-down-first?**
> Telemetry first makes sense. But continue the discussion so that once we have telemetry data we can verify the assumptions produced by this discussion.

→ **Decision:** ship telemetry first, then validate slim-down hypotheses against real data. Discussion continues in parallel — output is a *hypothesis sheet* that telemetry will confirm or refute.

**2. Mode consolidation?**
> Fold `triage` + `research` together. Won't conflict with the default `plan` mode because it'll be prefixed with `luca:`.

→ **Decision:** merge `luca:1-triage` + `luca:2-research` into a single mode (working name: `luca:1-stage` or `luca:1-plan`). Phase boundaries collapse.

**3. Full-auto handling of context interrogation?**
> Before the workflow kicks off, ask the user if they'd like to confirm plans with context front-loading interrogation, or leave it up to the agent to do its own context research (internal + external). Keep a confidence flag in todos. If during todo creation the user ran through grill-me and gave key implementation details, confidence = high. User may also say at todo ingestion they WANT the agent to do external research.

→ **Decisions:**
- Single yes/no prompt at `lu` start: "interrogate me for context, or let the agent research?"
- Confidence flag is a **todo-level field** set during creation (not at runtime).
- Confidence is set HIGH when user has been grilled and supplied key details during creation.
- Todos can also carry an explicit "do external research" flag (separate from confidence).

**4. Retroactive audit / promotion?**
> Yes.

→ **Decision:** retroactive memory promotion is in scope. (Already partly shipped via `memory-audit` skill.)

**5. Pipeline entry?**
> Naked `/lu` still works as auto-pick top of backlog. Implies a command to manually prioritize backlog items. Add a **backlog grooming command** that walks todos, interrogates the ones without rich context, and prioritizes them with user help. After grooming, triage during planning may not need interrogation because it's already done.

→ **Decisions:**
- `/lu` unchanged: auto-pick top of backlog.
- New skill: **`/lu-groom`** (or similar) — walks pending todos, interrogates the under-specified ones, sets confidence flags, reorders by priority.
- Grooming is the front-loaded interrogation surface. If you've groomed, `lu` runs cleanly. If you haven't, `lu` interrogates inline (with the front-of-pipeline prompt from #3).

### Round 3b

**1. Batch summarize during grooming?**
> Batch summarize is fine unless specifically prompted otherwise.

→ **Decision:** grooming default is batch-summarize todos in groups, not one-by-one. User can override with `--per-todo` or similar.

**2. Default confidence for GitHub-imported todos?**
> Grooming is still important on github-imported todos. Set them to LOW instead of MEDIUM.

→ **Decision:** GitHub imports default to **LOW confidence**, forcing grooming or inline interrogation. Manual user-created todos can default higher.

**3. Disk I/O concerns?**
> Don't mind disk I/O as long as it doesn't eat up tokens.

→ **Decision:** persist freely to `.planning/` and todo bodies. Token-cost-of-context is the only constraint, not write count.

**4. Mode consolidation breadth?**
> Remove `discuss` in favor of the interrogation steps in other modes. Merge `triage`/`research`/`architect` into a single `planning` document.

→ **Decisions:**
- `luca:discuss` mode is **removed** — its purpose is absorbed into grooming + the new front-of-pipeline interrogation step.
- Triage + research + architect collapse into a **single `luca:1-plan` mode** producing one document (working name: `PLAN.md` or `WORK-CONTEXT.md`).
- Pipeline shrinks from 6 stages to 4: **plan → execute → review → finalize.**

**5. Grill-me bound during grooming?**
> Leave open-ended but ask the user if we're complete after 3 questions per todo.

→ **Decision:** grilling is open-ended but checks in every 3 questions: "got enough? continue? skip?" — prevents runaway interrogation while preserving depth.

---

## Consolidated design (post round 3)

### New pipeline shape

```
BACKLOG               todos (GitHub or manual; LOW confidence default for GH)
                      ↓
GROOMING              /lu-groom — optional but recommended
   (skill)            walks todos, interrogates under-specified ones (3-Q chunks),
                      sets confidence, prioritizes
                      ↓
PIPELINE START        /lu
                      front prompt: "interrogate me, or auto-research?"
                      branch + changeset stub created here
                      ↓
luca:1-plan           merged triage + research + architect
                      single PLAN.md output
                      research depth scales by todo confidence (HIGH→validate, MED→targeted, LOW→discovery)
                      conflicts between user-context and research halt for resolution
                      ↓
luca:2-execute        unchanged
                      ↓
luca:3-verify         unchanged (rename of review)
                      ↓
luca:4-finalize       unchanged
                      ↓ (loop on findings)
```

### Mode count

- Today: triage, research, architect, execute, review, finalize, discuss = **7 modes**
- Proposed: plan, execute, verify, finalize = **4 modes** (+1 grooming skill)

### Telemetry ordering

- Build telemetry **first** (before slim-down).
- Slim-down decisions become hypotheses validated against telemetry data.
- This discussion produces a **hypothesis sheet**, not a final spec. Telemetry data gets the last word.

### Confidence rating (locked-in)

- Field on each todo: `confidence: high | medium | low`.
- Source:
  - Manual creation + grilled = HIGH.
  - Manual creation + skeletal = MEDIUM.
  - GitHub import = LOW (always; forces grooming).
- Used by `luca:1-plan` to scale research depth.
- Re-gradeable during grooming.

### External research flag

- Separate from confidence — todo can carry `externalResearch: true` to explicitly request web/docs research even if confidence is HIGH.

### Conflict handling

- Research that contradicts user-supplied context **does not silently merge** into the plan.
- Conflicts surface as explicit halt-and-ask before architect step finalizes.

### Mid-workflow learning capture

- (Still open — not addressed in round 3.)
- Working hypothesis: when user redirects research with definitive statement ("no, the real change site is X"), that statement is auto-stored as `verified` MuninnDB memory tagged to repo + area.

---

## User answers (round 4)

**Q1a — Plan mode name:** `luca:1-plan`. ✓
**Q1b — Grooming command name:** `/backlog-groom`. ✓
**Q1c — Planning document(s):** *Multiple* documents, not single PLAN.md. Needs further discussion.

**Q2 — Learning capture timing:**
> We should wait to save verified muninn memories until after we've shipped to make sure that we didn't make a mistake and have to go back. I could also confidently give some incorrect knowledge that leads us the wrong direction. "Verified" is really just high confidence, not infallible. We may go down a path where we've operated under an assumption that I presented as correct that we later find out is incorrect by the end of the session. This is why I say maybe we wait until the end to capture learnings because we'll increase confidence significantly if it's about to be shipped because we know that it's been tested and verified.

→ **Decision:** verified-tier writes happen **post-merge only**, never mid-workflow. Mid-workflow user statements live in CONTEXT.md / phase artifacts as `inferred` if stored at all. The shipping bar (merged + green) is what promotes to verified. This aligns with the existing tier discipline: "verified" = "shipped + tested + soaked."

→ **Implication:** `learner` subagent runs at finalize time, not mid-execute. Mid-workflow capture is a *bug magnet*, not a feature.

**Q3 — Context persistence:**
> Phase directory only unless it contains decisions worth remembering in muninn. It's really up to the discretion of the learner agent to decide what's relevant to store in muninn.

→ **Decision:** phase artifacts are throwaway by default. The `learner` subagent (running at finalize) decides what to promote to MuninnDB based on evidence quality. Default: nothing is promoted unless it meets the verified bar.

**Q4 — Research prompting:**
> It was meant to be more asynchronous. Basically todos contain a confidence level and when the workflow starts, the triage part of the planning step will interrogate the user for more information for each todo if they're low confidence.

→ **Decision:** there is no front-of-pipeline yes/no prompt. The interrogation is **driven by the todo's confidence flag** set during creation/grooming. Triage step in `luca:1-plan` interrogates if confidence is LOW; otherwise proceeds with provided context.

→ This is cleaner than my proposed prompt. The user's already declared intent via the confidence flag — no need to re-ask at runtime.

**Q5 — Research conflict / wrong-direction recovery:**
> Roll back. But our confidence scores on todos should help mitigate this by forcing the user to give more context ahead of time. "Auto-research" should only happen really when the user specifies that something is unknown and needs research + verification.

→ **Decisions:**
- Wrong-direction discovery during execute = **rollback to plan mode**, re-plan with corrected context.
- "Auto-research" is *opt-in via todo flag* — `externalResearch: true` or "needs research" tag. Default is user-context-first.
- Confidence flag is the front-line defense; rollback is the safety net.

**Q6 — Halt mechanics:**
> (a) Hard stop with `ask_user` blocking.

→ **Decision:** when research contradicts user context, hard halt with `ask_user`. No auto-resolution, no append-to-PLAN-and-keep-going.

---

## Consolidated design (post round 4)

### Pipeline shape (locked)

```
BACKLOG               todos with confidence flag (HIGH | MEDIUM | LOW)
                      GitHub imports default LOW
                      ↓
GROOMING              /backlog-groom (skill, optional)
                      walks under-specified todos, interrogates in 3-Q chunks,
                      sets confidence + priority
                      ↓
PIPELINE START        /lu (auto-pick top of backlog)
                      branch + changeset stub created here
                      ↓
luca:1-plan           triage substep: interrogate if confidence=LOW
                      research substep: scaled by confidence (HIGH=validate, MED=targeted, LOW=discovery)
                      architect substep: produce planning artifacts (multiple — see Q1c)
                      research/user-context conflict → hard halt + ask_user
                      ↓
luca:2-execute        unchanged
                      mid-execute wrong-direction discovery → rollback to luca:1-plan
                      ↓
luca:3-verify         unchanged (rename of review)
                      ↓
luca:4-finalize       unchanged
                      learner subagent runs here — promotes to MuninnDB only post-merge
                      ↓ (loop on findings)
```

### Mode count

- Today: 7 modes (triage, research, architect, execute, review, finalize, discuss).
- Proposed: **4 modes** (plan, execute, verify, finalize) + 1 grooming skill.

### Confidence flag (locked)

| Source | Default |
|--------|---------|
| GitHub import | LOW |
| Manual creation, skeletal | MEDIUM |
| Manual creation + grilled at intake | HIGH |
| Re-graded during `/backlog-groom` | any |
| Carries `externalResearch: true` flag | any (orthogonal to confidence) |

### Verified-tier discipline (locked)

- **Mid-workflow:** nothing writes verified-tier to MuninnDB.
- **Finalize:** `learner` subagent inspects shipped artifacts + reviewer findings + user-supplied context. Promotes to verified only what's:
  - Definitive user statement that survived to ship (not later contradicted)
  - Research finding grounded in source citations
  - Code-review feedback that shipped + merged
- Default behavior: store **nothing** unless it meets the bar.

### Conflict + rollback (locked)

- Research vs user-context conflict → **hard halt + `ask_user`** in plan mode.
- Wrong-direction discovered mid-execute → **rollback to plan mode**, re-plan.
- "Auto-research" is **opt-in only** via todo flag.

---

## Q1c — Multiple planning documents (open, needs discussion)

User flagged: "I think there should actually be multiple planning documents... let's discuss this further."

### Today's planning artifacts

The current architect mode produces:
- `RESEARCH.md` — research synthesis
- `CONTEXT.md` — key decisions and constraints
- `PLAN.md` — execution plan with waves, file manifest, test plan, acceptance criteria

These are already three documents. So "multiple" might mean: keep the separation, formalize it, and add a few more — rather than collapse.

### Possible decomposition

| Document | Purpose | Stable across runs? | Audience |
|----------|---------|----------------------|----------|
| `TODO-CONTEXT.md` | What the user told us at todo-creation/grooming time. Verified user knowledge. | Per-todo, persists into phase dir | Plan mode + user reference |
| `RESEARCH.md` | What research found (codebase + MuninnDB recall + external if flagged). | Per-run | Plan mode |
| `CONFLICTS.md` | User-said-X / research-found-Y pairs awaiting resolution. | Per-run, ephemeral | Plan mode + user (halt point) |
| `DECISIONS.md` | Crystallized decisions with rationale. (Today's CONTEXT.md.) | Per-run | Architect + execute + reviewer |
| `PLAN.md` | Waves, file manifest, test plan, acceptance criteria. | Per-run | Execute + reviewer + verifier |
| `LEARNINGS.md` | (New) populated at finalize — what the learner promoted to MuninnDB and what it deliberately didn't. | Per-run, finalize-only | Postmortem + audit trail |

### Why the split matters

- **TODO-CONTEXT.md vs RESEARCH.md** — different provenance (user vs agent), different trust levels, different rebuttability. Keeping them separate means architect can weight user context > research without conflating the two.
- **CONFLICTS.md** — explicit halt artifact. If you ever want to ask "what did we have to renegotiate this run?" — it's right there.
- **DECISIONS.md vs PLAN.md** — decisions are *why*, plan is *what*. They have different decay rates. A decision rationale survives plan revisions; a wave list does not.
- **LEARNINGS.md** — a transparent audit of what the learner promoted to MuninnDB. Without this, verified-tier writes happen invisibly and we can't audit or unwind them.

### Questions I want your read on

**Q1c.1.** Does the 6-doc decomposition above match your intuition, or are you imagining a different cut?

**Q1c.2.** Should `TODO-CONTEXT.md` live in the *todo body* (markdown, persists with the todo) or in the *phase dir* (per-run, copied on `lu` start)? I lean toward "lives in the todo, copied to phase dir on lu start" — that way the same context survives if the todo is re-picked across multiple `lu` runs.

**Q1c.3.** Is `CONFLICTS.md` always present (empty if no conflicts) or only created on halt?

**Q1c.4.** Does `LEARNINGS.md` get committed to the repo, or live only in `.planning/phases/`?

---

## User answers (round 5)

**Q1c.1 — Document split:** C (hybrid).
→ **Decision:** start with three core docs (`TODO-CONTEXT.md`, `PLAN.md`, `LEARNINGS.md`). `CONFLICTS.md` and `DECISIONS.md` emerge only when needed.

**Q1c.2 — TODO-CONTEXT.md location:** Both.
→ **Decision:** the todo file is the canonical source; the phase dir holds a snapshot of what plan-mode actually consumed. Divergence between the two is acceptable and may even be informative (mid-run todo edits = telemetry signal).

**Q1c.3 — Confidence flag format:** In the todo file, take the proposed frontmatter.
→ **Decision (locked):**
```yaml
---
confidence: high | medium | low
externalResearch: false
priority: 1-5
---
```
- `/backlog-groom` writes this.
- `luca:1-plan` reads it (triage substep).
- GitHub import sets `confidence: low` by default.
- `externalResearch` is orthogonal to confidence — can be true at any confidence level.
- `priority` is the new explicit field (today's todos use file ordering + area tags).

---

## Locked design — final summary

### Pipeline

```
BACKLOG               todos with YAML frontmatter:
                        confidence: high | medium | low
                        externalResearch: false
                        priority: 1-5
                      GitHub imports default LOW + priority=3
                      ↓
GROOMING              /backlog-groom (skill, optional but recommended)
                      walks under-specified todos, interrogates in 3-Q chunks
                      ("ready, continue, skip?" every 3 questions)
                      writes back to todo frontmatter
                      batch-summarizes by default
                      ↓
PIPELINE START        /lu (auto-pick top of backlog by priority)
                      branch + changeset stub created here
                      ↓
luca:1-plan           one mode, three substeps:
                      1. triage    — read todo, interrogate if confidence=LOW
                      2. research  — scaled by confidence
                                       HIGH → validate user claims (1 subagent)
                                       MED  → targeted research at flagged gaps
                                       LOW  → discovery (today's blanket sweep)
                                       externalResearch=true → web/docs research added
                      3. architect — produce planning artifacts
                      conflict between research and user-context → hard halt + ask_user
                      ↓
luca:2-execute        unchanged
                      mid-execute wrong-direction discovery → rollback to luca:1-plan
                      ↓
luca:3-verify         unchanged (rename of review)
                      ↓
luca:4-finalize       unchanged
                      learner subagent promotes to MuninnDB ONLY post-merge
                      ↓ (loop on findings)
```

### Planning artifacts (3 core + 2 conditional)

| Doc | Always? | Location | Writer | Reader |
|-----|---------|----------|--------|--------|
| `TODO-CONTEXT.md` | core | todo file (canonical) + phase dir (snapshot) | user + groom + plan-mode triage | plan-mode + user reference |
| `PLAN.md` | core | phase dir | plan-mode architect substep | execute + verify |
| `LEARNINGS.md` | core | phase dir | learner subagent at finalize | postmortem + audit |
| `CONFLICTS.md` | only on halt | phase dir | plan-mode triage/research | user (halt resolution) |
| `DECISIONS.md` | only when crystallized | phase dir | plan-mode architect | execute + verify reference |

### Tier discipline (re-affirmed)

- Mid-workflow: **nothing writes verified-tier.**
- Finalize: `learner` subagent inspects shipped artifacts, promotes only what's grounded.
- Default: store nothing unless it meets the bar.

### Mode count

- Today: 7 modes (triage, research, architect, execute, review, finalize, discuss).
- After: **4 modes** (plan, execute, verify, finalize) + 1 grooming skill.

### Telemetry

- Build telemetry **first**, before the slim-down.
- This discussion is the hypothesis sheet; data confirms or refutes.

---

## User answers (round 6)

**Migration path:** A (hard cut) — **but as a prerelease.**
→ **Decision:** ship the new pipeline as an alpha prerelease (changesets pre-mode, already enabled). No coexistence layer. Old `triage`/`research`/`architect`/`discuss` modes get removed in the cut. Alpha consumers opt in via `@alpha` tag; `latest` stays on the 7-mode pipeline until alpha bakes.

**Grooming auto-trigger:** B — auto-interrogate inline.
→ **Decision:** `/lu` on a low-confidence top-of-backlog todo transparently runs the interrogation inline (plan mode triage substep handles it). `/backlog-groom` is a *batching optimization* for users who want to prep many todos at once — never a required pre-step. No `--force` flag, no halt.

---

## Status: discussion complete

All structural decisions are locked. Remaining questions are implementation details that can be answered during architect of individual todos.

Next phase: convert this discussion into concrete backlog todos for the slim-down work, ordered telemetry-first per the round-3 decision.

---

## Other open questions

- [ ] Per-todo context: cross-pipeline or this-run scratchpad?
- [ ] Grill-me gating: classification-based vs always-opt-in?
- [ ] Telemetry-first vs slim-down-first ordering?
- [ ] How do we surface "before assuming X, recall verified context" — instruction prose, tool wrapper, or new sub-skill?

---

## Decisions (none yet)

_To be filled as discussion converges._

---

## Next steps (planned)

1. Finish discussion → answers to open questions.
2. Audit current workflow against the proposed shape (what stays, what moves, what dies).
3. Convert audit findings into concrete todos.
4. Run the new todos through the existing `lu` pipeline.
