# Phase 04 Summary: Skill Dual-Vault Integration

## Objective

Update all skills and agents for scoped dual-vault recall and write routing. Every MuninnDB operation now uses config-driven vault resolution instead of hardcoded `vault: "default"`.

## Completed Tasks

### Plan 01: Vault-Routing Rule and CLAUDE.md Instructions

- Created `src/rules/general/vault-routing.rule.ts` documenting dual-vault architecture
- Updated `~/.claude/CLAUDE.md` with two-vault model, write routing, and recall routing summaries
- Registered vault-routing rule in `src/rules/__helpers/assemble-registry.ts`

### Plan 02: lu-cognition Dual-Vault Recall and lu-learner Write Routing

- `src/agents/general/lu-cognition.agent.ts`: Added `resolve_vaults` step, dual-vault recall in `selective_recall` (23 refs replaced)
- `src/agents/general/lu-learner.agent.ts`: Added vault resolution preamble, write routing by concept prefix (14 refs replaced)

### Plan 03: Mechanical Vault Replacement in Remaining Skills and Agents

- 16 agent/skill files updated (81 hardcoded vault refs replaced with config-driven routing)
- Split into two parallel executors (8 files each) for efficiency
- Post-verification caught `workflow-save.skill.ts` (5 Python-style refs) — fixed manually

## Verification Results

| Check                                                      | Result    |
| ---------------------------------------------------------- | --------- |
| `bunx --bun tsc --noEmit`                                  | Pass      |
| Hardcoded `vault: "default"` in agent/skill prompt content | 0 matches |
| Python-style `vault="default"`                             | 0 matches |
| All agents/skills have vault resolution preamble           | Confirmed |

## Commits

- `e364bc34` -- feat(agents): add dual-vault support to lu-cognition and lu-learner
- `e5504b06` -- feat(vault): replace hardcoded vault refs with config-driven dual-vault routing
