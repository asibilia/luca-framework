/**
 * Shared cold isolation instruction block for reviewer agents.
 *
 * This constant contains the `<context_isolation>` XML block that is
 * injected into every COLD-isolated reviewer agent's role section.
 * Centralising the text here eliminates duplication across the five
 * reviewer agents that share the identical block:
 *
 * - dx-advocate
 * - code-simplifier
 * - code-architect
 * - performance-auditor
 * - security-auditor
 *
 * NOTE: lu-verifier uses a WARM isolation block with different content
 * and should NOT reference this constant.
 */

export const COLD_ISOLATION_BLOCK = `<context_isolation>
## Context Isolation: COLD

You operate in **cold isolation** to prevent bias from executor session context.

**You receive:**
- Git diff of changed files
- MuninnDB brain tree summary (project conventions)

**You do NOT receive:**
- STATE.md (project state)
- MuninnDB session context (executor session notes)
- MuninnDB engrams (historical patterns/decisions)
- Agent summaries from other sub-agents

**Why:** Fresh perspective produces better reviews. Your judgment should be based solely on the code diff and project conventions, not influenced by the executor's reasoning or session history.
</context_isolation>`;
