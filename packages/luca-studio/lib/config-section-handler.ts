/**
 * Shared factory for config section PUT routes.
 *
 * Unlike `createApiHandler()` (which writes a full file), this factory
 * performs a read-modify-write cycle on `.planning/config.json`: it reads
 * the current config, replaces only the target section with the validated
 * incoming payload, and atomically writes the full config back.
 *
 * This ensures that writing to one section never clobbers other sections
 * and that every write goes through schema + semantic validation.
 *
 * @example
 * ```typescript
 * import { createConfigSectionHandler } from "~/lib/config-section-handler";
 * import { WorkflowSectionSchema } from "~/lib/config-section-schemas";
 *
 * const handler = createConfigSectionHandler({
 *   section: "workflow",
 *   schema: WorkflowSectionSchema,
 * });
 *
 * export async function PUT(request: Request) {
 *   return handler(request);
 * }
 * ```
 */
import { join } from "node:path";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { atomicWrite } from "~/lib/atomic-write";
import type { ConfigSectionKey } from "~/lib/config-section-schemas";
import { computeETag } from "~/lib/etag";
import { resolveProjectRoot } from "~/lib/project-root";
import type {
  SemanticError,
  SemanticValidator,
} from "~/lib/semantic-validators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the config section handler factory. */
export type ConfigSectionHandlerOptions<T extends z.ZodType> = {
  /** The config.json key this route manages (e.g. "workflow", "gates"). */
  section: ConfigSectionKey;

  /** Zod schema for structural validation of the section payload. */
  schema: T;

  /**
   * Optional semantic validators run after schema parsing.
   *
   * Each validator receives the parsed section data and returns a
   * structured pass/fail result. All validators run even if earlier
   * ones fail, so the caller gets the full set of semantic errors.
   */
  semanticValidators?: SemanticValidator[];
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Next.js PUT handler for a single config section.
 *
 * The returned handler:
 * 1. Parses the request body as JSON (400 on malformed JSON).
 * 2. Validates the body against the section schema (422 on failure).
 * 3. Runs semantic validators if any (422 on failure).
 * 4. Reads the current full config.json from disk.
 * 5. Checks `If-Match` header for optimistic concurrency (428 if missing,
 *    409 on mismatch against the full-file ETag).
 * 6. Replaces only the target section key.
 * 7. Atomically writes the updated config.json.
 * 8. Returns 200 with the updated section data and a full-file ETag header.
 *
 * The ETag is always computed from the full raw config.json file contents
 * (not the section alone), ensuring consistency with `GET /api/config`.
 *
 * @param options - Section key, schema, and optional semantic validators.
 * @returns Async `(request: Request) => Promise<NextResponse>` handler.
 */
export function createConfigSectionHandler<T extends z.ZodType>(
  options: ConfigSectionHandlerOptions<T>,
): (request: Request) => Promise<NextResponse> {
  const { section, schema, semanticValidators } = options;

  return async (request: Request): Promise<NextResponse> => {
    // -----------------------------------------------------------------------
    // 1. Parse JSON body
    // -----------------------------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // -----------------------------------------------------------------------
    // 2. Schema validation
    // -----------------------------------------------------------------------
    const parseResult = schema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { errors: parseResult.error.issues },
        { status: 422 },
      );
    }

    const sectionData = parseResult.data as z.output<T>;

    // -----------------------------------------------------------------------
    // 3. Semantic validation
    // -----------------------------------------------------------------------
    if (semanticValidators && semanticValidators.length > 0) {
      const semanticErrors: SemanticError[] = [];

      for (const validator of semanticValidators) {
        const result = validator(sectionData);
        if (!result.valid) {
          semanticErrors.push(...result.errors);
        }
      }

      if (semanticErrors.length > 0) {
        return NextResponse.json({ errors: semanticErrors }, { status: 422 });
      }
    }

    // -----------------------------------------------------------------------
    // 4. Read current config.json
    // -----------------------------------------------------------------------
    let fullConfig: Record<string, unknown>;
    let configPath: string;
    let rawFileContent: string;

    try {
      const root = await resolveProjectRoot();
      configPath = join(root, ".planning", "config.json");
      const exists = await Bun.file(configPath).exists();

      if (exists) {
        rawFileContent = await Bun.file(configPath).text();
        fullConfig = JSON.parse(rawFileContent) as Record<string, unknown>;
      } else {
        rawFileContent = "{}";
        fullConfig = {};
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read config.json";
      return NextResponse.json(
        { errors: [{ code: "READ_FAILED", message }] },
        { status: 500 },
      );
    }

    // -----------------------------------------------------------------------
    // 5. If-Match concurrency check (full-file ETag)
    // -----------------------------------------------------------------------
    const ifMatch = request.headers.get("If-Match");

    if (!ifMatch) {
      return NextResponse.json(
        { error: "If-Match header is required for PUT operations" },
        { status: 428 },
      );
    }

    const currentEtag = computeETag(rawFileContent);

    if (ifMatch !== currentEtag) {
      return NextResponse.json(
        { error: "Conflict: config has been modified since last read" },
        { status: 409 },
      );
    }

    // -----------------------------------------------------------------------
    // 6. Merge: replace only the target section
    // -----------------------------------------------------------------------
    fullConfig[section] = sectionData;

    // -----------------------------------------------------------------------
    // 7. Atomic write
    // -----------------------------------------------------------------------
    let serialized: string;
    try {
      serialized = JSON.stringify(fullConfig, null, 2);
      await atomicWrite(configPath, serialized);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown write error";
      return NextResponse.json(
        { errors: [{ code: "WRITE_FAILED", message }] },
        { status: 500 },
      );
    }

    // -----------------------------------------------------------------------
    // 8. Return updated section with full-file ETag
    // -----------------------------------------------------------------------
    const freshEtag = computeETag(serialized);

    return NextResponse.json(
      { data: sectionData },
      { headers: { ETag: freshEtag } },
    );
  };
}
