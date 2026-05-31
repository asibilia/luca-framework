---
"@alecsibilia/luca": patch
---

Fix `bun add -g @alecsibilia/luca-framework` failing with `error: GET .../@alecsibilia%2fluca-core - 404`.

`@alecsibilia/luca-core` is a private, workspace-only package that ships bundled inside the framework tarball — inlined into `dist/index.mjs` and copied to `dist/node_modules/` for the bundled mastracode harness. It was incorrectly listed under `dependencies`, so on publish its `workspace:*` spec was rewritten to a concrete `0.1.0` and a consumer's package manager tried to resolve it from the npm registry, where it does not exist. It is now a `devDependency`, matching how the other private internal package (`@alecsibilia/luca-mastracode`) is already handled — consumers do not install devDependencies, and the bundled copies are self-contained.

`validate-tarball-deps.ts` now also fails the publish if any private workspace package leaks into the packed `dependencies`, so this regression cannot recur silently.
