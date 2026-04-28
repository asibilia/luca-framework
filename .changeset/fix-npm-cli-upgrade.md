---
"@alecsibilia/luca-framework": patch
---

Republish to fix the OIDC publish job, which failed on the previous release (v11.0.4 was tagged on GitHub but never reached npm).

The publish job ran `npm install -g npm@latest` to satisfy npm's trusted-publishing minimum (11.5.1+), but the bundled npm replaces itself in place during the global install and the half-overwritten install fails with `Cannot find module 'promise-retry'`. Switch to installing npm into a separate prefix (`/tmp/npm-cli`) and invoke its bin directly, so the bundled npm isn't overwriting itself while it runs.
