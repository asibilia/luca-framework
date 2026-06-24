---
phase: 206
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 206 Plan 1: Tab Container Extraction + Config Form Shared Layout

## Objective

Extract a shared `EntityTabContainer` component that consolidates the 85-90% identical tab container logic across agents, skills, and rules. Extract a shared `ConfigFormSection` layout component for consistent form field rendering. Replace all three entity-specific tab containers with thin wrappers around the shared component.

## Context

@packages/luca-studio/components/agents/agent-tab-container.tsx
@packages/luca-studio/components/skills/skill-tab-container.tsx
@packages/luca-studio/components/rules/rule-tab-container.tsx
@packages/luca-studio/components/agents/agent-config-form.tsx
@packages/luca-studio/components/skills/skill-config-form.tsx
@packages/luca-studio/components/rules/rule-config-form.tsx
@packages/luca-studio/components/shared/index.ts
@packages/luca-studio/app/agents/page.tsx
@packages/luca-studio/app/skills/page.tsx
@packages/luca-studio/app/rules/page.tsx
@.planning/phases/206-component-dry-convention-alignment/01-CONTEXT.md

## Tasks

### 1. Create EntityTabContainer shared component

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/components/shared/entity-tab-container.tsx` containing the unified tab container. The component accepts:

- `name: string` -- entity name for dirty tracking
- `detail: EntityDetail` -- full entity detail from API
- `entityType: "agent" | "skill" | "rule"` -- determines dirty key prefix
- `isEditing?: boolean` / `onEnterEdit?` / `onExitEdit?` -- edit mode props
- `configForm: React.ComponentType<{ name: string; detail: EntityDetail; isEditing?: boolean }>` -- entity-specific config form
- `hasPromptTab?: boolean` -- renders Prompt tab with CodeMirrorWrapper (agent-only, default false)
- `hasCompiledTab?: boolean` -- renders Compiled tab with fetch logic (agent + skill, default false)
- `promptContent?: string` -- prompt text when hasPromptTab is true

Shared logic to extract:

- Tab state management (activeTab useState)
- Dirty tracking via `dirtySetAtom` with `${entityType}:${name}` key
- Mode header (editing indicator, dirty state, edit/exit buttons) -- identical across all three
- Source tab: sourceContent reconstruction from `detail.metadata.prefix/suffix`
- Compiled tab: fetchCompiled logic, loading/error/sidecar-offline states, fallback content
- Tab list construction: Configure always present, Prompt/Source/Compiled conditional

**Files to create:**

- `packages/luca-studio/components/shared/entity-tab-container.tsx`

**Verification:**

- TypeScript compiles without errors (`bunx --bun tsc --noEmit`)
- Component exports EntityTabContainer and EntityTabContainerProps

### 2. Create ConfigFormSection shared layout component

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/components/shared/config-form-section.tsx` containing the shared form section layout. This replaces the inline `FormField` components duplicated across config forms.

The component handles:

- Label rendering (text-xs font-medium text-muted-foreground)
- Read-only vs editing mode display
- Text input (textarea or Input based on `multiline` prop)
- Boolean input (using shadcn Switch, not custom toggle)
- Badge display for read-only boolean values

Props:

- `label: string`
- `value: string | boolean`
- `isEditing?: boolean`
- `onChange: (value: unknown) => void`
- `type?: "text" | "boolean" | "select"` (default "text")
- `multiline?: boolean` (default false, renders textarea when true)
- `htmlFor?: string`
- `placeholder?: string`
- `readOnly?: boolean`

**Files to create:**

- `packages/luca-studio/components/shared/config-form-section.tsx`

**Verification:**

- TypeScript compiles without errors
- Component exports ConfigFormSection

### 3. Update shared barrel index

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Add re-exports for `EntityTabContainer` and `ConfigFormSection` to the shared components barrel.

**Files to edit:**

- `packages/luca-studio/components/shared/index.ts`

**Verification:**

- Both components importable via `~/components/shared`

### 4. Replace agent-tab-container.tsx with EntityTabContainer

**Type:** auto
**TDD:** false
**Depends on:** 1

Rewrite `agent-tab-container.tsx` to be a thin wrapper around `EntityTabContainer`:

