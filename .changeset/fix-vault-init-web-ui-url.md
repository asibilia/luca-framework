---
"@alecsibilia/luca": patch
---

Fix `luca vault:init` pointing users at the wrong MuninnDB Web UI URL for API-key generation. The API-key prompt hardcoded `http://localhost:8477`, but the MuninnDB dashboard is served on the same port as the service (default `8476`), so the link was dead. The URL is now derived from `resolveMuninndbPort()` (`http://127.0.0.1:<port>`), honoring a `MUNINNDB_PORT` override instead of a hardcoded value.
