/**
 * Shared factory functions for entity CRUD API routes.
 *
 * Provides `createEntityListHandler` and `createEntityDetailHandler` so that
 * agent, skill, and rule routes share a single code path for glob-scan,
 * parse, ETag computation, and optimistic-concurrency writes.
 *
 * @module entity-route-helpers
 */
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { computeETag } from "~/lib/etag";
import { resolveProjectRoot } from "~/lib/project-root";
import type { EntityDomain, EntityMetadata } from "~/lib/ts-round-trip";
import { readEntityFile, writeEntityFile } from "~/lib/ts-round-trip";

// ---------------------------------------------------------------------------
// Security: entity name allowlist (SEC-001)
// ---------------------------------------------------------------------------

/**
 * Regex that only permits kebab-case entity names.
 * Blocks path traversal (`../../etc/passwd`), slashes, spaces, dots, etc.
 */
const SAFE_ENTITY_NAME = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Security: Zod schema for PUT body validation (SEC-002)
// ---------------------------------------------------------------------------

/** Maximum allowed size (in characters) for rawConfigText payloads. */
const MAX_CONFIG_TEXT_BYTES = 512 * 1024; // 512 KB

/**
 * Schema for entity PUT request bodies.
 *
 * Validates shape, types, and enforces a 512 KB size cap on rawConfigText
 * to prevent oversized payloads from being written to `.ts` source files.
 *
 * The metadata schema uses `.passthrough()` so that all fields of the full
 * `EntityMetadata` interface are forwarded to `writeEntityFile()`, while
 * still enforcing the required structural fields.
 */
