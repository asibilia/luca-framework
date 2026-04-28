---
"@alecsibilia/luca-framework": patch
---

Republish to actually exercise OIDC trusted publishing end-to-end.

Root cause for the long string of `ENEEDAUTH` failures (v11.0.4 through v11.0.7) was finally pinned down by comparing against another repo where OIDC publishing is known to work: the npm Trusted Publisher for `@alecsibilia/luca-framework` is configured with **Environment name: `npm-publish`**, but the publish job in `.github/workflows/release.yml` did not declare `environment: npm-publish`. Because the OIDC token GitHub Actions mints only carries an `environment` claim when the job declares an environment, the token had no environment claim, npm rejected the token exchange, and per [npm/cli#9088](https://github.com/npm/cli/issues/9088) the CLI surfaced that silent rejection as the misleading `ENEEDAUTH`.

Add `environment: npm-publish` to the publish job. Single-line change. Everything else (Trusted Publisher repo, workflow filename, `id-token: write` permission, `repository.url` in `package.json`, removal of stale `.npmrc`) is already correct from earlier rounds.
