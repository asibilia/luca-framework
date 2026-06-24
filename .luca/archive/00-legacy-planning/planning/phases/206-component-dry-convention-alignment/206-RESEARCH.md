# Phase 206: Component DRY & Convention Alignment - Research

**Researched:** 2026-03-26
**Domain:** React component extraction, convention fixes, code reuse
**Confidence:** HIGH

## Summary

Phase 206 targets component consolidation and convention fixes in luca-studio. Three tab containers (agents, skills, rules) are 85-90% identical with only tab structure and entity-specific forms varying. Config forms share layout patterns but differ in fields. Convention fixes are mechanical and independent.

**Primary recommendation:** Extract `EntityTabContainer` component accepting a render prop for the config form. Extract `ConfigFormSection` layout component. Apply convention fixes file-by-file.

## Tab Container Analysis

### Structural Mapping

All three containers share:

| Aspect             | Agent                                                                | Skill                                                  | Rule                  |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------- |
| **Tabs**           | 4 (Configure, Prompt, Source, Compiled)                              | 3 (Configure, Source, Compiled)                        | 2 (Configure, Source) |
| **Mode header**    | Identical layout (Editing indicator, dirty state, edit/exit buttons) | Identical layout                                       | Identical layout      |
| **DirtyIndicator** | Configure tab header                                                 | Configure tab header                                   | Configure tab header  |
| **Config form**    | AgentConfigForm                                                      | SkillConfigForm                                        | RuleConfigForm        |
| **Agent-specific** | CodeMirrorWrapper on Prompt tab                                      | N/A                                                    | N/A                   |
| **Source tab**     | Reconstructs from metadata + rawConfigText                           | Identical pattern                                      | Identical pattern     |
| **Compiled fetch** | Full compiled output fetch + error handling (5 states)               | Full compiled output fetch + error handling (5 states) | None (not present)    |

### Exact Differences

**Prompt tab (agents only):**

- Lines 241-261 in agent-tab-container.tsx
- CodeMirrorWrapper + Info banner + special handling
- Skills/Rules have no equivalent

**Compiled tab variation:**

- Agents: Full 503/error/success handling + sidecar offline state
- Skills: Full 503/error/success handling + sidecar offline state
- Rules: **ABSENT** (TAB_IDS excludes it)

**Tab list construction:**

- Agent: 4 triggers (Configure, Prompt, Source, Compiled)
- Skill: 3 triggers (Configure, Source, Compiled)
- Rule: 2 triggers (Configure, Source)

### Extraction Strategy

**EntityTabContainer props:**

```typescript
type EntityTabContainerProps = {
  name: string;
  detail: EntityDetail;
  entityType: "agent" | "skill" | "rule";
  isEditing?: boolean;
  onEnterEdit?: () => void;
  onExitEdit?: () => void;
  configForm: React.ComponentType<EntityConfigFormProps>;
  hasPromptTab?: boolean; // agent-only
  hasCompiledTab?: boolean; // agent + skill, not rule
};
```

**Implementation notes:**

- Core: Mode header, dirty tracking, tab structure (configure/source always present)
- Conditional: Prompt tab renders only if `hasPromptTab=true`
- Conditional: Compiled tab renders only if `hasCompiledTab=true`
- Config form is passed as a component prop and receives (name, detail, isEditing)

## Config Form Patterns

### Field Differences

| Form      | Fields                                   |
| --------- | ---------------------------------------- |
| **Agent** | description, model_routing, enabled      |
| **Skill** | description, enabled                     |
| **Rule**  | description, globs, alwaysApply, enabled |

### Shared Layout

All three forms follow this pattern:

1. Badge section (name display)
2. Collapsible sections (CollapsibleSection component)
3. FormField wrappers (label + input)
4. updateField callback + dirty tracking
5. Read-only display when not editing

### Extraction Opportunity: ConfigFormSection

Create `ConfigFormSection` component to replace manual FormField + label pattern:

