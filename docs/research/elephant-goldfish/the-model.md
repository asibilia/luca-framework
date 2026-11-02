# The model (from the sources)

Part of [The Elephant-Goldfish Model, and what Luca can take from it](../elephant-goldfish-model.md).

## The model (cited)

### Where it comes from

- The term is Google's. Dave Rensin (Google) coined it in a Medium essay ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874); author page on [research.google](https://research.google/pubs/elephants-goldfish-and-the-new-golden-age-of-software-engineering/)).
- Google ships it as a plugin for Antigravity, Claude Code, and Codex. The README says "Thousands of Google engineers use EGM" ([README.md](https://github.com/google/elephant-goldfish-model/blob/main/README.md), lines 16, 26-44). The README also says "This is not an officially supported Google product" (line 126).
- The repo calls EGM "an implementation of Spec-Driven Development (SDD)" ([docs/getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), lines 5-7).

### The three roles

From the README's role table ([README.md](https://github.com/google/elephant-goldfish-model/blob/main/README.md), lines 84-91):

| Role | Remembers | Job |
|---|---|---|
| **Elephant** | "Your project, requirements, and earlier decisions" | Explore the problem and draft the spec. |
| **Goldfish** | "The document and its referenced source material, without the earlier conversation" | Find missing assumptions, unclear requirements, and implementation risks. |
| **You** | "The goals and constraints that matter" | Resolve trade-offs, approve the design, decide what to build. |

- The Elephant "writes no code" during design. The plugin forbids it from writing production files and allows only scratch code outside the source tree ([resources/execution_instructions.md](https://github.com/google/elephant-goldfish-model/blob/main/resources/execution_instructions.md), lines 3-16).
- Each Goldfish is "a strictly read-only agent" with "zero conversational history" ([agents/comprehension.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/comprehension.md), lines 11-12). Every reviewer persona in `agents/` opens with the same mandates.
- Isolation is enforced. "If your harness has no subagent tool, stop and tell the user: a review in the same context is not a Goldfish review" ([skills/egm-review-loop/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-review-loop/SKILL.md), lines 36-44; also [README.md](https://github.com/google/elephant-goldfish-model/blob/main/README.md), line 93).
- The Elephant also resolves findings afterwards: the "Persistent Resolver" that holds context to judge each finding ([skills/egm-review-loop/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-review-loop/SKILL.md), lines 24-32).

### How the plan is written

- **Brainstorm.** The Elephant interviews you under a no-code rule. Then a "6-lens Goldfish swarm" tries to shoot the idea down. The output is `concepts_brief.md` ([docs/designs/architecture.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md), lines 114-119).
- **Draft.** The brief becomes a design doc under `docs/designs/`, one section at a time, with your feedback after each ([README.md](https://github.com/google/elephant-goldfish-model/blob/main/README.md), lines 62-68). The draft has a high-level part (`FeatureRange`) and a detailed plan (`DetailedRange`) so reviewers can aim at each ([architecture.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md), lines 121-128).
- **Sections.** Rensin's order: the problem, the technical plan, alternatives considered, and a detailed implementation plan that names "every single file that will be created or changed, and the rationale" ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Phase 2"). The draft skill enforces the file list ([skills/egm-draft/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-draft/SKILL.md), lines 217-228).
- **Alternatives are guardrails.** Rejected ideas go in the doc because they "will become important guardrails against future hallucinations and arguments" ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Phase 2", item 3).
- **The bar for the plan.** "A plan passes if a competent engineer (or fresh AI session) who is unfamiliar with the codebase can execute the plan ... without guessing". The "Zero-Decision Rule": the plan must leave "zero design or architectural choices to the implementer". Each phase must leave the code buildable and testable ([resources/document_standards/implementation-readiness-standard.md](https://github.com/google/elephant-goldfish-model/blob/main/resources/document_standards/implementation-readiness-standard.md), lines 5-23).

### How the Goldfish review works

The review runs five stages in order ([docs/designs/review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 42-100):

1. **Zoom out.** A "Skeptical Architect" checks the framing, cuts speculative features (YAGNI), and looks for code to reuse.
2. **Comprehension.** A "Naive Reader" must first paraphrase what the doc proposes and how the current system works. A section it can't paraphrase is a blocker ([agents/comprehension.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/comprehension.md), lines 37, 56-57). This is Rensin's "Goldfish test": "If the Goldfish cannot explain your system based only on that document and the files it references, your doc is missing context" ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Step 5").
3. **Critic.** Design critic, structure, and style reviewers probe failure modes, scale limits, and edge cases.
4. **Zoom out again.** It prunes the defensive extras the critics' fixes added.
5. **Implementation readiness.** A "Tech Lead Auditor" checks the plan is deterministic. A "Codebase Auditor" checks named paths and signatures against the live code, "to prevent drift and hallucinated APIs" (lines 104-117).

A synthesizer agent runs reviewers in parallel, dedupes their findings, and hands the Elephant one short message, to keep the Elephant's context clean ([agents/synthesizer.md](https://github.com/google/elephant-goldfish-model/blob/main/agents/synthesizer.md), lines 12-14).

### How results flow back

- The Elephant sorts each finding into `PROPOSE FIX`, `CONTEST`, `ESCALATE`, or `DECLINE`. "A contest must cite evidence the reviewer could read." Comprehension gaps can't be contested ([review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 132-149).
- Contested and declined findings stay settled across rounds. A fixed finding re-opens if a later reviewer raises it again.
- **Convergence:** a round is clean with no unsettled Blocker or Major. The loop ends after **two clean rounds in a row**, "because the next fresh reviewer can find a different gap in the same text". It caps at 5 rounds. "Churn" (a new finding that reverting an earlier fix would solve) also stops the loop and asks you ([skills/egm-review-loop/SKILL.md](https://github.com/google/elephant-goldfish-model/blob/main/skills/egm-review-loop/SKILL.md), lines 149-173; [review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 164-174).
- Then a human reviews the doc in a pull request ([docs/getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), lines 72-74).

### Implementation, and after

- EGM does not run implementation. "Coding agents implement code strictly adhering to the approved design document. (No Skill.md is required here ...)" ([architecture.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md), lines 153-157). The guide says "Tell AI to build to the plan" and, if it's "wildly off, update the design doc and try again" ([getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), lines 76-79).
- Rensin's essay is the only place a fresh session *builds*: "If during the implementation session(s) the AI spins out or crashes, you just open a new session, hand it the design doc ... and you are immediately back in business" ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Step 8"). He does not call that session a goldfish.
- After the code: a "mean" code review ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Step 9"), and a weekly `/egm-drift-report` that compares checked-in docs with code. "Either update the doc, or the code. Human picks which" ([getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), lines 86-96; [docs/designs/drift_report.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/drift_report.md)).
- For large codebases, `/egm-bootstrap` writes a `README.md` per folder, bottom-up, so the Elephant can load the system cheaply ([getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), lines 116-135). Rensin calls these "peanuts and hay"; he says leaf READMEs come out "about 50% wrong" and need a person to fix them ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Bootstrapping Your Reality").

### Failure modes it addresses

From [architecture.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/architecture.md), lines 22-36:

1. **Hallucination cascades and context pollution.** One thread that interviews, designs, and codes "validates its own faulty assumptions".
2. **Premature implementation.** Agents start coding in nearby files before placing the change well.
3. **Chat dump fatigue.** Long specs and reviews in chat clutter the session. Hence the "Artifact-First UX" rule: write files, not chat (lines 161-175).
4. **Documentation drift.** Design docs rot as code changes.

The review design adds that self-review has "severe confirmation bias": "The model assumes the context it holds in memory is obvious from the text" ([review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 27-38).

### Stated trade-offs

- Not for small, clear bug fixes ([README.md](https://github.com/google/elephant-goldfish-model/blob/main/README.md), line 20).
- Review "will provide *a lot* of feedback by design. Take what you think is relevant" ([getting_started.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md), lines 69-70). Rensin finds "about 30%" of critic suggestions highly valuable ([essay](https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874), "Step 6").
- Design review can become a human bottleneck; use EGM for "What's important now?". Finishing the workflow "does not demonstrate a productivity improvement". A doc complete enough for a zero-context agent is realistic "Sometimes, but not always" ([docs/faq.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/faq.md), lines 29-57).
- Security is not a named review stage. That point comes from press coverage, not the repo ([Help Net Security](https://www.helpnetsecurity.com/2026/10/26/google-elephant-goldfish-model-plugin/)), but it matches the persona list in [review.md](https://github.com/google/elephant-goldfish-model/blob/main/docs/designs/review.md), lines 108-117.
