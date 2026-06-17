# Plan Review — Phase 4: claude-parity-and-gating

## Verdict: APPROVED (CONVERGED, 0 blocking, 5 advisory)

High-stakes file (`~/.claude.json`, the user's primary config) safety verified PASS:
- Merge-not-replace (spread preserves all top-level keys incl. `projects` + all sibling `mcpServers`); ac-03 deep-equal proves an unrelated key + sibling server survive. anti-01 guards clobber.
- Parse-guard falls back to `{}` ONLY on parse error (never on a populated file).
- Claude schema confirmed correct: `type:'sse'` + `url` + `headers.Authorization` (NOT serverUrl/enabledTools); matches live `~/.claude.json`. anti-04 keeps the Antigravity shape distinct.
- Shell-out removal coherent: both `isMuninnRegistered` and `staleMcpServerCheck` already probe top-level `~/.claude.json mcpServers` = where `wireClaudeMcp` writes. No consumer breaks.
- WS8 gating + `--skip-claude` decouple from Antigravity + `--skip-antigravity` added.
- Repo policy clean (tsc + grep + `bun -e` fixtures; no .test.ts/bun test).

## 5 advisories — ALL FOLDED INTO EXECUTION (cheap + high-value on this file)
- **G-DX-001** — Claude writer reuses the existing `MUNINN_MCP_SERVER_URL` const (not a fresh literal). Accept the one-time `localhost`→`127.0.0.1` normalization of the live entry (benign, merge-not-replace); document in Decisions so it's not read later as an idempotency bug.
- **G-ARCH-002** — idempotency short-circuit compares against the const; the merge also strips any stale Antigravity-shape keys (`serverUrl`/`enabledTools`) if a prior buggy run cross-contaminated the Claude entry.
- **G-CRIT-003** — split the compound grep probes (ac-04 type/url/Authorization; ac-05 chmod+readMuninnToken; anti-04 four-way) so each asserts a single binary fact (executor must satisfy each sub-fact).
- **G-SEC-004** — atomic write for `~/.claude.json`: write-to-temp + rename, to close the crash-mid-write truncation window on the primary config.
- **G-DX-005** — document the intended WS8 behavior change: gating on `isInstalled()` means init no longer pre-seeds a harness home that doesn't exist yet (previously `mkdir -p` created it). This is the WS8 intent ("don't scaffold a harness the user doesn't have").

## Confidence Gate: ALL-AUTO (empty)
`luca confidence gate --slug 04-claude-parity-and-gating` → auto=0, research=0, ask=0 (no entries; bash gated in plan step). Proceeding to execute.
