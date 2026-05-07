---
title: "Extract loadMuninnVault() TS helper and migrate prose vault-resolution sites"
area: architecture
created: 2026-05-07
priority: medium
source: research
---

## Task

Extract loadMuninnVault() TS helper and migrate prose vault-resolution sites

## Context

Vault resolution is duplicated as prose in 16 sites across instruction `.md` files and subagent `.ts` template literals: `Vault from .planning/config.json → muninn.vault, fallback "default"`. No `loadMuninnVault()` TS helper exists. Phase A research will add this helper for the projectPreferences tool's use, but the existing 16 prose sites remain.

This is architectural debt D1 from the architecture review. Drift risk: any divergence breaks MuninnDB lookups silently.

## Scope

- Add `readVaultName(): string` helper alongside or in `src/util/phase-paths.ts` / `src/state/vault.ts`
- Subagent `.ts` files can import directly and substitute into template literals
- Instruction `.md` files cannot import — they remain prose unless a build-time substitution layer is added
- Decision needed: keep prose for instructions, consolidate TS-side only?

## MuninnDB Recall

Search MuninnDB for 'luca vault resolution prose duplication' or 'research:luca-vault-resolution-prose-duplication'.
