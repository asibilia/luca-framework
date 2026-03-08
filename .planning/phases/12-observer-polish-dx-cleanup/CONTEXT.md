# Phase 12: Observer Polish & DX Cleanup — Context

## Gray Area Decisions

### 1. Observer CSS Class Fragility Remediation

**Decision:** Never use inline styles. Restructure all dynamic/missing CSS classes to use statically analyzable Tailwind class names. Install and use `clsx` + `class-variance-authority` (CVA) for dynamic class composition.

**Scope:** Fix all missing CSS class issues flagged in the milestone audit:

- H6/H7: todo-tracker dynamic colors and contrast issues
- M12: memory-entries `line-clamp-2`, `underline-offset-2`
- M13: todo-tracker destructive error state classes
- M14: memory-entries `max-h-[36rem]` arbitrary value
- L13: json-viewer `border-destructive/50`
- L14: brain-panel, working-sections, memory-entries, page `text-muted-foreground/60` (4 files)
- L15: memory-entries, working-sections `border-border/30`

**Approach:** Replace opacity modifier syntax (`text-muted-foreground/60`, `bg-success/10`) with explicit opacity utilities or CVA variants that Tailwind's scanner can statically analyze. Use `clsx` for conditional class merging instead of template literal interpolation.

[user-input]

### 2. Cold Isolation Prompt Deduplication

**Decision:** Extract the 637-char cold isolation instruction block shared across 5 reviewer agents (dx-advocate, code-simplifier, code-architect, performance-auditor, security-auditor) into a shared constant in `src/agents/__helpers/`. The compiler or agent factory should inject it at build time rather than each agent file duplicating the block.

The `context_isolation` field in agent frontmatter (M17) refers to this same concept — extract it as a reusable block that agents reference rather than inline.

[user-input]

### 3. ErrorBoundary + Loading State Scope

**Decision:** Single app-level `<ErrorBoundary>` wrapper with per-page fallback UI. Each page provides its own error fallback component, but the boundary itself is at the app level.

**Scope of M19-M20:** The remaining items are new MuninnDB observer components added in Phase 10 that were not covered by Phase 4's `LoadingSkeleton` and error boundary work. Specifically, the brain-panel, context-usage-bar, working-sections, and memory page components need error boundaries and loading states added.

[user-input]
