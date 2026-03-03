import { getArg } from "~/shared/__helpers/cli-utils";

import type { IterationRecord, LoopType } from "../__schemas/iteration.schemas";
import { iterationRecordSchema } from "../__schemas/iteration.schemas";

/**
 * Convert a git tag name to a safe filename.
 *
 * Replaces forward slashes with hyphens.
 * e.g., "iter/17/harness/1" -> "iter-17-harness-1"
 *
 * @param tag - Git tag name
 * @returns Sanitized string safe for use as a filename
 */
export function sanitizeTagName(tag: string): string {
  return tag.replace(/\//g, "-");
}

/**
 * Build a git tag name from phase, loop, and iteration components.
 *
 * @param phase - Phase number (e.g., 17)
 * @param loop - Loop type ("harness" or "verify")
 * @param iteration - 1-based iteration number
 * @returns Tag name in format "iter/<phase>/<loop>/<iteration>"
 *
 * @example
 * ```typescript
 * buildTagName(17, "harness", 1) // "iter/17/harness/1"
 * buildTagName(17, "verify", 3)  // "iter/17/verify/3"
 * ```
 */
export function buildTagName(
  phase: number,
  loop: LoopType,
  iteration: number,
): string {
  return `iter/${phase}/${loop}/${iteration}`;
}

/**
 * Resolve the full path for a checkpoint metadata JSON file.
 *
 * @param tag - Git tag name (will be sanitized for filename)
 * @param checkpointDir - Directory for checkpoint files (default: ".planning/checkpoints")
 * @returns Relative path like ".planning/checkpoints/iter-17-harness-1.json"
 */
export function metadataPath(
  tag: string,
  checkpointDir: string = ".planning/checkpoints",
): string {
  return `${checkpointDir}/${sanitizeTagName(tag)}.json`;
}

/**
 * Create a checkpoint: lightweight git tag + JSON metadata file.
 *
 * 1. Ensures the checkpoint directory exists
 * 2. Creates a lightweight git tag at the current HEAD
 * 3. Writes the IterationRecord as JSON to the metadata file
 *
 * If the tag already exists, it is deleted and recreated (force).
 *
 * @param record - The iteration record to persist as checkpoint metadata
 * @param checkpointDir - Directory for checkpoint files (default: ".planning/checkpoints")
 * @returns Result object indicating success/failure of each step
 */
export async function createCheckpoint(
  record: IterationRecord,
  checkpointDir: string = ".planning/checkpoints",
): Promise<{
  tag_created: boolean;
  metadata_written: boolean;
  error?: string;
}> {
  const result = { tag_created: false, metadata_written: false };

  try {
    // Ensure checkpoint directory exists
    await Bun.spawn(["mkdir", "-p", checkpointDir]).exited;

    // Delete existing tag if present (force re-tag)
    await Bun.spawn(["git", "tag", "-d", record.tag], {
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    // Create lightweight git tag
    const tagProc = Bun.spawn(["git", "tag", record.tag]);
    const tagExit = await tagProc.exited;
    if (tagExit !== 0) {
      return { ...result, error: `git tag failed with exit code ${tagExit}` };
    }
    result.tag_created = true;

    // Write metadata JSON
    const filePath = metadataPath(record.tag, checkpointDir);
    await Bun.write(filePath, JSON.stringify(record, null, 2));
    result.metadata_written = true;

    return result;
  } catch (err) {
    return {
      ...result,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Read and validate checkpoint metadata from a JSON file.
 *
 * @param tag - Git tag name (used to locate the JSON file)
 * @param checkpointDir - Directory for checkpoint files (default: ".planning/checkpoints")
 * @returns The validated IterationRecord, or null if file doesn't exist or is invalid
 */
export async function readCheckpointMetadata(
  tag: string,
  checkpointDir: string = ".planning/checkpoints",
): Promise<IterationRecord | null> {
  const filePath = metadataPath(tag, checkpointDir);
  const file = Bun.file(filePath);

  if (!(await file.exists())) return null;

  try {
    const raw = await file.json();
    const parsed = iterationRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Roll back the current branch to a checkpoint using git reset --hard.
 *
 * This moves the branch pointer back to the tagged commit,
 * discarding all changes since that checkpoint. This is a destructive
 * operation -- all uncommitted and post-checkpoint committed changes are lost.
 *
 * @param tag - Git tag name to roll back to
 * @returns Result object indicating success/failure
 */
export async function rollbackToCheckpoint(
  tag: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const proc = Bun.spawn(["git", "reset", "--hard", tag]);
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        success: false,
        error: `git reset --hard ${tag} failed (exit ${exitCode}): ${stderr.trim()}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get the current git HEAD commit hash (short form, 12 chars).
 *
 * @returns The short commit hash, or "unknown" if git command fails
 */
export async function getCurrentCommitHash(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--short=12", "HEAD"]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) return "unknown";
    const output = await new Response(proc.stdout).text();
    return output.trim();
  } catch {
    return "unknown";
  }
}

/**
 * Count the number of files changed since a reference point.
 *
 * Uses `git diff --stat` to count changed files. If no fromRef is
 * provided, counts uncommitted changes (staged + unstaged).
 *
 * @param fromRef - Git ref to diff against (tag name or commit hash). If omitted, diffs against HEAD.
 * @returns Number of files changed
 */
export async function getArtifactDelta(fromRef?: string): Promise<number> {
  try {
    const args = fromRef
      ? ["git", "diff", "--stat", fromRef, "HEAD"]
      : ["git", "diff", "--stat", "HEAD"];

    const proc = Bun.spawn(args);
    const exitCode = await proc.exited;
    if (exitCode !== 0) return 0;

    const output = await new Response(proc.stdout).text();
    const lines = output.trim().split("\n");

    // Last line of git diff --stat is summary: " N files changed, ..."
    const lastLine = lines[lines.length - 1] ?? "";
    const match = lastLine.match(/(\d+)\s+files?\s+changed/);
    return match?.[1] ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Delete all git tags and metadata files for a phase.
 *
 * Called after a phase passes verification to keep the
 * git tag namespace and checkpoint directory clean.
 *
 * @param phase - Phase number to prune
 * @param checkpointDir - Directory for checkpoint files (default: ".planning/checkpoints")
 * @returns Count of tags and files deleted
 */
export async function prunePhaseCheckpoints(
  phase: number,
  checkpointDir: string = ".planning/checkpoints",
): Promise<{ tags_deleted: number; files_deleted: number }> {
  let tagsDeleted = 0;
  let filesDeleted = 0;

  try {
    // List and delete git tags matching iter/<phase>/*
    const listProc = Bun.spawn(["git", "tag", "-l", `iter/${phase}/*`]);
    const listExit = await listProc.exited;
    if (listExit === 0) {
      const output = await new Response(listProc.stdout).text();
      const tags = output.trim().split("\n").filter(Boolean);

      for (const tag of tags) {
        const delProc = Bun.spawn(["git", "tag", "-d", tag], {
          stdout: "ignore",
          stderr: "ignore",
        });
        const delExit = await delProc.exited;
        if (delExit === 0) tagsDeleted++;
      }
    }

    // Delete metadata JSON files matching iter-<phase>-*
    const { readdir, unlink } = await import("node:fs/promises");
    try {
      const files = await readdir(checkpointDir);
      const prefix = `iter-${phase}-`;

      for (const file of files) {
        if (file.startsWith(prefix) && file.endsWith(".json")) {
          await unlink(`${checkpointDir}/${file}`);
          filesDeleted++;
        }
      }
    } catch {
      // Directory may not exist -- that's fine
    }

    return { tags_deleted: tagsDeleted, files_deleted: filesDeleted };
  } catch {
    return { tags_deleted: tagsDeleted, files_deleted: filesDeleted };
  }
}

/**
 * CLI entry point for checkpoint operations.
 *
 * Usage:
 *   bun run src/iteration/checkpoint.ts create \
 *     --record='{ ... IterationRecord JSON ... }'
 *
 *   bun run src/iteration/checkpoint.ts rollback --tag="iter/17/harness/1"
 *
 *   bun run src/iteration/checkpoint.ts read --tag="iter/17/harness/1"
 *
 *   bun run src/iteration/checkpoint.ts prune --phase=17
 *
 *   bun run src/iteration/checkpoint.ts artifact-delta --from-ref="iter/17/harness/1"
 *
 *   bun run src/iteration/checkpoint.ts commit-hash
 *
 * Outputs JSON result to stdout.
 */
if (import.meta.main) {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);

  async function run() {
    switch (subcommand) {
      case "create": {
        const recordRaw = getArg(args, "record");
        if (!recordRaw) {
          console.error("Missing --record argument");
          process.exit(2);
        }
        const record = iterationRecordSchema.parse(JSON.parse(recordRaw));
        const result = await createCheckpoint(record);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.tag_created && result.metadata_written ? 0 : 1);
        break;
      }
      case "rollback": {
        const tag = getArg(args, "tag");
        if (!tag) {
          console.error("Missing --tag argument");
          process.exit(2);
        }
        const result = await rollbackToCheckpoint(tag);
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
        break;
      }
      case "read": {
        const tag = getArg(args, "tag");
        if (!tag) {
          console.error("Missing --tag argument");
          process.exit(2);
        }
        const metadata = await readCheckpointMetadata(tag);
        console.log(JSON.stringify(metadata, null, 2));
        process.exit(metadata ? 0 : 1);
        break;
      }
      case "prune": {
        const phase = parseInt(getArg(args, "phase", "0"), 10);
        if (!phase) {
          console.error("Missing --phase argument");
          process.exit(2);
        }
        const result = await prunePhaseCheckpoints(phase);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;
      }
      case "artifact-delta": {
        const fromRef = getArg(args, "from-ref") || undefined;
        const delta = await getArtifactDelta(fromRef);
        console.log(JSON.stringify({ artifact_delta: delta }));
        process.exit(0);
        break;
      }
      case "commit-hash": {
        const hash = await getCurrentCommitHash();
        console.log(JSON.stringify({ commit_hash: hash }));
        process.exit(0);
        break;
      }
      default: {
        console.error(
          `Unknown subcommand: ${subcommand}. Use: create, rollback, read, prune, artifact-delta, commit-hash`,
        );
        process.exit(2);
      }
    }
  }

  run().catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
