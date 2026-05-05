# Research Capture — Patterns

**Subagent**: researcher (returned narration only; supplemented)
**Perspective**: patterns
**Timestamp**: 2026-05-05

## Findings

### Existing Slugify Helper (PERFECT REUSE)

`packages/luca-framework/src/utils/vault-setup.ts:108` — `sanitizeVaultName(name: string)`:
- Lowercases, replaces non-alphanumeric with `-`, collapses dashes, trims
- Already used for vault names → directly applicable to phase slugs

**Recommendation:** Either re-export from luca-framework or copy to luca-mastracode/src/util/phase-paths.ts (avoid cross-package coupling).

### Slug-related code in luca-mastracode

`rule-engine/recurrence.ts:58` — Convert ViolationCode to kebab-case rule id slug. Likely a different code path; keep separate.

### Ticket ID Parsing — NOT FOUND

No existing `[A-Z]+-\d+` parser in luca-mastracode/src. Issue #220 wants `<TICKET-ID>-<kebab-intent>` slug format but there's no precedent. Need to introduce `parseTicketId(intent: string): string | null`.

### Date Format

No dayjs/date-fns observed. Native `Date.toISOString()` likely sufficient. Format `YYYYMMDD-HHmm` requires manual extraction:
```typescript
const d = new Date()
const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`
```

### File System

Native `node:fs` (sync `readFileSync`, `writeFileSync`, `mkdirSync({recursive:true})`). No bun-specific APIs. Pattern in `write-planning-file.ts:61-64`:
- `join(process.cwd(), '.planning')`
- `resolve(planningDir, userPath)`
- containment via `resolved.startsWith(planningDir + sep)`

### Naming Conventions

camelCase fields in luca-state.json. Existing fields: `runId`, `currentPhase`, `currentPhaseName`, `currentWave`, `planFile`, `roadmapFile`. New field: `currentPhaseSlug` (or `phaseSlug` — recall existing field naming convention is `current*`).

### Error Handling

Tools return `{success: bool, message: string, ...}` — no thrown exceptions in happy path. fs errors caught by `code` (`EACCES`, `EPERM`, `EISDIR`, `ENOENT`).

### Logging

No structured logger seen — tools return messages. Pipeline ledger via `state/session-ledger.ts` `appendLedger()`.

### CLI Entry Points

Need to investigate `packages/luca-mastracode/bin/` or `package.json#bin` for migration command (`luca archive-loose`).

### Test Conventions

Need to investigate (`*.test.ts` in src/?). Likely vitest or bun test.

### Anti-patterns to Avoid

1. Direct `node:fs` bypass of writePlanningFile (manage-roadmap.ts pattern) — for the new helper, all writers should funnel through `phasePath()`.
2. Hardcoded literal `.planning/<file>` strings — replace with helper calls.
