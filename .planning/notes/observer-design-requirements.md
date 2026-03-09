# Observer Design Requirements

Consolidated from closed backlog items #66-74. These requirements serve as design constraints for all new MuninnDB observer views (#79-87).

---

## Sidebar & Navigation (from #66)

- Use Lucide icons for all navigation items
- Group sidebar by domain: Sessions, Intelligence, Health
- Collapsible sidebar with icon-only mode
- Active state with accent color highlight

## Color System (from #67)

- Surface depth levels: background → surface-0 → surface-1 → surface-2
- Semantic colors: success (green), warning (amber), error (red), info (blue)
- Dark mode first, light mode secondary
- Use CSS custom properties for theme tokens

## Typography (from #68)

- Monospace for code/data: JetBrains Mono or similar
- Sans-serif for UI: Inter or system font stack
- Clear type hierarchy: h1 (24px), h2 (20px), h3 (16px), body (14px), small (12px)
- Line height: 1.5 for body, 1.2 for headings

## Dashboard Layout (from #69)

- Responsive grid: 1-col mobile, 2-col tablet, 3-col desktop
- Hero banner with session summary at top
- Cards for discrete data sections
- Consistent spacing scale (4px base)

## Charting (from #70)

- Choose a proper charting library (Recharts, Chart.js, or similar)
- No CSS-only charts for data visualization
- Consistent color palette across all charts
- Tooltips with full data on hover
- Responsive/resizable charts

## Animations & Motion (from #71)

- Entrance animations for page/card loads (fade + slide, 200ms)
- Data update highlights (brief flash on changed values)
- Skeleton loading states during data fetch
- Respect `prefers-reduced-motion`

## State Diagram (from #72)

- SVG-based workflow state visualization
- Animated transitions between states
- Current state highlighted
- Click-to-filter by state

## Time Range & Session Picker (from #73)

- Global time range selector (last 1h, 6h, 24h, 7d, custom)
- Session picker dropdown with search
- Persist selection across view navigation
- URL params for shareable filtered views

## Command Palette (from #74, deferred to post-MVP)

- Cmd+K / Ctrl+K activation
- Fuzzy search across sessions, entities, engrams
- Recent items section
- Keyboard navigation (arrow keys, enter to select)

---

_Consolidated during backlog audit 2026-03-08. Source items #66-74 closed as superseded._
_Each MuninnDB view (#80-87) should incorporate relevant requirements above._
_#80 (Session Explorer) establishes the design system; subsequent views inherit it._
