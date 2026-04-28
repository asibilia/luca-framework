---
"@alecsibilia/luca-framework": patch
---

Republish to fix the OIDC publish job, which failed at the registry `PUT` on v11.0.5 (provenance was signed and pushed to sigstore, but the tarball never landed).

The publish step's `actions/setup-node` config included `registry-url: https://registry.npmjs.org`. setup-node responds to that by writing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into an `.npmrc` it creates for the job. With no real `NPM_TOKEN` provided, `NODE_AUTH_TOKEN` resolves to setup-node's literal placeholder (`XXXXX-XXXXX-XXXXX-XXXXX`), and npm uses **any** configured `_authToken` in preference to OIDC trusted publishing — so it tried to authenticate with the placeholder and got back `404 Not Found - PUT https://registry.npmjs.org/@alecsibilia%2fluca-framework`.

Drop `registry-url` from setup-node so it doesn't write the auth-token line. With no `_authToken` configured, npm falls through to OIDC, exchanges the GitHub Actions ID token for a publish credential, and publishes normally. The default registry is `https://registry.npmjs.org/` anyway.
