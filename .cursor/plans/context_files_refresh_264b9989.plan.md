---
name: Context files refresh
overview: "Summarize the paper’s findings and refactor this repo’s `AGENTS.md` and `CLAUDE.md` to be agent-optimized: repo-specific, accurate, and high-leverage, while avoiding the overhead patterns the paper identifies (long overviews, redundant docs, and unnecessary MUSTs)."
todos:
  - id: extract-paper-guidelines
    content: Distill paper findings into a short checklist we’ll embed into the doc rewrite decisions (what to include vs exclude).
    status: completed
  - id: agents-md-rewrite
    content: Rewrite `AGENTS.md` to remove placeholders/inaccurate stack, promote key commands/gotchas, and compress architecture into pointers.
    status: completed
  - id: claude-md-rewrite
    content: Rewrite `CLAUDE.md` to be repo-specific (drop Bun.serve/React example), keep Bun-first command guidance, and add concise repo gotchas.
    status: completed
  - id: consistency-pass
    content: Cross-check `AGENTS.md`, `CLAUDE.md`, and `README.md` for consistency; ensure agent-first formatting and minimal redundancy.
    status: completed
isProject: false
---

## Goals

- Make `AGENTS.md` and `CLAUDE.md` **agent-first** and **repo-specific**, not generic documentation.
- Remove inaccuracies/placeholders that cause wasted exploration.
- Keep instructions **high-leverage** (commands, constraints, gotchas) and avoid “directory tours” / long examples.

## Source learnings to encode (from the paper)

- Context files increase steps/cost; instructions are followed → every requirement should justify its cost.
- Repo overviews/directory enumerations do not speed up finding relevant files.
- Prefer minimal, high-signal requirements; avoid duplicating existing docs.

## Proposed changes

### Update `[AGENTS.md](/Users/alecsibilia/Github/luca-framework/AGENTS.md)`

- **Fix correctness + remove placeholders**
  - Replace `Project Overview` and `Development Setup` placeholders with 3–6 bullets that match `README.md`.
  - Remove or rewrite the current `Technology Stack` section (it currently lists Next.js/Convex/Clerk, which conflicts with the later “developer tooling monorepo” section and the repo README).
- **Make a short “Do these first” block** (top of file)
  - Commands you already have later in the file (e.g. `bun install`, `bun test`, `bun run build:all`, `bun run check:drift`, `bunx --bun tsc --noEmit`) should be surfaced early.
- **Convert long guidance into “rules of thumb + pointers”**
  - Keep non-obvious caveats (they’re high-leverage), but compress explanatory prose.
  - For deeper architecture/conventions, point to existing docs/rules instead of duplicating content.
- **Avoid costly instruction patterns called out by the paper**
  - Remove any directory-by-directory overview lists.
  - Avoid adding new “always run X” requirements unless they are truly necessary.

### Update `[CLAUDE.md](/Users/alecsibilia/Github/luca-framework/CLAUDE.md)`

- **Re-scope to this repo**
  - Replace the large `Bun.serve()` / React frontend example with repo-relevant instructions (this repo is a framework/tooling monorepo per `README.md` and `AGENTS.md`).
- **Keep only high-signal Bun usage**
  - Retain Bun-first command mappings (install/test/build/run scripts), but remove generic API guidance that doesn’t apply here (or move to a link/reference).
- **Add 3–5 repo-specific “gotchas”**
  - Mirror the high-leverage caveats from `AGENTS.md` (e.g., build-before-tests that depend on `dist/plugin/`, known full-suite test isolation issue) to reduce agent rediscovery.

## Consistency pass

- Cross-check `AGENTS.md` and `CLAUDE.md` against `[README.md](/Users/alecsibilia/Github/luca-framework/README.md)` to ensure no contradictions about what the repo is and how to work with it.
- Ensure wording is “agent-directive” (short bullets, few code blocks, minimal narrative).

## Verification (non-execution)

- Sanity-check that the final docs:
  - contain **no placeholders**
  - contain **no irrelevant stack claims**
  - have the **primary commands** in the first screenful
  - avoid directory tours / long examples
