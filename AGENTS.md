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
| ------- | ----------- |
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
const trainers = useQuery(api.trainers.queries.getAllTrainersWithStats);

// Writing data
const updateName = useMutation(api.trainers.mutations.updateTrainerName);
await updateName({ display_name: "New Name" });
```

## Domain Architecture

Every `src/` domain follows one of three archetypes:

- **Entity (A)**: agents, skills, rules — named instances with registries, entity subdirs, `__schemas/` + `__helpers/` + barrel
- **Core (B)**: memory, planner, iteration, context, shared — internal logic, `__schemas/` + `__helpers/` + barrel
- **Infrastructure (C)**: compilers, complexity, harness, hooks — build/verification, `__schemas/` + `__helpers/` + barrel + optional subdirs

Import direction follows four dependency tiers (downward only):

| Tier          | Domains                                      | May import from                    |
| ------------- | -------------------------------------------- | ---------------------------------- |
| T0 Foundation | shared, complexity                           | Nothing in src/                    |
| T1 Core       | context, planner, harness, iteration, memory | T0 only                            |
| T2 Entity     | agents, skills, rules                        | T0-T1; never cross-import          |
| T3 Build      | compilers, hooks                             | T0-T2; imported by nothing in src/ |

**Invariant**: Every domain's `index.ts` is a pure barrel — only re-export statements, no logic.

See generated rules for full details: `.claude/rules/domain-architecture.md` and `.claude/rules/module-boundary.md`.

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

## Cursor Cloud specific instructions

### Project context

Luca is a **developer tooling monorepo** (not a web app). There is no running web server or database. It produces CLI tools and build artifacts for AI-powered IDE workflows.

### Services & commands

| Action                                                 | Command                                                 |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Install deps                                           | `bun install`                                           |
| Type check                                             | `bunx --bun tsc --noEmit`                               |
| Run tests                                              | `bun test`                                              |
| Build packages (unbuild)                               | `bun run build`                                         |
| Build full pipeline (agents/skills/rules/hooks/plugin) | `bun run build:all`                                     |
| Drift check (verify outputs match source)              | `bun run check:drift`                                   |
| Luca CLI                                               | `bun run packages/luca-framework/bin/luca.js <command>` |
| State machine bridge                                   | `bun run packages/luca-state/src/bridge.ts <command>`   |

### Non-obvious caveats

- **Build before full test suite**: Some tests in `__tests__/scripts/` (plugin-spec, build-output, check-drift) require `bun run build:all` to have been run first — they validate built artifacts under `dist/plugin/`.
- **Test isolation issue**: ~29 tests in `packages/luca-framework` fail when run in the full suite due to a module resolution ordering issue (`validateBranding` export not found). These same tests **pass individually** (`bun test __tests__/packages/luca-framework/`). This is a pre-existing issue.
- **No ESLint**: The project has no ESLint configuration. Linting is limited to TypeScript type checking.
- **Bun is required**: The project uses `bun.lock` and `bunfig.toml`. Bun may not be pre-installed on Cloud Agent VMs — install via `curl -fsSL https://bun.sh/install | bash` if missing.
- **No `.env` required**: No environment variables are needed for core development. Jira adapter env vars (`JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`) are optional.
