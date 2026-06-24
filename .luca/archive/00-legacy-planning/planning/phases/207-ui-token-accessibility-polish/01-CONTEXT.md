# Phase 207 Context: UI Token & Accessibility Polish

## Gray Areas & Decisions

### 1. CSS Token Strategy [researched]

**Decision:** Replace hardcoded color values (green-500, amber-500, etc.) with CSS custom properties defined in the app's global CSS. Use semantic token names: `--color-success`, `--color-warning`, `--color-info`. This aligns with shadcn's CSS variable theming approach.

**Rationale:** CSS variables enable future theme switching and maintain a single source of truth for colors. Hardcoded Tailwind classes like `text-green-500` become `text-[var(--color-success)]`.

### 2. Accessibility Scope [researched]

**Decision:** Focus on the specific gaps from the audit:

- `focus-visible` rings on interactive elements (buttons, tabs, inputs)
- `aria-expanded` on collapsible sections
- `aria-label` on data tables and icon-only buttons
- Responsive height fixes for command palette and CodeMirror
- Unify icon button sizing to shadcn `size="icon"` pattern

Do NOT attempt a full WCAG audit — scope to the items listed in the roadmap.

### 3. Icon Button Sizing [researched]

**Decision:** Replace inconsistent icon button sizing with shadcn's `size="icon"` variant (32x32px with centered icon). This is already used in some places — unify it everywhere.

## Scope Boundaries

- Color token migration for listed components ONLY
- A11y fixes for listed gaps ONLY — no full WCAG audit
- Do NOT change component structure or behavior
- Do NOT add new components

## Deferred Ideas

- None identified
