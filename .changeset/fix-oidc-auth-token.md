---
"@alecsibilia/luca-framework": patch
---

Republish to fix the OIDC publish job, which failed at the registry `PUT` on v11.0.5 (provenance was signed and pushed to sigstore, but the tarball never landed).

The publish step runs `cd packages/luca-framework && npm publish ./.pack/*.tgz`, and **two** sources were injecting `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into the npm config:

1. `actions/setup-node` was configured with `registry-url: https://registry.npmjs.org`, which makes setup-node write that auth-token line into the runner-level `.npmrc`.
2. `packages/luca-framework/.npmrc` was checked into the repo (a leftover from the original token-based publish workflow) with the same line.

With no real `NPM_TOKEN` provided, `NODE_AUTH_TOKEN` resolved to setup-node's literal placeholder (`XXXXX-XXXXX-XXXXX-XXXXX`). npm uses **any** configured `_authToken` in preference to OIDC trusted publishing — so it tried to authenticate with the placeholder and got back `404 Not Found - PUT https://registry.npmjs.org/@alecsibilia%2fluca-framework`.

The fix removes both sources:

- Drop `registry-url` from `actions/setup-node` so it doesn't write the runner-level `.npmrc`.
- Delete `packages/luca-framework/.npmrc`. It was added in 2024 to wire up token-based publishing in CI and is obsolete under OIDC trusted publishing — local development doesn't need it either.

With no `_authToken` configured at publish time, npm falls through to OIDC: it exchanges the GitHub Actions ID token via the configured Trusted Publisher and publishes normally. npm's default registry is `https://registry.npmjs.org/` anyway.
