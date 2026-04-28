---
"@alecsibilia/luca-framework": patch
---

Republish to fix the OIDC publish job, which failed on the previous release (v11.0.4 was tagged on GitHub but never reached npm).

The publish job was running on Node 22 and trying to globally upgrade the bundled npm (10.9.x) to satisfy trusted publishing's 11.5.1+ requirement. The in-place self-upgrade left module resolution in a broken state (`Cannot find module 'promise-retry'`). It turns out the entire Node 22 LTS line never crossed into npm 11.x — the highest bundled npm there is 10.9.7. Bump the runner to Node 24 LTS, which ships with npm 11.12.x out of the box, and drop the manual npm upgrade entirely.