```typescript
type ConfigFormSectionProps = {
  label: string;
  value: string | boolean;
  isEditing?: boolean;
  onChange: (value: unknown) => void;
  type?: 'text' | 'boolean';
  htmlFor?: string;
};

export function ConfigFormSection({
  label,
  value,
  isEditing,
  onChange,
  type = 'text',
  htmlFor,
}: ConfigFormSectionProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {isEditing ? (
        type === 'boolean' ? (
          <Switch checked={value as boolean} onCheckedChange={onChange} />
        ) : (
          <Input value={value as string} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <div className="text-sm">{String(value)}</div>
      )}
    </div>
  );
}
```

**Each form retains:** CollapsibleSection logic, field list specific to entity, but uses ConfigFormSection for layout.

## Convention Fixes Mapping

### 1. Duplicate Cmd+S Handler

**File:** `packages/luca-studio/hooks/use-pipeline-save.ts`
**Issue:** Lines 125-136 register a keyboard handler for Cmd+S

**Context:** SaveBar (parent component) likely handles Cmd+S globally. Duplicate handler causes:

- Event listener registered twice per mount
- Redundant invocation

**Fix:** Remove the useEffect keyboard handler entirely (lines 125-136). SaveBar already handles it.

**Verification:** Check SaveBar component for Cmd+S handling before removing.

### 2. node:fs → Bun.file Migration

**File:** `packages/luca-studio/lib/config-section-handler.ts`
**Issues:**

- Line 27: `import { access, readFile } from "node:fs/promises"`
- Line 145-147: `access(configPath)` check for file existence
- Line 151: `readFile(configPath, "utf-8")` reads config

**Bun replacements:**

```typescript
// Instead of: access(configPath) -> Bun.file(configPath).exists()
const exists = await Bun.file(configPath).exists();

// Instead of: readFile(configPath, "utf-8") -> Bun.file(configPath).text()
const rawFileContent = await Bun.file(configPath).text();
```

**Caveat:** Bun.file is server-side only. This file (`config-section-handler.ts`) is in lib/ which Next.js API routes can access. Safe to use Bun.file here.

### 3. JSON.parse/stringify Clone → lodash cloneDeep

**File:** `packages/luca-studio/hooks/use-config-conflict.ts`
**Usage:** Deep clone pattern not found in use-config-conflict.ts

**Actual location:** `use-pipeline-save.ts` line 112:

```typescript
JSON.parse(JSON.stringify(serverConfig)) as Record<string, unknown>;
```

**Fix:** Replace with:

```typescript
import cloneDeep from "lodash/cloneDeep";
cloneDeep(serverConfig);
```

**Rationale:** Safer handling of non-serializable values, consistent with lodash-preference rule.

### 4. Missing useCallback Wrappers

**Pattern identified:**

Both skill and rule config forms have `updateField` wrapped in useCallback with proper deps:

```typescript
const updateField = useCallback(
  (field: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    markDirty(entityKey);
  },
  [setDraft, markDirty, entityKey],
);
```

Agent form likely has the same. Verify agent-config-form.tsx for this pattern.

**Check needed:** Search all three forms for any event handlers NOT wrapped in useCallback that should be.

### 5. Switch Component Unification

**File:** `rule-config-form.tsx` line 9 imports Switch from shadcn
**Verify in agent/skill forms:** Check if they also use shadcn Switch or if there are custom toggle implementations.

**Fix scope:** Ensure all three forms use `shadcn Switch` consistently. No custom toggle functions.

## Don't Hand-Roll

Problems that existing libraries solve:

| Problem                    | Don't Build                 | Use Instead                 | Why                                              |
| -------------------------- | --------------------------- | --------------------------- | ------------------------------------------------ |
| Tab layout + state         | Custom tabs from scratch    | shadcn Tabs (already used)  | Full accessibility, keyboard nav, state handling |
| Form section layout        | Manual flex + label + input | ConfigFormSection (extract) | DRY, consistent spacing/styles                   |
| Deep cloning               | JSON.parse(stringify())     | lodash cloneDeep            | Safe with non-serializable values                |
| Entity-specific components | 3 separate container files  | EntityTabContainer + props  | Single source of truth                           |

