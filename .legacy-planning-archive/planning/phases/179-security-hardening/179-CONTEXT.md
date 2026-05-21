# Phase 179 Context: Security Hardening

## Gray Area 1: Binary Checksum Verification Strategy [best-practice]

**Decision:** Download a `.sha256` sidecar file alongside the binary from the same release URL. Compute SHA-256 of the downloaded binary using `crypto.createHash('sha256')` (or `Bun.CryptoHasher`). Compare hex digests. Reject if mismatch.

**Rationale:** Sidecar files are the standard pattern for GitHub releases. The existing `hashFile()` in `manifest.ts` already uses `crypto.createHash('sha256')` — reuse that pattern.

**Fallback:** If sidecar file is unavailable (404), warn but continue with download. Log a warning that checksum verification was skipped. Do NOT silently accept unverified binaries in the default case — require `--skip-checksum` flag or MUNINNDB_SKIP_CHECKSUM env var to bypass.

## Gray Area 2: File Permission Model [audit]

**Decision:** Apply restrictive permissions immediately after file creation:

| File                     | Permission | Why                                  |
| ------------------------ | ---------- | ------------------------------------ |
| `.env` (API key)         | 0600       | Contains MUNINN_API_KEY — owner-only |
| `~/.luca/muninndb.pid`   | 0600       | PID file — prevent tampering         |
| `~/.luca/backups/*.json` | 0600       | May contain settings with env vars   |
| `~/.luca/backups/` dir   | 0700       | Owner-only directory access          |
| `~/.luca/manifests/` dir | 0700       | Owner-only directory access          |

**Implementation:** Use `Bun.$\`chmod 0600 ${path}\`.quiet()`after each write. For directories, set permissions in`ensureLucaHome()`.

## Gray Area 3: Process Identity Verification [audit]

**Decision:** Before sending SIGTERM to a PID from the pidfile, verify the process is actually MuninnDB:

- macOS: `ps -p ${pid} -o comm=` and check output contains "muninndb"
- Linux: Read `/proc/${pid}/comm` and check contains "muninndb"
- If process name doesn't match: log warning, delete stale pidfile, do NOT send signal.

**Rationale:** Prevents accidental kill of unrelated processes if PID file is stale or tampered with.

## Gray Area 4: URL Scheme Validation [audit]

**Decision:** In `buildDownloadUrl()` and anywhere MUNINNDB_DOWNLOAD_BASE is consumed, validate the resolved URL starts with `https://`. Reject `http://`, `file://`, and any other scheme with a clear error message.

**Implementation:** `new URL(resolvedUrl)` and check `.protocol === 'https:'`. This also validates URL structure.

## Gray Area 5: sanitizeJsonParse Replacement [codebase]

**Decision:** Replace all `JSON.parse()` calls on file contents with `sanitizeJsonParse()` from the existing `packages/luca-framework/src/utils/sanitize.ts`. The function already handles `__proto__`, `constructor`, and `prototype` stripping.

**Scope:** vault-setup.ts (1 call), init.ts (2 calls), deploy-global.ts (3 calls).

## Gray Area 6: Symlink Guard [defense-in-depth]

**Decision:** In `copyDirForDeploy()`, before reading each source file, check if it's a symlink using `lstatSync()`. If it's a symlink, resolve with `realpathSync()` and verify the resolved path is still within the expected source directory. Skip symlinks that escape the source tree with a warning.

---

_Context generated in auto mode for autopilot full-auto._
