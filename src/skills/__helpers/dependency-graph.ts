/**
 * Topological sort, conflict detection, and parallel batching for skill dependencies.
 *
 * All functions are pure with no side effects.
 * T2-compliant: imports only from T0 (shared) and local schemas.
 */
import type { SkillDependencyMap } from "../__schemas/skill-dependencies.schemas";

/**
 * Build a topologically sorted execution order for requested skills.
 *
 * Uses Kahn's algorithm to produce a linear ordering that respects
 * required_before constraints. Throws if a circular dependency is detected.
 *
 * @param deps - The full dependency map
 * @param requested - Skill names to include in the execution order
 * @returns Topologically sorted skill names
 *
 * @example
 * ```typescript
 * const order = buildDependencyOrder(deps, ["deploy", "test", "build"]);
 * // ["build", "test", "deploy"]
 * ```
 */
export function buildDependencyOrder(
  deps: SkillDependencyMap,
  requested: string[],
): string[] {
  if (requested.length === 0) return [];

  const requestedSet = new Set(requested);

  // Build adjacency list and in-degree counts for requested skills only
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const skill of requestedSet) {
    inDegree.set(skill, 0);
    adjacency.set(skill, []);
  }

  for (const skill of requestedSet) {
    const entry = deps[skill];
    if (!entry) continue;

    for (const prereq of entry.required_before) {
      if (!requestedSet.has(prereq)) continue;
      // prereq -> skill (prereq must come before skill)
      adjacency.get(prereq)!.push(skill);
      inDegree.set(skill, (inDegree.get(skill) ?? 0) + 1);
    }

    for (const blocker of entry.blocked_by) {
      if (!requestedSet.has(blocker)) continue;
      // blocker -> skill (blocker must finish before skill can start)
      adjacency.get(blocker)!.push(skill);
      inDegree.set(skill, (inDegree.get(skill) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [skill, degree] of inDegree) {
    if (degree === 0) queue.push(skill);
  }
  // Sort initial queue for deterministic output
  queue.sort();

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // Insert sorted for deterministic output
        const insertIdx = queue.findIndex((q) => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  if (result.length !== requestedSet.size) {
    const remaining = [...requestedSet].filter((s) => !result.includes(s));
    throw new Error(
      `Circular dependency detected among skills: ${remaining.join(", ")}`,
    );
  }

  return result;
}

/**
 * Detect mutually exclusive conflicts among requested skills.
 *
 * @param deps - The full dependency map
 * @param requested - Skill names to check for conflicts
 * @returns Array of conflict descriptions (empty if no conflicts)
 *
 * @example
 * ```typescript
 * const conflicts = detectConflicts(deps, ["format", "lint"]);
 * // ["format and lint are mutually exclusive"]
 * ```
 */
export function detectConflicts(
  deps: SkillDependencyMap,
  requested: string[],
): string[] {
  if (requested.length === 0) return [];

  const requestedSet = new Set(requested);
  const conflicts: string[] = [];
  const seen = new Set<string>();

  for (const skill of requestedSet) {
    const entry = deps[skill];
    if (!entry) continue;

    for (const exclusive of entry.mutually_exclusive) {
      if (!requestedSet.has(exclusive)) continue;

      // Create a canonical key to avoid duplicate conflict reports
      const key = [skill, exclusive].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      conflicts.push(`${skill} and ${exclusive} are mutually exclusive`);
    }
  }

  return conflicts;
}

/**
 * Group topologically ordered skills into parallel-safe execution batches.
 *
 * Skills in the same batch can execute concurrently. A skill is placed in the
 * earliest batch where all its dependencies (required_before + blocked_by)
 * have already been scheduled in prior batches, and it is marked parallel_safe.
 *
 * @param deps - The full dependency map
 * @param ordered - Topologically sorted skill names (from buildDependencyOrder)
 * @returns Array of batches, each containing skills that can run in parallel
 *
 * @example
 * ```typescript
 * const batches = groupParallelBatches(deps, ["build", "test", "lint", "deploy"]);
 * // [["build"], ["test", "lint"], ["deploy"]]
 * ```
 */
export function groupParallelBatches(
  deps: SkillDependencyMap,
  ordered: string[],
): string[][] {
  if (ordered.length === 0) return [];

  const batches: string[][] = [];
  // Track which batch each skill was assigned to
  const skillBatch = new Map<string, number>();
  // Track which batches contain a non-parallel-safe skill (must stay solo)
  const soloBatches = new Set<number>();

  for (const skill of ordered) {
    const entry = deps[skill];

    // Find the latest batch index of any dependency
    let earliestBatch = 0;
    if (entry) {
      const allDeps = [...entry.required_before, ...entry.blocked_by];
      for (const dep of allDeps) {
        const depBatch = skillBatch.get(dep);
        if (depBatch !== undefined) {
          earliestBatch = Math.max(earliestBatch, depBatch + 1);
        }
      }
    }

    const isParallelSafe = entry?.parallel_safe ?? true;

    if (!isParallelSafe) {
      // Non-parallel-safe: find or create an empty batch at or after earliestBatch
      let targetBatch = earliestBatch;
      while (targetBatch < batches.length && batches[targetBatch]!.length > 0) {
        targetBatch++;
      }
      while (batches.length <= targetBatch) batches.push([]);
      batches[targetBatch]!.push(skill);
      skillBatch.set(skill, targetBatch);
      soloBatches.add(targetBatch);
      continue;
    }

    // Parallel-safe: place in the earliest batch at or after earliestBatch
    // that is not reserved for a solo (non-parallel-safe) skill
    let targetBatch = earliestBatch;
    while (soloBatches.has(targetBatch)) {
      targetBatch++;
    }
    while (batches.length <= targetBatch) batches.push([]);
    batches[targetBatch]!.push(skill);
    skillBatch.set(skill, targetBatch);
  }

  return batches;
}
