# Phase 15 Context: Cognition Per-Agent Audit

> Decisions gathered via `/lu-discuss-phase 15` on 2026-02-11.
> These decisions guide research and planning — downstream agents should not re-ask.

---

## Decision 1: Audit Stance — Both Descriptive and Prescriptive

**Question:** Should the audit map current state, define ideal state, or both?
**Decision:** Both. The audit matrix has two columns per agent: current cognition features and ideal cognition features. Gaps emerge from the delta.

**Implication:** Plan needs a discovery task (map current state) AND a design task (define ideal state). Gap analysis is a third task comparing the two.

---

## Decision 2: Four-Tier Cognition Model

**Question:** How many cognition tiers, and what defines each?
**Decision:** 4 tiers (not 3):

| Tier | Name            | Capabilities                                                                 | Example Agents                                    |
| ---- | --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| T0   | Stateless       | No cognition. Receives context from caller only.                             | code-simplifier, ui, ux                           |
| T1   | Memory-Reader   | Loads BRAIN.md + selective MEMORY recall. Never writes WORKING or MEMORY.    | code-architect, security-auditor, research agents |
| T2   | Session-Aware   | Full read + WORKING.md write during execution. Doesn't extract learnings.    | lu-executor, lu-verifier                          |
| T3   | Fully-Cognitive | Full lifecycle — BRAIN load, MEMORY recall, WORKING write, learning extract. | lu-cognition, lu-learner, lu-planner, lu-router   |

**Implication:** All 25 agents need tier assignment. The tier defines what cognition features the agent gets.

---

## Decision 3: Dynamic Tier with Fixed Default

**Question:** Fixed tier per agent, or dynamic based on task?
**Decision:** Dynamic with a fixed default. Each agent has a **default tier** in its metadata. Complexity gating can **promote** an agent to a higher tier for complex tasks (e.g., code-architect promotes from T0 to T1 when complexity >= COMPLEX).

**Implication:** Agent metadata needs both `defaultTier` and `promotableTo` fields. The complexity matrix needs a `cognitionPromotions` section.

---

## Decision 4: Tag-Based Selective Memory Recall

**Question:** How should COGN-05 selective recall work?
**Decision:** Tag-based filtering. Add domain tags to MEMORY.md entries. Agents filter by their relevant tags first, then keyword-refine within matching entries.

**Details:**

- **Semi-fixed vocabulary**: Define ~10-15 core domain tags (verification, hooks, harness, security, cli, templates, memory, agents, complexity, execution, testing, architecture, config, dx). lu-learner can add new tags when none fit.
- **Retroactive tagging**: All 90+ existing MEMORY entries get tagged. One-time effort.
- **Agent metadata defines relevant tags**: Each agent's config lists its domain tags. lu-cognition filters MEMORY by those tags.

**Implication:** MEMORY.md format needs a tag field per entry. lu-cognition recall logic needs tag-first filtering. lu-learner needs tag assignment on write.

---

## Decision 5: Cognition Config in AgentFrontmatter

**Question:** Where does per-agent cognition config live?
**Decision:** Extend `AgentFrontmatter` with a `cognition` field:

```typescript
cognition: {
  defaultTier: 'T0' | 'T1' | 'T2' | 'T3',
  promotableTo?: 'T0' | 'T1' | 'T2' | 'T3',  // optional, for dynamic promotion
  memoryTags: string[],  // domain tags this agent cares about
}
```

Lives in the `.agent.ts` registry file. Compiled into `.md` file frontmatter by the build script.

**Implication:** AgentFrontmatter schema needs updating. Build script needs to emit YAML frontmatter in compiled .md files. All 25 agent .ts files need cognition metadata added.

---

## Decision 6: Tier Promotion via Complexity Matrix

**Question:** How does dynamic tier promotion work?
**Decision:** Extend the existing complexity matrix in config.json. Add a `cognitionPromotions` field per complexity level:

```json
"COMPLEX": {
  "cognitionPromotions": {
    "code-architect": "T1",
    "security-auditor": "T1",
    "performance-auditor": "T1"
  }
}
```

Single source of truth for all complexity-scaled behavior.

**Implication:** Complexity matrix schema needs extending. lu-cognition needs to read complexity level and apply promotions.

---

## Decision 7: Compiled .md Files Get YAML Frontmatter

**Question:** Should compiled agent .md files reflect cognition metadata?
**Decision:** Yes. Build script generates YAML frontmatter in compiled .md files with cognition fields. Makes agent files both human-readable AND machine-parseable.

**Implication:** Build compiler needs updating to emit frontmatter. Existing .md agent files gain a new section. No breaking change (frontmatter is additive).

---

## Scope Guardrail

Phase 15 boundary from ROADMAP.md:

- Audit all 23+ agents for cognition feature usage
- Gap analysis: which agents should have cognition features but don't
- Define cognition tiers (now 4 tiers)
- Per-agent cognition configuration via metadata
- Selective MEMORY recall (tag-based filtering)

**NOT in scope:**

- Actually running all agents with new cognition (that's downstream execution)
- Changing MEMORY.md's core structure beyond adding tags
- Modifying the complexity gating rule itself (just extending the matrix)
- Building new agent types

---

## Deferred Ideas

(None surfaced during discussion)

---

_Context gathered: 2026-02-11_
_Decisions: 7_
_Gray areas resolved: 3/3_
