# Phase 175 Context: Settings Merge & Artifact Deployment

## Gray Area 1: Hook Composite Key Strategy [codebase]

**Decision:** Identify hooks by the composite key `event + matcher`. Two hooks at the same event+matcher are considered the "same slot." Within a slot, individual hooks are compared by their `command` field (the script path).

**Rationale:** The settings.json structure nests hooks under events (PostToolUse, PreToolUse, etc.), with each entry optionally having a `matcher` field. A PostToolUse hook with `matcher: "Edit|Write"` is a different slot than a PostToolUse hook with no matcher. The `command` field uniquely identifies a hook within a slot.

**Impact on planning:** The merge algorithm must:

1. Parse existing settings.json into a map of `{event}:{matcher}` → hooks[]
2. For each Luca hook, check if the slot exists
3. Within the slot, check if the command already exists (skip if identical)
4. If slot exists but command differs: conflict → prompt user

## Gray Area 2: Conflict Resolution UX [roadmap]

**Decision:** Three-tier merge strategy:

- **Auto-merge (silent):** New slot (event+matcher not in existing settings) → add without prompt
- **Auto-skip (silent):** Identical hook already exists (same event+matcher+command) → skip
- **Interactive prompt:** Same slot, different command → show both and ask user to choose (keep existing / replace with Luca / keep both)

**Rationale:** The roadmap explicitly requires "Non-conflicting hook addition (auto-merge)" and "Conflict prompt for same-key different-script hooks."

**Impact on planning:** Need Clack prompts for conflict resolution. In non-interactive mode (CI, piped stdin), default to "keep both" to avoid data loss.

## Gray Area 3: Artifact Deployment Model [codebase]

**Decision:** Always use copy mode for global npm install. Symlinks are only for local monorepo dev (existing deploy-global.ts --copy vs default symlink).

**Rationale:** npm global install copies files to a node_modules location. Symlinking from ~/.claude/ back to node_modules is fragile (package updates break links). Copy mode is the safe default for distribution. deploy-global.ts already implements both modes.

**Impact on planning:** Reuse deploy-global.ts copy logic. The deploy function should accept a source directory and target directory, defaulting to `.claude/` → `~/.claude/`.

## Gray Area 4: Path Rewriting for Global Hooks [codebase]

**Decision:** Use $LUCA_PACKAGE_ROOT env var (established in Phase 174) for hook script paths in global context. Shell wrappers already check this var with relative-path fallback.

**Rationale:** Phase 174 made shell wrappers context-aware via $LUCA_PACKAGE_ROOT. Global deploy just needs to ensure this env var is set (session-start hook can set it) and that copied wrappers reference the installed package location.

**Impact on planning:** deploy-global.ts `rewriteWrapperPaths()` can be simplified now that wrappers are context-aware from Phase 174. May only need to ensure $LUCA_PACKAGE_ROOT is set correctly.

## Gray Area 5: Backup Strategy [derived]

**Decision:** Before modifying ~/.claude/settings.json, always create a timestamped backup at ~/.luca/backups/settings-{ISO-timestamp}.json. Keep last 5 backups. The backup path is already defined in LucaHomePathsSchema (luca-home.ts).

**Rationale:** Settings.json corruption would break Claude Code hooks. Backup-first is mandatory for safety. 5-backup rotation prevents disk bloat.

## Gray Area 6: Deploy Manifest Format [derived]

**Decision:** Track deployed artifacts in ~/.luca/manifests/deploy-manifest.json with:

- `deployed_at`: ISO timestamp
- `package_version`: Luca framework version
- `artifacts`: Map of relative path → { hash, source, type }
- `settings_backup`: Path to the settings.json backup taken during deploy

**Rationale:** The manifest enables `luca update` to diff what's deployed vs what's current, and `luca reinit` to know what to remove. deploy-global.ts already has a manifest concept (.luca-deploy-manifest.json).

---

_Context generated in auto mode. Source annotations: [codebase] = derived from existing code, [roadmap] = explicit roadmap requirement, [derived] = inferred from conventions._
