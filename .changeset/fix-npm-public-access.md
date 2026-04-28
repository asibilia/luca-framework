---
"@alecsibilia/luca-framework": patch
---

Publish `@alecsibilia/luca-framework` with public access, and migrate the release pipeline to npm OIDC trusted publishing.

- The package was being re-marked private on every release: `.github/workflows/release.yml` invoked `bun publish --access restricted` and `.changeset/config.json` had `"access": "restricted"`. Both flip to `public`, and `packages/luca-framework/package.json` now sets `publishConfig.access: "public"` as a defense-in-depth default.
- The publish job no longer uses a long-lived `NPM_TOKEN` secret. It authenticates via GitHub Actions OIDC against the npm Trusted Publisher configured for this package, and emits signed provenance attestations on every release.
- Because `bun publish` does not yet support npm OIDC ([oven-sh/bun#22423](https://github.com/oven-sh/bun/issues/22423)), the publish step packs the tarball with `bun pm pack` (which resolves `catalog:` and `workspace:*` protocols) and hands the resulting tarball to `npm publish --provenance`.