- Pass `entityType="agent"`, `hasPromptTab={true}`, `hasCompiledTab={true}`
- Extract promptContent from rawConfigText using the existing useMemo logic (move to agent wrapper)
- Pass `configForm={AgentConfigForm}`
- Keep the same export name (`AgentTabContainer`) for backward compat with page imports

**Files to edit:**

- `packages/luca-studio/components/agents/agent-tab-container.tsx`

**Verification:**

- TypeScript compiles without errors
- File reduced from ~313 lines to ~50 lines
- Export name unchanged (no page import changes needed)

### 5. Replace skill-tab-container.tsx with EntityTabContainer

**Type:** auto
**TDD:** false
**Depends on:** 1

Rewrite `skill-tab-container.tsx` to be a thin wrapper:

- Pass `entityType="skill"`, `hasPromptTab={false}`, `hasCompiledTab={true}`
- Pass `configForm={SkillConfigForm}`

**Files to edit:**

- `packages/luca-studio/components/skills/skill-tab-container.tsx`

**Verification:**

- TypeScript compiles without errors
- File reduced from ~268 lines to ~40 lines

### 6. Replace rule-tab-container.tsx with EntityTabContainer

**Type:** auto
**TDD:** false
**Depends on:** 1

Rewrite `rule-tab-container.tsx` to be a thin wrapper:

- Pass `entityType="rule"`, `hasPromptTab={false}`, `hasCompiledTab={false}`
- Pass `configForm={RuleConfigForm}`

**Files to edit:**

- `packages/luca-studio/components/rules/rule-tab-container.tsx`

**Verification:**

- TypeScript compiles without errors
- File reduced from ~159 lines to ~35 lines

### 7. Unify Switch usage in agent and skill config forms

**Type:** auto
**TDD:** false
**Depends on:** 2

Replace the custom hand-rolled toggle button in `agent-config-form.tsx` (lines 193-209) and `skill-config-form.tsx` (lines 136-152) with shadcn `Switch` component. The rule config form already uses `Switch` correctly (line 9, 172, 193).

The custom toggle pattern to replace:

```tsx
<button type="button" role="switch" aria-checked={...} onClick={...}
  className="relative inline-flex h-5 w-9 ...">
  <span className="pointer-events-none block size-4 rounded-full ..." />
</button>
```

Replace with:

```tsx
<Switch checked={value} onCheckedChange={(checked) => onChange(checked)} />
```

**Files to edit:**

- `packages/luca-studio/components/agents/agent-config-form.tsx`
- `packages/luca-studio/components/skills/skill-config-form.tsx`

**Verification:**

- TypeScript compiles without errors
- Both files import `Switch` from `~/components/ui/switch`
- No more hand-rolled toggle `<button role="switch">` elements
- All three config forms now use shadcn Switch consistently

## Verification

1. Run `bunx --bun tsc --noEmit` -- zero type errors
2. Visual verification: Agents page shows 4 tabs (Configure, Prompt, Source, Compiled)
3. Visual verification: Skills page shows 3 tabs (Configure, Source, Compiled)
4. Visual verification: Rules page shows 2 tabs (Configure, Source)
5. Edit mode header shows "Editing: {name}" with dirty indicator on all three
6. Compiled tab fetches and renders markdown on agents and skills
7. Boolean toggles use shadcn Switch consistently across all three config forms

## Success Criteria

- Total lines removed across three tab containers exceeds 400 lines
- EntityTabContainer is the single source of truth for tab layout, mode header, and compiled fetch
- ConfigFormSection provides consistent form field layout
- All three entity pages render identically to their pre-extraction state
- Zero TypeScript compilation errors

## Output Specification

- `packages/luca-studio/components/shared/entity-tab-container.tsx` (new)
- `packages/luca-studio/components/shared/config-form-section.tsx` (new)
- `packages/luca-studio/components/shared/index.ts` (updated)
- `packages/luca-studio/components/agents/agent-tab-container.tsx` (rewritten to thin wrapper)
- `packages/luca-studio/components/skills/skill-tab-container.tsx` (rewritten to thin wrapper)
- `packages/luca-studio/components/rules/rule-tab-container.tsx` (rewritten to thin wrapper)
- `packages/luca-studio/components/agents/agent-config-form.tsx` (Switch unification)
- `packages/luca-studio/components/skills/skill-config-form.tsx` (Switch unification)
