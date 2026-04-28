---
"@alecsibilia/luca-framework": patch
---

Republish to exercise the OIDC publish pipeline now that the npm-side configuration is correct.

The OIDC publish job has been failing since v11.0.4. The most recent run (v11.0.6) made it through pack and provenance signing, then died with the misleading `npm error code ENEEDAUTH`. Root cause turned out to be on the npm side: the Trusted Publisher on `npmjs.com` was configured for `alecsibilia/luca-framework` (the npm scope name), but the actual GitHub repo is `asibilia/luca-framework`. The OIDC token from GitHub Actions carried `repository: asibilia/luca-framework` as a claim, which never matched the trusted-publisher config, so npm refused the token exchange. Per [npm/cli#9088](https://github.com/npm/cli/issues/9088), the npm CLI surfaces silent OIDC failures as `ENEEDAUTH`, which is what we kept seeing.

This release also fixes a separate, smaller bug in `packages/luca-framework/package.json`: `repository.url` was pointing at `https://github.com/alecsibilia/luca-framework.git` (extra `lec`) when it should be `https://github.com/asibilia/luca-framework.git`. With the trusted-publisher config now matching the real repo, npm's provenance step would have validated the package's `repository.url` against that config on the next attempt and rejected it with a 422 — fixing the typo here pre-empts that.
