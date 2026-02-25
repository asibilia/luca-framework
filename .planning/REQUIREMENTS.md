# Requirements — v1.8.0 Functional Architecture & Bridge Unification

## Phase 52 — Functional Agent Factories

### R52-1: Create `createAgent()` factory function

- **Must:** Create `createAgent(config: AgentConfig): BaseAgent` factory in `src/agents/base/base-agent.ts`
- **Must:** Follow exact pattern of existing `createRule()` in `src/rules/base/base-rule.ts`
- **Must:** Return object implementing `BaseAgent` interface (config, name, description, toCursorFormat, toClaudeFormat)
- **Must:** Use Zod `agentConfigSchema.parse(config)` for validation (same as current constructor)
- **Must:** Keep `BaseAgent` interface unchanged (no breaking changes to consumers)
- **Should:** Remove `BaseAgentImpl` abstract class after all agents migrated
- **Verify:** `bun test` passes, `bunx --bun tsc --noEmit` reports 0 errors

### R52-2: Migrate all 28 agents to factory pattern

- **Must:** Convert each agent from `class XAgent extends BaseAgentImpl` to `export const xAgent = createAgent(config)`
- **Must:** Remove class definitions and class exports from all 28 agent files
- **Must:** Keep config objects unchanged (frontmatter, sections, cognition, context)
- **Must:** Maintain all existing agent names and descriptions
- **Verify:** Each agent file exports a `BaseAgent` instance, not a class
- **Verify:** `bun test` passes after each batch of migrations

### R52-3: Update agent registry

- **Must:** Update `src/agents/index.ts` registry from `() => new XAgent()` to `() => xAgent`
- **Must:** Remove all class imports, replace with instance imports
- **Must:** Verify registry returns identical output for all 28 agents
- **Verify:** `bun run build:all` succeeds
- **Verify:** `bun run check:drift` passes (generated outputs match)
- **Verify:** `bun test` passes with all tests green

## Phase 53 — Functional Skill Factories

### R53-1: Create `createSkill()` factory function

- **Must:** Create `createSkill(config: SkillConfig): BaseSkill` factory in `src/skills/base/base-skill.ts`
- **Must:** Follow exact pattern of `createAgent()` and `createRule()`
- **Must:** Return object implementing `BaseSkill` interface
- **Must:** Use Zod `skillConfigSchema.parse(config)` for validation
- **Should:** Remove `BaseSkillImpl` abstract class after all skills migrated
- **Verify:** `bun test` passes, `bunx --bun tsc --noEmit` reports 0 errors

### R53-2: Migrate all 45 skills to factory pattern

- **Must:** Convert each skill from `class XSkill extends BaseSkillImpl` to `export const xSkill = createSkill(config)`
- **Must:** Remove class definitions and class exports from all 45 skill files
- **Must:** Keep config objects unchanged (frontmatter, sections)
- **Must:** Maintain all existing skill names and descriptions
- **Verify:** Each skill file exports a `BaseSkill` instance, not a class
- **Verify:** `bun test` passes after each batch of migrations

### R53-3: Update skill registry

- **Must:** Update `src/skills/index.ts` registry from `() => new XSkill()` to `() => xSkill`
- **Must:** Remove all class imports, replace with instance imports
- **Must:** Verify registry returns identical output for all 45 skills
- **Verify:** `bun run build:all` succeeds
- **Verify:** `bun run check:drift` passes
- **Verify:** `bun test` passes with all tests green

## Phase 54 — State Machine Bridge Migration

### R54-1: Audit skill bridge adoption

- **Must:** Identify all skills that read/write STATE.md directly
- **Must:** Categorize each skill's state access pattern (read-only, write, both)
- **Must:** Document which skills already use bridge pattern
- **Verify:** Audit report with complete coverage of all 45 skills

### R54-2: Migrate skills to bridge with fallback

- **Must:** Replace `cat .planning/STATE.md` with `bun run packages/luca-state/src/bridge.ts read-status 2>/dev/null || cat .planning/STATE.md`
- **Must:** Replace `grep ... STATE.md` complexity reads with `bun run packages/luca-state/src/bridge.ts read-complexity 2>/dev/null || grep ...`
- **Must:** Replace direct STATE.md writes with bridge transitions + STATE.md fallback
- **Must:** Keep backward-compatible fallback (`2>/dev/null || ...`) for all bridge calls
- **Must:** Preserve existing skill behavior — bridge is a drop-in replacement
- **Verify:** `bun test` passes
- **Verify:** `bun run build:all` succeeds
- **Verify:** `bun run check:drift` passes

---

_Requirements generated: 2026-02-25 (v1.8.0 milestone)_
