# <%= branding.frameworkName %> Brain

> Project identity and conventions. Loaded at session start.

## Project Identity

- **Name:** [Project Name]
- **Domain:** [What this project does]
- **Purpose:** [Why it exists]

## Stack

- **Language:** TypeScript (strict mode)
- **Framework:** React 18+
- **Build:** Vite / Next.js / [Build Tool]
- **State:** [State Management - Jotai, Zustand, etc.]
- **Styling:** [Tailwind / CSS Modules / etc.]
- **Testing:** Vitest / Jest with React Testing Library

## Architecture Patterns

### Component Structure

- Functional components only (no classes)
- Custom hooks for shared logic
- Composition over inheritance
- Single responsibility per component

### File Organization

```
src/
├── components/      # Reusable UI components
│   └── Button/
│       ├── Button.tsx
│       ├── Button.test.tsx
│       └── index.ts
├── hooks/           # Custom React hooks
├── utils/           # Pure utility functions
├── types/           # Shared TypeScript types
└── pages/           # Route components (if applicable)
```

### State Management

- Local state: `useState` for component-specific state
- Shared state: [Jotai atoms / Zustand stores]
- Server state: [React Query / SWR]

## Code Conventions

### TypeScript

- Strict mode enabled
- No `any` type - use `unknown` if type is truly unknown
- Prefer `interface` for object shapes, `type` for unions/primitives
- Use `z.infer<typeof Schema>` for Zod-derived types

### React

- Props: Single object argument with destructuring
- Events: Handle in parent, pass callbacks down
- Effects: Minimal dependencies, cleanup when needed
- Memoization: Only when measured performance issue exists

### Naming

- Components: PascalCase (`UserProfile`)
- Hooks: camelCase with `use` prefix (`useAuth`)
- Utils: camelCase (`formatDate`)
- Files: kebab-case (`user-profile.tsx`)

## Development Preferences

- **Command Prefix:** /<%= branding.commandPrefix %>
- **Ticket Pattern:** `<%= branding.ticketPattern %>`
- **Placeholder Ticket:** `<%= branding.placeholderTicket %>`

## Testing Strategy

- Unit tests for utilities and hooks
- Component tests for user interactions
- Integration tests for critical flows
- No snapshot tests (brittle, low value)

---

*<%= branding.frameworkName %> Brain initialized with React+TypeScript conventions*