const EntityPutBodySchema = z.object({
  rawConfigText: z.string().min(1).max(MAX_CONFIG_TEXT_BYTES),
  metadata: z
    .object({
      varName: z.string().min(1),
      configType: z.string().min(1),
      exportVarName: z.string().min(1),
      factoryFn: z.string().min(1),
      domain: z.enum(["agents", "skills", "rules"]),
      imports: z.array(z.string()),
      sharedConstants: z.array(z.string()),
      prefix: z.string(),
      suffix: z.string(),
    })
    .passthrough(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary returned by the list endpoint for each entity. */
export interface EntitySummary {
  /** Kebab-case entity name (e.g. "lu-router") */
  name: string;
  /** Domain identifier */
  domain: EntityDomain;
  /** camelCase config variable name */
  varName: string;
  /** TypeScript config type annotation */
  configType: string;
  /** Absolute path to the source file */
  filePath: string;
  /** Approximate raw config size in characters (UI hint) */
  configSize: number;
}

/** Full detail returned by the single-entity GET endpoint. */
export interface EntityDetail {
  name: string;
  domain: EntityDomain;
  rawConfigText: string;
  metadata: EntityMetadata;
}

/** Maps domain to its file extension suffix and subdirectories to scan. */
const DOMAIN_CONFIG: Record<
  EntityDomain,
  { suffix: string; subdirs: string[] }
> = {
  agents: { suffix: ".agent.ts", subdirs: ["general", "luca"] },
  skills: { suffix: ".skill.ts", subdirs: ["general", "luca"] },
  rules: { suffix: ".rule.ts", subdirs: ["general", "profiles"] },
};

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an entity name to its absolute file path by scanning known subdirs.
 *
 * Given a name like "lu-router" and domain "agents", searches for
 * `lu-router.agent.ts` inside `src/agents/general/` and `src/agents/luca/`.
 * For rules with profile subdirectories, also recurses one level deeper
 * (e.g. `src/rules/profiles/typescript/`).
 *
 * @param root - Project root directory.
 * @param domain - Entity domain.
 * @param name - Kebab-case entity name.
 * @returns Absolute file path, or null if not found.
 */
async function resolveEntityPath(
  root: string,
  domain: EntityDomain,
  name: string,
): Promise<string | null> {
  const config = DOMAIN_CONFIG[domain];
  const filename = `${name}${config.suffix}`;

  for (const subdir of config.subdirs) {
    const dirPath = join(root, "src", domain, subdir);

    // Direct file in subdir
    const directPath = join(dirPath, filename);
    if (
      await access(directPath).then(
        () => true,
        () => false,
      )
    ) {
      return directPath;
    }

    // For rules/profiles, check nested subdirectories (e.g. profiles/typescript/)
    if (domain === "rules" && subdir === "profiles") {
      let entries: string[];
      try {
        entries = await readdir(dirPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const nestedPath = join(dirPath, entry, filename);
        if (
          await access(nestedPath).then(
            () => true,
            () => false,
          )
        ) {
          return nestedPath;
        }
      }
    }
  }

  return null;
}

/**
 * Extract the kebab-case entity name from a file path.
 *
 * @param filePath - Absolute path to the entity file.
 * @param domain - Entity domain (to determine suffix).
 * @returns The kebab-case name (e.g. "lu-router" from "lu-router.agent.ts").
 */
function extractNameFromPath(filePath: string, domain: EntityDomain): string {
  const suffix = DOMAIN_CONFIG[domain].suffix;
  const filename = filePath.split("/").pop() ?? "";
  return filename.replace(suffix, "");
}

// ---------------------------------------------------------------------------
// List handler factory
// ---------------------------------------------------------------------------

/**
 * Create a Next.js GET handler that lists all entities for a given domain.
 *
 * Scans the configured subdirectories for entity files, reads each with the
 * ts-round-trip read path, and returns an array of summaries.
 *
 * @param domain - The entity domain to scan.
 * @returns An async function suitable for `export async function GET()`.
 *
 * @example
 * ```typescript
 * import { createEntityListHandler } from "~/lib/entity-route-helpers";
 * export const GET = createEntityListHandler("agents");
 * ```
 */
export function createEntityListHandler(
  domain: EntityDomain,
): () => Promise<NextResponse> {
  const config = DOMAIN_CONFIG[domain];

  return async (): Promise<NextResponse> => {
    try {
      const root = await resolveProjectRoot();
      const summaries: EntitySummary[] = [];

      for (const subdir of config.subdirs) {
        const dirPath = join(root, "src", domain, subdir);
        const isNestedProfiles = domain === "rules" && subdir === "profiles";

        /** Collect matching file paths from dirPath (and nested dirs for profiles). */
        const matchingFiles: string[] = [];

        let topEntries: string[];
        try {
          topEntries = await readdir(dirPath);
        } catch {
          // Directory may not exist -- skip silently
          continue;
        }

        for (const entry of topEntries) {
          if (entry.endsWith(config.suffix)) {
            matchingFiles.push(join(dirPath, entry));
          } else if (isNestedProfiles) {
            // Recurse one level into profile subdirectories
            const nestedDir = join(dirPath, entry);
            let nestedEntries: string[];
            try {
              nestedEntries = await readdir(nestedDir);
            } catch {
              continue;
            }
            for (const nested of nestedEntries) {
              if (nested.endsWith(config.suffix)) {
                matchingFiles.push(join(nestedDir, nested));
              }
            }
          }
        }

        for (const filePath of matchingFiles) {
          const result = await readEntityFile(filePath);

          if (result.success) {
            summaries.push({
              name: extractNameFromPath(filePath, domain),
              domain,
              varName: result.metadata.varName,
              configType: result.metadata.configType,
              filePath,
              configSize: result.rawConfigText.length,
            });
          }
          // Skip files that fail extraction (malformed entity files)
        }
      }

      return NextResponse.json({ data: summaries });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error listing entities";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

// ---------------------------------------------------------------------------
// Detail handler factory
// ---------------------------------------------------------------------------

/**
 * Create Next.js GET and PUT handlers for a single entity by name.
 *
 * **GET:** Reads the entity file, returns the full extraction result with an
 * ETag header computed from the raw source file contents.
 *
 * **PUT:** Accepts `{ rawConfigText, metadata }` in the request body, checks
 * `If-Match` against the current file ETag for optimistic concurrency, writes
 * the entity via `writeEntityFile()`, and returns the updated entity with a
 * fresh ETag.
 *
 * @param domain - The entity domain.
 * @returns An object with `GET` and `PUT` async handler functions.
 *
 * @example
 * ```typescript
 * import { createEntityDetailHandler } from "~/lib/entity-route-helpers";
 * const handlers = createEntityDetailHandler("agents");
 * export const GET = handlers.GET;
 * export const PUT = handlers.PUT;
 * ```
 */
export function createEntityDetailHandler(domain: EntityDomain): {
  GET: (
    request: Request,
    context: { params: Promise<{ name: string }> },
  ) => Promise<NextResponse>;
  PUT: (
    request: Request,
    context: { params: Promise<{ name: string }> },
  ) => Promise<NextResponse>;
} {
  return {
    async GET(
      _request: Request,
      { params }: { params: Promise<{ name: string }> },
    ): Promise<NextResponse> {
      try {
        const { name } = await params;

        if (!SAFE_ENTITY_NAME.test(name)) {
          return NextResponse.json(
            { error: "Invalid entity name" },
            { status: 400 },
          );
        }

        const root = await resolveProjectRoot();
        const filePath = await resolveEntityPath(root, domain, name);

        if (!filePath) {
          return NextResponse.json(
            { error: `Entity not found: ${name}` },
            { status: 404 },
          );
        }

        const result = await readEntityFile(filePath);

        if (!result.success) {
          return NextResponse.json(
            {
              error: "Failed to extract entity config",
              details: result.error,
            },
            { status: 422 },
          );
        }

        // Compute ETag from full source file contents
        const source = await readFile(filePath, "utf-8");
        const etag = computeETag(source);

        const detail: EntityDetail = {
          name,
          domain,
          rawConfigText: result.rawConfigText,
          metadata: result.metadata,
        };

        return NextResponse.json(
          { data: detail },
          {
            headers: { ETag: etag },
          },
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error reading entity";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },

    async PUT(
      request: Request,
      { params }: { params: Promise<{ name: string }> },
    ): Promise<NextResponse> {
      try {
        const { name } = await params;

        if (!SAFE_ENTITY_NAME.test(name)) {
          return NextResponse.json(
            { error: "Invalid entity name" },
            { status: 400 },
          );
        }

        const root = await resolveProjectRoot();
        const filePath = await resolveEntityPath(root, domain, name);

        if (!filePath) {
          return NextResponse.json(
            { error: `Entity not found: ${name}` },
            { status: 404 },
          );
        }

        // If-Match concurrency check — mandatory (SEC-003)
        const ifMatch = request.headers.get("If-Match");
        if (!ifMatch) {
          return NextResponse.json(
            { error: "If-Match header is required for PUT operations" },
            { status: 428 },
          );
        }

        const currentSource = await readFile(filePath, "utf-8");
        const currentEtag = computeETag(currentSource);

        if (ifMatch !== currentEtag) {
          // Include current entity source so the client can merge/display
          const currentEntity = await readEntityFile(filePath);
          return NextResponse.json(
            {
              error: "Conflict: entity has been modified since last read",
              current_etag: currentEtag,
              current_content: currentEntity.success
                ? currentEntity.rawConfigText
                : null,
            },
            { status: 409 },
          );
        }

        // Parse and validate request body (SEC-002)
        let rawBody: unknown;
        try {
          rawBody = await request.json();
        } catch {
          return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
          );
        }

        const bodyResult = EntityPutBodySchema.safeParse(rawBody);
        if (!bodyResult.success) {
          return NextResponse.json(
            { error: "Invalid request body", details: bodyResult.error.issues },
            { status: 422 },
          );
        }

        // Write via ts-round-trip (atomic write)
        // Cast metadata: Zod passthrough preserves all EntityMetadata fields
        // but the inferred type is wider than the nominal interface.
        await writeEntityFile(
          filePath,
          bodyResult.data.rawConfigText,
          bodyResult.data.metadata as EntityMetadata,
        );

        // Read back and return fresh data with new ETag
        const updatedResult = await readEntityFile(filePath);

        if (!updatedResult.success) {
          return NextResponse.json(
            {
              error: "Write succeeded but re-read failed",
              details: updatedResult.error,
            },
            { status: 500 },
          );
        }

        const updatedSource = await readFile(filePath, "utf-8");
        const freshEtag = computeETag(updatedSource);

        const detail: EntityDetail = {
          name,
          domain,
          rawConfigText: updatedResult.rawConfigText,
          metadata: updatedResult.metadata,
        };

        return NextResponse.json(
          { data: detail },
          {
            headers: { ETag: freshEtag },
          },
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error writing entity";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    },
  };
}