## Common Pitfalls

### Pitfall 1: Prompt Tab Conditional Rendering

**What goes wrong:** If EntityTabContainer hardcodes Prompt tab logic, it breaks skills/rules.

**Why it happens:** Copy-paste from agent container without abstracting conditionals.

**How to avoid:** Pass `hasPromptTab` prop. Render Prompt tab content only if true. Don't assume all entities have prompts.

**Warning signs:** Tests failing on skills/rules after extraction. Component rendering undefined tab content.

### Pitfall 2: Compiled Fetch Not Memoized Correctly

**What goes wrong:** fetchCompiled is called on every render if not in useCallback deps, causing infinite loops.

**Why it happens:** Missing `name` in useCallback deps.

**How to avoid:** Verify fetchCompiled includes [name] in deps. Use the callback ref pattern for activeTab detection.

**Warning signs:** Network waterfall, React profiler shows repeated fetchCompiled calls.

### Pitfall 3: Config Form Field Type Coercion

**What goes wrong:** When extracting ConfigFormSection, boolean/string type confusion on draft values.

**Why it happens:** Draft atoms accept `unknown`, but forms expect typed values.

**How to avoid:** ConfigFormSection accepts `type?: 'text' | 'boolean'` prop to control input type.

**Warning signs:** Switches showing string values, text inputs showing boolean values.

## Code Examples

### EntityTabContainer Usage

```typescript
// Agent tab container
<EntityTabContainer
  name="lu-router"
  detail={agentDetail}
  entityType="agent"
  isEditing={isEditing}
  onEnterEdit={onEnterEdit}
  onExitEdit={onExitEdit}
  configForm={AgentConfigForm}
  hasPromptTab={true}
  hasCompiledTab={true}
/>

// Rule tab container (no prompt, no compiled)
<EntityTabContainer
  name="no-classes"
  detail={ruleDetail}
  entityType="rule"
  isEditing={isEditing}
  onEnterEdit={onEnterEdit}
  onExitEdit={onExitEdit}
  configForm={RuleConfigForm}
  hasPromptTab={false}
  hasCompiledTab={false}
/>
```

### ConfigFormSection Usage

```typescript
<ConfigFormSection
  label="Description"
  value={currentValues.description}
  isEditing={isEditing}
  onChange={(val) => updateField('description', val)}
  type="text"
  htmlFor="description-input"
/>

<ConfigFormSection
  label="Always Apply"
  value={currentValues.alwaysApply}
  isEditing={isEditing}
  onChange={(val) => updateField('alwaysApply', val)}
  type="boolean"
/>
```

## Open Questions

1. **SaveBar Cmd+S handling:** Need to verify SaveBar already handles Cmd+S globally before removing handler from use-pipeline-save.ts.

2. **Agent special fields:** agent-config-form.tsx likely has model_routing display logic. Verify this doesn't break when extracted into EntityTabContainer.

3. **Bun.file API availability:** Confirm Bun.file is available in Next.js API routes (it should be in getServerSideProps context). If not, keep node:fs for this specific file.

## Sources

### Primary (HIGH confidence)

- Examined all three container files side-by-side
- Measured exact line counts and JSDoc patterns
- Mapped TAB_IDS structure and useCallback deps
- Official Bun documentation (implicit): Bun.file is server-side API

### Secondary (MEDIUM confidence)

- CONTEXT.md documented extraction strategy
- Lodash preference rule (vault-routing.md)

## Metadata

**Confidence breakdown:**

- Tab container structure: HIGH — 3 files all readable, patterns identical
- Config form extraction: HIGH — clear field differences, shared layout pattern
- Convention fixes: HIGH — code is visible, fixes are mechanical
- Bun.file migration: MEDIUM — node:fs imports confirmed, Bun availability assumed safe in Next.js API routes

**Research date:** 2026-03-26
**Valid until:** 2026-04-02 (stable domain, no breaking changes expected)
