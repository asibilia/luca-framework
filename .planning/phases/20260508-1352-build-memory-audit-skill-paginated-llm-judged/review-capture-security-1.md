# Review Capture — Security [Wave 1]

**Subagent**: reviewer
**Perspective**: security
**Verdict**: REQUEST_CHANGES

## MUST-FIX (3)
- **SEC-1** Vault mismatch only fires on explicit `--vault` (SKILL.md:85). Plain `--resume` after config drift advances state-A cursor while writing to vault-B. Same root as DX-2 + ARCH-2. Fix: always compare resolvedVault !== state.vault regardless of how vault resolved.
- **SEC-2** `--apply` runs without pre-flight irreversibility confirmation. Demotion path (`verified → inferred`) is irreversible and has NO ask_user gate; only promotions get the gate (lines 126-138). Add Step 0 confirmation when `--apply` is set.
- **SEC-3** Forbidden-tool list omits structurally-mutating tools: `muninn_link`, `muninn_state`, `muninn_decide`, `muninn_add_child`, `muninn_remember_tree`, `muninn_restore`. SKILL.md:23-35 + memory-audit.test.ts:63-99.

## SHOULD-FIX (4)
- **SEC-S1** state.json read with no schema validation — tampered cursor / vault / totalProcessed pass through. Step 1.2 `JSON.parse` only.
- **SEC-S2** `external`/`untrusted` totalsByTier counters always 0 → misleading reports.
- **SEC-S3** `--vault` argument never validated for format. Could be `../../prod` or contain newlines.
- **SEC-S4** Citation-presence check entirely heuristic — no concrete regex anchors. Two runs may disagree.

## NOTE
- ROOT_WHITELIST_DIRS 'audits' is broad whitelist (any subdir).
- Cursor ordering documented but not mechanically enforceable.
- `full-auto` detection mechanism unspecified (same as DX-1).
