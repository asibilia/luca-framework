---
"@alecsibilia/luca-framework": patch
---

Publish `@alecsibilia/luca-framework` with public access. The release workflow was passing `--access restricted` to `bun publish` and `.changeset/config.json` was set to `"access": "restricted"`, so every release re-marked the scoped package as private on npm even after a manual toggle in the npm UI. Switch both to `public` and add `publishConfig.access: "public"` to the package's `package.json` as a defense-in-depth default.
