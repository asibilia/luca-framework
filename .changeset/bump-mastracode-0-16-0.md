---
'@alecsibilia/luca-framework': patch
'@alecsibilia/luca-mastracode': patch
---

Bump bundled `mastracode` from `^0.15.2` to `^0.16.0` and align peer Mastra versions to match.

`mastracode@0.16.0` pins `@mastra/core@1.29.0`, `@mastra/libsql@1.9.0`, and `@mastra/memory@1.17.2`. Our catalog ranges (`@mastra/core: ^1.28.0`, `@mastra/memory: ^1.17.1`) were satisfied by the older pins, which caused Bun to keep two copies of `@mastra/core` in `node_modules` after upgrading mastracode and produced TS2322 `Agent<...>` identity errors in `launch.ts` (different `Agent` classes from `1.28.0` vs `1.29.0`). Bumping the catalog ranges to `^1.29.0` / `^1.17.2` deduplicates the install and restores a clean `tsc --noEmit`.

**Heads up for consumers — new transitive Mastra packages:** `mastracode@0.16.0` also pulls in `@mastra/duckdb@1.2.0` and `@mastra/observability@1.10.1` as new transitive dependencies. `@mastra/duckdb` brings the `@duckdb/node-api` native binding, which increases install footprint and means the harness now has a platform-native dependency — installs will need to resolve a prebuilt DuckDB binary for the host (or fall back to building one). `@mastra/observability` is pure JS and has no native deps. No action is required from `@alecsibilia/luca-framework` consumers, but expect a slightly larger `node_modules` and an extra postinstall step on first install of `@alecsibilia/luca-mastracode`.
