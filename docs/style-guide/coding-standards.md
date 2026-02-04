# Project Coding Standards

> **Version:** 1.0.0
> **Last Updated:** 2024-12-30
> **Status:** Active

This document defines the coding standards and patterns that all AI-generated code must follow. These patterns are derived from an analysis of the existing joes-book codebase and serve as the authoritative reference for agent-generated code.

---

## Table of Contents

1. [Overview](#overview)
2. [Naming & Structure](#naming--structure)
3. [Functions API](#functions-api)
4. [Types & Validation](#types--validation)
5. [Collections](#collections)
6. [JSX & Components](#jsx--components)
   - [Layout Utilities](#layout-utilities)
   - [Card Component Selection](#card-component-selection)
7. [Auth & Data](#auth--data)
8. [Testing](#testing)
9. [Development Tooling](#development-tooling)
10. [Quick-Start Checklist](#quick-start-checklist)
11. [Glossary](#glossary)

---

## Overview

The joes-book repository is a **Next.js 15 App Router** application with **TypeScript**, **Supabase**, and **Bun** as the runtime. The codebase follows strict patterns for consistency, type safety, and maintainability.

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth + Middleware |
| State | Jotai (client), XState (complex flows) |
| Validation | Zod |
| Utilities | Lodash |
| Testing | Bun Test |
| Styling | Tailwind CSS v4 |

### Key Commands

```bash
bun dev              # Start development server
bun build            # Production build
bun test             # Run tests
bun db:gen-types     # Generate Supabase types
```

---

## Naming & Structure

### File Naming: `kebab-case`

All files should use `kebab-case` naming.

**✅ DO:**

```
components/pokemon/trainer-card.tsx
utils/helpers/pokemon/battle-utilities.ts
utils/schemas/pokemon/battle-actions.ts
```

**❌ DON'T:**

```
components/pokemon/TrainerCard.tsx
utils/helpers/pokemon/battleUtilities.ts
utils/schemas/pokemon/BattleActions.ts
```

### Object Keys: `snake_case`

All object keys in types, interfaces, and data structures must use `snake_case`. This applies to ALL objects we control, not just database-related ones.

**✅ DO:**

```typescript
interface TournamentPrediction {
    player_id: number;
    full_name: string;
    win_probability: number;
    model_type: 'baseline_history_fit';
}

const predictionData = {
    player_id: 123,
    full_name: 'Rory McIlroy',
    win_probability: 0.15,
};

// Config objects also use snake_case keys
const supabaseEnv = {
    anon_key: '...',
    service_role_key: '...',
};
```

**❌ DON'T:**

```typescript
interface TournamentPrediction {
    playerId: number;      // camelCase - wrong
    fullName: string;      // camelCase - wrong
    winProbability: number;
}
```

### Variable & Function Names: `camelCase`

Variable names and function names use `camelCase`. Class names and React components use `PascalCase`.

```typescript
const trainerData = { ... }     // camelCase variable
function createClient() { }     // camelCase function
class BattleEngine { }          // PascalCase class
```

### Constants & Config Objects: `SCREAMING_SNAKE_CASE`

Constants and configuration objects use `SCREAMING_SNAKE_CASE`.

```typescript
const SUPABASE_ENV = {
    anon_key: '...',            // snake_case for object keys
    service_role_key: '...',
}

const MAX_RETRY_COUNT = 3
const API_BASE_URL = 'https://api.example.com'
```

### External APIs

If an external library requires camelCase keys, create a transfer layer to convert:

```typescript
// Internal snake_case object
const CONFIG = { api_key: '...', base_url: '...' }

// Convert when calling external library
externalLib({ apiKey: CONFIG.api_key, baseUrl: CONFIG.base_url })
```

### Directory Structure

```
app/
  protected/           # Auth-required routes
    pokemon/
      page.tsx         # Only route files here
      layout.tsx
  api/
    [domain]/          # API routes organized by domain
      route.ts

components/
  _ui/                 # Reusable UI primitives
  pokemon/             # Domain-specific components

utils/
  actions/             # Server actions
  helpers/             # Business logic
  schemas/             # Zod schemas
  state/               # State management (Jotai, XState)
  supabase/            # Supabase clients
```

---

## Functions API

### Single Object Argument with Destructuring

Functions should accept a single object argument that is destructured, rather than multiple positional arguments.

**✅ DO:**

```typescript
function createPlayer({
    full_name,
    country,
    is_active = true,
}: {
    full_name: string;
    country: string;
    is_active?: boolean;
}) {
    // ... function logic
}

// Clear call site
createPlayer({
    full_name: 'Scottie Scheffler',
    country: 'USA',
});
```

**❌ DON'T:**

```typescript
function createPlayer(fullName: string, country: string, isActive: boolean = true) {
    // ...
}

// Unclear what 'USA' and 'true' represent
createPlayer('Scottie Scheffler', 'USA', true);
```

### Server Actions

Server actions are located in `utils/actions/` and must include `'use server'` directive.

```typescript
// utils/actions/pokemon/trainer-actions.ts
'use server'

import { createClient } from '~/utils/supabase/server'

export async function updateTrainer({
    trainer_id,
    display_name,
}: {
    trainer_id: string;
    display_name: string;
}) {
    const supabase = await createClient()
    
    const { data, error } = await supabase
        .from('trainers')
        .update({ display_name })
        .eq('id', trainer_id)
        .select()
        .single()
    
    return { data, error }
}
```

---

## Types & Validation

### Zod Schemas with Inferred Types

Use Zod schemas as the single source of truth for both runtime validation and TypeScript types.

**✅ DO:**

```typescript
import { z } from 'zod';

// Define schema first
const PlayerSchema = z.object({
    player_id: z.number(),
    full_name: z.string().min(1),
    country: z.string(),
    is_active: z.boolean().default(true),
    skill_ratings: z.object({
        sg_total: z.number(),
        sg_putt: z.number(),
    }).optional(),
});

// Infer the TypeScript type
type Player = z.infer<typeof PlayerSchema>;

// Use in functions with validation
function createPlayer(data: unknown): Player {
    return PlayerSchema.parse(data);
}
```

**❌ DON'T:**

```typescript
// Avoid separate interface + schema (they can drift apart)
interface Player {
    player_id: number;
    full_name: string;
    // ...
}

const PlayerSchema = z.object({
    player_id: z.number(),
    // Oops! Forgot full_name - now they're out of sync
});
```

### Avoid `any` Type

Never use `any`. Use `unknown` with type guards or proper typing.

**✅ DO:**

```typescript
function handleApiResponse(response: unknown) {
    if (typeof response === 'object' && response !== null && 'status' in response) {
        return response;
    }
    throw new Error('Invalid response format');
}
```

**❌ DON'T:**

```typescript
function processData(data: any) {
    return data.player.name.toUpperCase(); // Could fail at runtime
}
```

### Avoid Type Casting and Assertions

Avoid `as` type casting and `!` non-null assertions.

**✅ DO:**

```typescript
// Use optional chaining
function getPlayerRating(player: { skill_ratings?: { sg_total: number } }) {
    return player.skill_ratings?.sg_total ?? 0;
}

// Use Zod for validation instead of casting
function processApiResponse(response: unknown) {
    const validated = PlayerSchema.parse(response);
    return validated.skill_ratings?.sg_total ?? 0;
}
```

**❌ DON'T:**

```typescript
// Avoid type casting
const player = response as Player;

// Avoid non-null assertions
return player.skill_ratings!.sg_total; // Crashes if undefined
```

---

## Collections

### Prefer Lodash Over Native Array Methods

Use Lodash functions with named imports for array and object operations.

**✅ DO:**

```typescript
import { map, filter, find, groupBy, sortBy } from 'lodash';

const activePlayerNames = map(
    filter(players, { is_active: true }),
    'full_name'
);

const playersByCountry = groupBy(players, 'country');
const sortedByRating = sortBy(players, ['skill_ratings.sg_total']);
```

**❌ DON'T:**

```typescript
// Avoid native methods
const activePlayerNames = players
    .filter(player => player.is_active)
    .map(player => player.full_name);
```

---

## JSX & Components

### Avoid `<p>` Tags in JSX

Use `<div>` elements instead of `<p>` tags to avoid semantic complexity and nesting issues.

**✅ DO:**

```tsx
function PlayerCard({ player }: { player: Player }) {
    return (
        <div className="player-card">
            <div className="player-name">{player.full_name}</div>
            <div className="player-country">{player.country}</div>
        </div>
    );
}
```

**❌ DON'T:**

```tsx
function PlayerCard({ player }: { player: Player }) {
    return (
        <div className="player-card">
            <p className="player-name">{player.full_name}</p>
            <p className="player-country">{player.country}</p>
        </div>
    );
}
```

### Component Organization

- Place components in `components/[domain]/`
- Use `components/_ui/` for reusable primitives
- Import with path alias `~/components/...`

### Layout Utilities

Use semantic layout utilities instead of raw flexbox classes. These are defined in `globals.css`.

| Utility | Equivalent | Use For |
|---------|------------|---------|
| `horizontal` | `flex flex-row` | Horizontal layouts |
| `vertical` | `flex flex-col` | Vertical/stacked layouts |
| `center-center` | `flex items-center justify-center` | Centered content |

**✅ DO:**

```tsx
<div className="vertical gap-4">
    <div className="horizontal items-center gap-2">
        <Icon />
        <span>Label</span>
    </div>
    <div className="center-center h-32">
        <Spinner />
    </div>
</div>
```

**❌ DON'T:**

```tsx
<div className="flex flex-col gap-4">
    <div className="flex flex-row items-center gap-2">
        <Icon />
        <span>Label</span>
    </div>
    <div className="flex items-center justify-center h-32">
        <Spinner />
    </div>
</div>
```

### Card Component

Use the composition-based `Card` component with sub-components for all card layouts:

| Sub-component | Purpose |
|---------------|---------|
| `CardHeader` | Container for title, description, and action slot |
| `CardTitle` | Main title text |
| `CardDescription` | Subtitle or description text |
| `CardAction` | Action slot (button, icon) in header |
| `CardContent` | Main content area |
| `CardFooter` | Footer with actions |

**Card with Header/Content/Footer:**

```tsx
<Card variant="outline" color="primary">
    <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
    </CardHeader>
    <CardContent>Custom content layout</CardContent>
    <CardFooter>Footer actions</CardFooter>
</Card>
```

**Simple Card:**

```tsx
<Card variant="shadow" color="primary">
    <CardContent>Simple content only</CardContent>
</Card>
```

Cards use the `surface` utility for neutral styling that's immune to parent color contexts.
Pass `color` prop to apply semantic colors (`primary`, `success`, `warning`, etc.).

---

## Auth & Data

### Middleware-Based Authentication

Never manually check auth in protected routes. Middleware handles all authentication for `/protected/*` routes.

**✅ DO:**

```tsx
// app/protected/pokemon/page.tsx
export default async function PokemonPage() {
    // Middleware guarantees authenticated user
    const data = await getPokemonData()
    return <PokemonClient data={data} />
}
```

**❌ DON'T:**

```tsx
export default async function PokemonPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        redirect('/auth/login') // Unnecessary - middleware handles this
    }
    // ...
}
```

### Row Level Security (RLS)

Never pass user IDs to database queries. RLS automatically filters data based on authenticated user.

**✅ DO:**

```typescript
export async function getUserTrainer() {
    const supabase = await createClient()
    
    // RLS automatically filters to current user
    const { data, error } = await supabase
        .from('trainers')
        .select('*')
        .single()
    
    return { data, error }
}
```

**❌ DON'T:**

```typescript
export async function getUserTrainer(userId: string) {
    const supabase = await createClient()
    
    const { data, error } = await supabase
        .from('trainers')
        .select('*')
        .eq('user_id', userId) // Unnecessary - RLS handles this
        .single()
    
    return { data, error }
}
```

---

## Testing

### Bun Test Framework

Use Bun's built-in test framework with `describe`, `test`, and `expect`.

```typescript
// utils/helpers/pokemon/__tests__/battle-utilities.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { calculateDamage } from '../battle-utilities'

describe('calculateDamage', () => {
    test('should calculate base damage correctly', () => {
        const result = calculateDamage({
            base_power: 50,
            attack_stat: 100,
            defense_stat: 80,
        })
        
        expect(result).toBeGreaterThan(0)
    })
    
    test('should apply type effectiveness', () => {
        const result = calculateDamage({
            base_power: 50,
            attack_stat: 100,
            defense_stat: 80,
            type_multiplier: 2.0,
        })
        
        expect(result).toBeGreaterThan(50)
    })
})
```

### Test File Location

Place tests in `__tests__/` directories adjacent to the code being tested:

```
utils/helpers/pokemon/
  battle-utilities.ts
  __tests__/
    battle-utilities.test.ts
```

---

## Development Tooling

### Environment Variables

Required variables in `.env`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
GOOGLE_GENERATIVE_AI_API_KEY=
```

---

## Quick-Start Checklist

When writing new code, verify:

- [ ] File names use `kebab-case`
- [ ] Object keys use `snake_case`
- [ ] Functions accept single object argument with destructuring
- [ ] Types are inferred from Zod schemas (`z.infer<typeof Schema>`)
- [ ] No `any` types used
- [ ] No `as` type casting or `!` assertions
- [ ] Lodash used for array/object operations
- [ ] No `<p>` tags in JSX
- [ ] Layout uses `horizontal`/`vertical`/`center-center` utilities (not raw flexbox)
- [ ] Card components use composition pattern (`Card`, `CardHeader`, `CardContent`, etc.)
- [ ] No manual auth checks in `/protected/*` routes
- [ ] No user IDs passed to database queries (RLS handles it)
- [ ] Tests use Bun's `describe`/`test`/`expect`
- [ ] Components organized in `components/[domain]/`
- [ ] Server actions have `'use server'` directive

---

## Glossary

| Term | Definition |
|------|------------|
| **RLS** | Row Level Security - Postgres feature that filters data at database level |
| **Server Action** | Next.js function that runs on server, marked with `'use server'` |
| **App Router** | Next.js 13+ routing system using file-based routes in `/app` |
| **Zod** | TypeScript-first schema validation library |
| **Jotai** | Atomic state management library for React |
| **XState** | State machine library used for complex flows like battles |

---

## Pattern Evidence Summary

Based on codebase analysis (December 2024):

| Pattern | Files | Usage |
|---------|-------|-------|
| Lodash imports | 17 | Consistent |
| Zod schemas (z.object/z.infer) | 21 | Heavy (172 uses) |
| Type assertions (as) | 14 | Limited (38 uses - minimize) |
| `<p>` tags in JSX | 5 | Minimal (7 uses - avoid) |
| Single object destructuring | 101 | Heavy (199 uses) |
| snake_case properties | 30 | Heavy (1000+ uses) |
| Server actions ('use server') | 13 | Standard pattern |
| Bun tests | 6 | Growing (351 assertions) |

---

*This document is the authoritative source for project coding standards. All agent-generated code must conform to these patterns.*
