---
'@alecsibilia/luca-framework': minor
'@alecsibilia/luca-mastracode': minor
---

Bump entire Mastra dependency family in lockstep and pin them
exactly in the published tarball.

- `mastracode` 0.17.0 → 0.19.0
- `@mastra/core` 1.31.0 → 1.34.0
- `@mastra/libsql` 1.9.1 → 1.10.1
- `@mastra/memory` 1.17.4 → 1.18.1

Why: `mastracode` is built against an exact pin of `@mastra/core`
and friends. We were publishing the framework with caret ranges
(`^1.31.0`), so when users installed they got `mastracode@0.19.0`
paired with whatever caret-resolved core happened to be hoisted —
producing
`Error: Exhausted all fallback models. Last error: Unsupported role: signal`
because `@mastra/core@1.34` introduced a new `role: "signal"`
message type that older provider adapters (still resolved via the
caret range against the previous, hoisted core) do not recognise.

Changes:

- Pin every Mastra-family entry in the root `package.json`
  workspaces catalog to an exact version (no caret).
- Add `minimumReleaseAgeExcludes` for the Mastra family in
  `bunfig.toml` so future bumps aren't blocked by the 7-day
  supply-chain cooldown (these are version-pinned by upstream
  and tracked in lockstep, so the cooldown adds no signal).
- Add `scripts/validate-tarball-deps.ts` and wire it into the
  Release workflow between `bun pm pack` and `npm publish`. The
  script unpacks the tarball, inspects `package/package.json`,
  and fails the publish if any `mastracode`/`@mastra/*` dep is
  not exact-pinned. This blocks the regression class at the
  release boundary, not just at the source-of-truth boundary.
