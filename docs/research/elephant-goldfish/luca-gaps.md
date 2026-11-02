# Luca today, gaps and recommendations

Part of [The Elephant-Goldfish Model, and what Luca can take from it](../elephant-goldfish-model.md).

## Luca today (mapped)

Luca's plan side lives outside the engine. "Our own planning tools: Matt Pocock's skills own planning" (#325, Out of scope). `luca init` installs `to-spec`, `to-tickets`, `grilling`, and `domain-modeling` (`packages/engine/src/cli/init.ts:105-114`). So the Elephant is the owner's `/grilling` + `/to-spec` + `/to-tickets` chat. The engine starts at intake.

| EGM element | Luca today | Status |
|---|---|---|
| Elephant: long session that holds context and drafts the plan | The owner's planning chat with `/grilling`, `/to-spec`, `/to-tickets` (`init.ts:105-114`). Not Luca's code. | Present, outside the engine |
| Design doc as the source of truth | The **spec** and its **tickets**, snapshotted into the **journal** at **intake** (`how-a-run-moves.md:7-10`). Every agent prompt carries the spec and ticket word for word (`src/agents/role-prompts.ts:112-154`, spec at 143, ticket at 145). | Present |
| "Alternatives considered" section | `/to-spec`'s template has Out of Scope and Further Notes, but no Alternatives section (`~/.claude/skills/to-spec/SKILL.md`). | Missing |
| Every file named in the plan | `/to-spec` says the opposite: "Do NOT include specific file paths" (same file). | Different choice, on purpose |
| Goldfish comprehension test before code | **Intake** is plain code: a Testing Decisions section (`src/intake/intake-checks.ts:317-318`), What to build (343-345), acceptance checkboxes (350-355), and criteria with no placeholders, untestable asks, or "unchanged" wording (`src/intake/criteria-checks.ts:18-40`, 86-112). No model reads the spec cold. | Missing |
| Implementation-readiness goldfish ("zero decisions left") | Partly covered by the placeholder check (#541, #641). Agents are told the opposite of zero-decision: "make your best call and list it under 'assumptions'. Don't stop to ask" (`src/agents/common-instructions.ts:74`). | Partial |
| Codebase auditor (named APIs exist) | Nothing checks the spec's named modules or seams against code before a run. | Missing |
| Fresh session builds from the doc | Every **agent** is a fresh session with one **role** on one **ticket** (`GLOSSARY.md`, Agent). Tickets are sized "to fit in a single fresh context window" (`to-tickets` SKILL.md, line 33). A cut-off turn is redone by a fresh agent (`docs/crash-recovery.md:19`). | Present, and stronger than EGM |
| Small-context memory for fresh sessions | **Run notes** (10 newest; `docs/choices-made.md:89-90`), **recall points** (`docs/memory.md:27-30`), and the repo's rule files named to writers (`common-instructions.ts:88`). | Present, different shape |
| Goldfish isolation and read-only reviewers | **Ticket review** by a fresh, read-only reviewer (`src/agents/reviewer-instructions.ts:7-18`). Five fresh **lenses** in the **final review** (`reviewer-instructions.ts:73-83`; `how-a-run-moves.md:67`). | Present |
| Re-reviews without the author's bias | Re-reviews see only new changes plus earlier findings and fixers' answers (`reviewer-instructions.ts:25-28`, 90-93). The **fresh pass** reads the whole branch "with no earlier findings, answers, or rulings" (`docs/final-review.md:73-84`). | Present for the final review |
| "Mean" code review after build | Ticket review, five lenses, fresh pass. | Present, and stronger |
| Resolution: fix / contest / escalate / decline | Fixers answer `fixed`, `wont_fix`, or `other_role`; a fresh reviewer rules `accepted` or `rejected` (`docs/ticket-review.md:33-57`; `src/agents/common-instructions.ts`, REVIEW_FIXER). Unresolved work becomes **stuck** and an **escalation**. | Present. No rule that a `wont_fix` must cite evidence. |
| Convergence: two clean rounds, cap 5, churn stop | **Fix loop** capped at 3 rounds, then stuck (`docs/ticket-review.md:51-52`; `final-review.md:70-72`). One fresh pass per final review. No churn check. | Partial |
| Synthesizer dedupes findings | The engine (plain code) collects schema-checked findings. Lenses "stay in your lane" (`reviewer-instructions.ts:79`). | Present, in code, not a model |
| Artifact-first, not chat | The journal, the spec-issue comments, `pull-request.md` and the PR (`how-a-run-moves.md:93`). | Present |
| Drift report: docs vs code over time | The integration lens checks "gaps: what the spec needs that no ticket covered" in one run (`reviewer-instructions.ts:53-56`). The **feature map** ties features to tests. Nothing compares a merged spec with later code. | Partial |
| README hierarchy for cheap context | None. Agents explore with read-only Haiku **helpers** (`GLOSSARY.md`, Helper). | Missing (optional) |
| Human approves the design before build | The owner labels tickets `ready-for-agent`; intake refuses bad ones with `needs-info` (#333). | Present |

### Evidence from Luca's own runs

- Spec #510's run: four agents guessed a commit message's "round N" four ways. "The run made 64 assumptions across 3 tickets, and many were gaps like this" (#541).
- Later runs listed 100 assumptions (spec #641) and 169 and 155 (two heartgold-plus runs). Part of that was noise, which #655 fixed. The rest is what a comprehension goldfish would have caught before the run.
- The PR lists assumptions as one flat list (`src/core/pull-request-text.ts:168-176`, 242-244). It does not split out "the spec didn't say", the "maybe" from #541.

## Gaps & recommendations (ranked)

### 1. A goldfish spec check before `ready-for-agent` (most value)

- **What.** A new Luca skill, say `/luca-spec-check <spec>`. It starts fresh, read-only agents that see only the spec issue, its tickets, the files and docs they name, `GLOSSARY.md`, and the rule files. Three of them, after EGM:
  1. **Comprehension:** paraphrase what the spec proposes and how the current system works. A section it can't paraphrase is a blocker.
  2. **Readiness:** for each ticket, list every call the test-writer or implementer would have to make alone (names, texts, formats, limits, error cases). Each one becomes a question to pin in the spec.
  3. **Codebase:** check that each module, seam, and test file the spec names exists and works as described.
  It writes one report, comments on the spec issue, and stops. The owner fixes the spec and runs it again.
- **Where.** `packages/engine/skills/luca-spec-check/` next to `luca-retro` and `luca-unstick`, installed the same way. No engine change.
- **Why.** EGM's core claim: the author's context hides gaps that a cold reader finds ([review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 27-38; [comprehension.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/comprehension.md), line 37). Luca's runs show those gaps arrive as assumptions and fix rounds (#541, #655). An assumption caught before the run costs one spec edit. Caught during the run, it costs a guess, a review finding, and maybe a fix round.
- **Why a skill, not an engine step.** Planning is out of the engine's scope (#325), the engine moves stages in plain code, and an unattended run can't ask "which do you mean?". A skill keeps the owner in the loop, which is where EGM puts the Elephant.
- **How to tell it works.** Compare assumptions per ticket and review fix rounds per ticket in the journal, for specs checked and not checked.
- **Size.** S-M (one SKILL.md, three reviewer prompts, a small script to fetch the spec and tickets, a skill-text test like `luca-retro`'s).

### 2. Split "the spec didn't say" out of the PR's assumptions

- **What.** Agents tag each assumption: `spec_gap` (the spec or ticket didn't settle it) or `other`. The PR groups spec gaps under their own heading. The learner can propose a memory when the same kind of gap repeats.
- **Where.** The assumptions schemas in `src/agents/role-results.ts:163` and `:294`, the definition in `src/agents/common-instructions.ts:74-77`, the fixer text in REVIEW_FIXER (`common-instructions.ts:103`), and the PR text in `src/core/pull-request-text.ts:168-176`, 242-244.
- **Why.** This is the goldfish signal Luca already pays for. Every run is a free comprehension test of its spec. #541 asked for this as a "maybe". EGM's loop exists to feed doc gaps back into the doc ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Step 5": "Add the details and repeat until it passes").
- **Size.** S.

### 3. Add "Alternatives considered" to specs, and show it to reviewers

- **What.** A short section in the spec listing options that were weighed and dropped, and why. Reviewers and lenses are told not to raise a dropped option as a finding unless they show the reason no longer holds.
- **Where.** The spec template. `/to-spec` comes from `mattpocock/skills` (`init.ts:105`), so either ask upstream, or keep the section as Luca's own text in the spec-check skill (rec. 1) and the reviewer prompts (`src/agents/reviewer-instructions.ts:7-34`, 73-99). Intake could treat it as optional.
- **Why.** Rensin: rejected ideas "will become important guardrails against future hallucinations and arguments" ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Phase 2"). Today a lens can re-propose a design the owner already ruled out, which costs a fix round or a `wont_fix` ruling.
- **Size.** S.

### 4. A `wont_fix` must cite something the reviewer can read

- **What.** A fixer's `wont_fix` reason names a file and line, a test, or a spec line. The ruling reviewer is told that a reason with no evidence is `rejected`.
- **Where.** REVIEW_FIXER in `src/agents/common-instructions.ts`, and the rulings text in `src/agents/reviewer-instructions.ts:28`, 93.
- **Why.** EGM: "A contest must cite evidence the reviewer could read" ([review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), line 148). It keeps pushback honest without another agent.
- **Size.** S (prompt text and a text test).

### 5. Stop early on review churn

- **What.** If a new finding sits on lines an earlier fix round changed, and undoing that fix would answer it, the engine marks the review stuck at once with reason `churn`, instead of spending the rest of the rounds.
- **Where.** The fix-round decisions for ticket reviews and the final review (`src/core/decide-build*.ts`, `src/core/decide-final-fix.ts`), using the journal's commit and finding records. The "revert would fix it" part needs judgment, so the reviewer could flag it in its result instead.
- **Why.** EGM stops on churn before its cap ([egm-review-loop/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-review-loop/SKILL.md), lines 164-173). Luca's cap of 3 is low already, so the saving is small.
- **Size.** M. Do it only if journals show fix rounds that undo each other.

### 6. Spec drift check (optional, low)

- **What.** Extend the integration lens, or rec. 1's codebase reader, to check a spec's Implementation Decisions against code that other merged specs touched since. Or run a `/egm-drift-report`-style pass over the feature map.
- **Why.** EGM's drift problem ([drift_report.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/drift_report.md)). It matters less for Luca: a spec is an issue that closes when its PR merges, not a living doc. The feature map is Luca's living doc, and the red check already keeps it current.
- **Size.** M. Low priority.

## Don't adopt

- **The zero-decision rule as a hard gate.** Luca chose "runs stop only when stuck" and assumptions listed in the PR (#325 standing preferences; #338). Refusing every spec that leaves any choice would stop most runs. Use readiness findings as advice (rec. 1), not as an intake failure.
- **Every file path in the spec.** `/to-spec` forbids paths because they go stale, and Luca's tickets build in order on a moving run branch. EGM itself needs a Codebase Auditor to catch stale paths ([review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), line 114). Luca's tests at named seams pin behavior better than file lists.
- **Conversation rules inside the engine.** "ONE QUESTION AT A TIME", consensus gates at each step, and section-by-section drafting ([execution_instructions.md](https://github.com/google/elephant-goldfish-model/blob/main/resources/execution_instructions.md), lines 17-25) are for a human in a chat. The engine runs unattended. They belong, if anywhere, in the planning skills.
- **An LLM synthesizer.** EGM needs one because its reviewers answer in free text ([synthesizer.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/synthesizer.md), line 12). Luca's reviewers return schema-checked findings, and plain code collects them. A model in that step adds cost and a non-deterministic hop.
- **Five review rounds and two clean rounds in a row.** Every Luca reviewer runs Opus at xhigh effort. Luca already does one fresh full read before the PR (`final-review.md:73-84`). Two extra full rounds per ticket would cost far more than the findings EGM itself rates at about 30% useful.
- **Style and structure reviewers for specs.** Intake already checks the sections that matter in plain code. Copy-editing a spec issue that closes at merge isn't worth an agent.
- **A README per folder.** Rensin's own numbers (leaf READMEs "about 50% wrong", a person fixes each) make it a repo chore, not an engine feature. Helpers and memory cover the same need. Revisit only if journals show agents spending many turns finding their way.
