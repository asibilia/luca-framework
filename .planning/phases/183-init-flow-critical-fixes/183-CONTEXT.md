# Phase 183 Context — Init Flow Critical Fixes

## Gray Area 1: MuninnDB Download URL Resolution [researched]

**Question:** How should the download URL resolve `latest` to an actual GitHub release tag?

**Decision:** Use the GitHub API to resolve the latest release tag, then construct the download URL with the real tag. The current approach (`releases/download/latest/...`) 404s because GitHub's `latest` symlink uses a different URL pattern (`releases/latest/download/...`).

**Implementation:**

- In `muninndb-download.ts`, when version is `"latest"`:
  1. Fetch `https://api.github.com/repos/nicholasgasior/muninn/releases/latest`
  2. Extract `tag_name` from the JSON response
  3. Use that tag in the URL: `releases/download/{tag}/muninndb-{target}`
- Fall back to the redirect-based URL (`releases/latest/download/...`) if API call fails
- Cache the resolved tag for the session to avoid repeated API calls

**Constraint:** Must work without authentication (public GitHub API rate limit: 60 req/hr for unauthenticated).

## Gray Area 2: Global vs Dev Mode Detection [researched]

**Question:** How should vault:init distinguish between running from a global npm install vs monorepo development?

**Decision:** Use the existing `isGlobalInstall()` detection from `runtime-context.ts` (already implemented in Phase 172). The vault:init command should check this and branch its behavior.

**Implementation:**

- In `vault-init.ts`: call `isGlobalInstall()` at the start
- **Global mode:** Only create `.planning/` config files (config.json, BRAIN.md, WORKING.md, MEMORY.md). Do NOT call `generateFiles()` which deploys the full harness — that was already done in Step 3 of `luca init`.
- **Dev mode:** Keep current behavior (full harness generation for local development).

**Constraint:** Must not break the dev-mode workflow where `vault:init` is used standalone.

## Gray Area 3: MuninnDB Health Gate Before API Key Prompt [researched]

**Question:** What should happen when MuninnDB is unreachable at the API key prompt stage?

**Decision:** Check MuninnDB health BEFORE showing the API key prompt. If unreachable, skip the vault setup entirely and advise the user to run `luca vault:init` later.

**Implementation:**

- After MuninnDB download + start attempt in `init.ts`, check health endpoint
- If healthy: proceed to vault setup (Step 4) as normal
- If unhealthy: log a clear warning message with `luca vault:init` recovery command, skip Step 4
- In `vault-setup.ts` `runVaultWizard()`: add a health check at the top before any prompts
- If health check fails inside `runVaultWizard()`: return early with a message, don't show API key prompt

**Constraint:** The warning must be actionable — tell the user exactly what to run later.

## Gray Area 4: Binary Verification After Download [researched]

**Question:** How thorough should post-download binary verification be?

**Decision:** Verify existence, file size > 0, and executable permission. Do NOT run the binary for verification (it may need additional setup). The existing SHA-256 checksum verification from Phase 179 handles integrity.

**Implementation:**

- After download completes in `downloadMuninndbBinary()`, verify:
  1. File exists at expected path
  2. File size > 0 bytes
  3. File has executable permission (mode check)
- If any check fails: report specific failure reason, do not proceed to service start
- The `checkMuninndbBinary()` function likely already does some of this — extend it if needed

## Deferred Ideas

- Automatic retry with exponential backoff on download failure (not in scope — single attempt is sufficient for init)
- MuninnDB version pinning in config.json (future enhancement)

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
