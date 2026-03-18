import { readdir, mkdir, rm } from "node:fs/promises";

import { join } from "pathe";

/** Marker comment embedded in auto-generated alias SKILL.md files */
const ALIAS_MARKER = "<!-- luca-alias: auto-generated -->";

/**
 * Create a skill alias that delegates to the canonical `/lu` skill.
 *
 * Writes a `SKILL.md` file at `.claude/skills/{prefix}/SKILL.md` that
 * redirects invocations of `/{prefix}` to `/lu`. Skips immediately
 * when `prefix === 'lu'` (no alias needed for the default prefix).
 *
 * The generated file includes a marker comment (`<!-- luca-alias: auto-generated -->`)
 * so that `cleanupStaleAlias()` can identify and remove it later.
 *
 * Never throws -- all errors are caught and logged.
 *
 * @param prefix - The command prefix to alias (e.g., "pt", "my")
 * @param frameworkName - Display name of the framework (e.g., "Cent", "MyTool")
 * @param projectDir - Project root directory (defaults to `process.cwd()`)
 *
 * @example
 * ```typescript
 * // Creates .claude/skills/pt/SKILL.md that delegates to /lu
 * await createAliasSkill('pt', 'Cent');
 *
 * // No-op when prefix is already the default
 * await createAliasSkill('lu', 'Luca'); // returns immediately
 * ```
 */
export async function createAliasSkill(
  prefix: string,
  frameworkName: string,
  projectDir?: string,
): Promise<void> {
  if (prefix === "lu") {
    return;
  }

  try {
    const skillDir = join(
      projectDir ?? process.cwd(),
      ".claude",
      "skills",
      prefix,
    );
    await mkdir(skillDir, { recursive: true });

    const content = `${ALIAS_MARKER}
# /${prefix}

${frameworkName} entry point — delegates to the canonical /lu skill.

## main

This is an auto-generated alias. Invoke the canonical skill:

Skill(skill: "lu", args: "$ARGS")
`;

    await Bun.write(join(skillDir, "SKILL.md"), content);
  } catch (error) {
    console.error(
      `[luca] Failed to create alias skill for prefix "${prefix}":`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Remove stale auto-generated alias skill directories.
 *
 * Scans `.claude/skills/` for directories that contain a `SKILL.md`
 * with the auto-generated marker comment. Removes any such directory
 * whose name does not match `newPrefix` (preserving the current alias)
 * and is not `lu` (never remove the canonical skill).
 *
 * Never throws -- all errors are caught and logged.
 *
 * @param newPrefix - The current alias prefix to preserve (will not be removed)
 * @param projectDir - Project root directory (defaults to `process.cwd()`)
 *
 * @example
 * ```typescript
 * // Removes old aliases like .claude/skills/old-prefix/ but keeps .claude/skills/pt/
 * await cleanupStaleAlias('pt');
 * ```
 */
export async function cleanupStaleAlias(
  newPrefix: string,
  projectDir?: string,
): Promise<void> {
  try {
    const skillsDir = join(projectDir ?? process.cwd(), ".claude", "skills");

    let entries: string[];
    try {
      entries = await readdir(skillsDir);
    } catch (error) {
      // Directory does not exist yet -- nothing to clean up
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry === newPrefix || entry === "lu") {
        continue;
      }

      try {
        const skillMdPath = join(skillsDir, entry, "SKILL.md");
        const file = Bun.file(skillMdPath);
        const content = await file.text();

        if (content.includes(ALIAS_MARKER)) {
          await rm(join(skillsDir, entry), { recursive: true, force: true });
        }
      } catch {
        // Skip entries where SKILL.md doesn't exist or can't be read
      }
    }
  } catch (error) {
    console.error(
      "[luca] Failed to clean up stale alias skills:",
      error instanceof Error ? error.message : error,
    );
  }
}
