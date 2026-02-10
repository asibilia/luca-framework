# AGENTS.md

> Universal instructions for AI coding agents working on this repository.

## Project Overview

[placeholder]

## Technology Stack

- **Frontend**: Next.js 16 App Router, React 19, TypeScript
- **Backend**: Convex (real-time database with serverless functions)
- **Auth**: Clerk (authentication and user management)
- **AI**: Vercel AI Gateway (Google Gemini models)
- **State**: Jotai for client-side state, XState for complex flows
- **UI**: Custom component system built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom color theming
- **Testing**: Bun test framework
- **Runtime**: Bun

## Development Setup

**Prerequisites:** Bun (v1.0+), Node.js 20+

[placeholder]

## Commands

| Command | Description |
|---------|-------------|
|         |             |

## Coding Standards

**IMPORTANT**: Read [docs/style-guide/coding-standards.md](docs/style-guide/coding-standards.md) for complete rules.

Key patterns:

- Single object argument with destructuring for functions
- `snake_case` for database/API object keys (matches Convex schema)
- `camelCase` for React component props (convert at data boundary)
- Zod schemas with `z.infer<>` for types (never separate interface + schema)
- Lodash over native array methods (import named: `import { map, filter } from 'lodash'`)
- No `any` type, no `as` type casting, no `!` assertions
- `<div>` instead of `<p>` in JSX
- File names: `kebab-case.ts`

## Architecture

```
app/                    # Next.js App Router (page.tsx, layout.tsx, route.ts only)
components/
  _ui/                  # Reusable UI primitives (Radix-based)
  [domain]/             # Domain-specific components
convex/                 # Backend logic (schema, queries, mutations, actions)
utils/
  helpers/              # Business logic
  schemas/              # Zod schemas
  state/                # Jotai atoms, XState machines
```

**Auth**: Clerk with middleware-based protection. All `/protected/*` routes secured automatically - never manually check auth in pages.

**Database**: Convex with reactive queries and mutations.

```typescript
// Reading data (reactive)
const trainers = useQuery(api.trainers.queries.getAllTrainersWithStats)

// Writing data
const updateName = useMutation(api.trainers.mutations.updateTrainerName)
await updateName({ display_name: 'New Name' })
```

## Testing

Use Bun's test framework:

- Location: `__tests__/*.test.ts` adjacent to source files
- Pattern: `describe`, `test`, `expect` from `bun:test`
- Run: `bun test`

## PR Guidelines

1. Run `bun build` and `bun test` before committing
2. Use `bun commit` for interactive conventional commits
3. Format: `type(scope): #issue description` (lowercase, present tense verb)
4. Branch naming: `{issue_number}--{dash-cased-description}`

## Related Files

- [docs/coding-standards.md](docs/coding-standards.md) - Complete coding standards
- [CLAUDE.md](CLAUDE.md) - Claude Code specific guidance
- `.github/copilot-instructions.md` - GitHub Copilot instructions
- `.github/agents/` - Agent persona configs
- `.github/prompts/` - Reusable prompt templates
