#!/usr/bin/env bun

/**
 * Compilation Sidecar — Standalone Bun HTTP process for per-entity compilation.
 *
 * Listens on TCP localhost:3457 and exposes incremental compilation via HTTP.
 * This enables Luca Studio to compile individual agents, skills, and rules
 * without invoking `bun run build:all` (which crashes Claude Code sessions).
 *
 * Endpoints:
 * - GET  /health  — Readiness check with uptime
 * - POST /compile — Compile a single entity by domain and name
 *
 * CRITICAL: This sidecar MUST NEVER invoke `bun run build:all`.
 * It performs per-entity compilation only.
 *
 * @module
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { agentRegistry } from "../../../src/agents/index.ts";
import { skillRegistry } from "../../../src/skills/index.ts";
import { ruleRegistry } from "../../../src/rules/index.ts";
import {
  compileAgent,
  compileSkill,
  compileRule,
} from "../../../src/compilers/index.ts";
import type { SupportedFormat } from "../../../src/compilers/index.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDECAR_PORT = 3457;
const REQUEST_TIMEOUT_MS = 30_000;
const startTime = Date.now();

// ---------------------------------------------------------------------------
// Zod request schema
// ---------------------------------------------------------------------------

/**
 * Schema for compile request validation.
 *
 * @property domain - The entity domain: agents, skills, or rules
 * @property name   - The entity name within the registry
 * @property format - Target compilation format (default: CLAUDE)
 */
const CompileRequestSchema = z.object({
  domain: z.enum(["agents", "skills", "rules"]),
  name: z.string().min(1),
  format: z.enum(["CLAUDE", "PLUGIN"]).default("CLAUDE"),
});

type CompileRequest = z.infer<typeof CompileRequestSchema>;

// ---------------------------------------------------------------------------
// Zod response schemas
// ---------------------------------------------------------------------------

/**
 * Schema for successful compile response validation.
 *
 * Validates the response shape before returning it to the client.
 * Uses snake_case for all properties per API conventions.
 *
 * @property status      - Always "compiled" for success
 * @property output_path - Relative path from repo root to the compiled file
 * @property duration_ms - Compilation duration in milliseconds
 */
const CompileSuccessResponseSchema = z.object({
  status: z.literal("compiled"),
  output_path: z.string().min(1),
  duration_ms: z.number().int().min(0),
});

/**
 * Schema for error compile response validation.
 *
 * Validates the error response shape before returning it to the client.
 * Uses snake_case for all properties per API conventions.
 *
 * @property status      - Always "error" for failures
 * @property error       - Human-readable error message
 * @property duration_ms - Time elapsed before error in milliseconds
 * @property details     - Optional Zod validation issue details
 */
const CompileErrorResponseSchema = z.object({
  status: z.literal("error"),
  error: z.string(),
  duration_ms: z.number().int().min(0),
  details: z.array(z.any()).optional(),
});

// ---------------------------------------------------------------------------
// Domain registry mapping
// ---------------------------------------------------------------------------

/**
 * Maps domain names to their respective registries.
 * Each registry is a Record<string, () => EntityInstance>.
 */
const DOMAIN_REGISTRIES: Record<string, Record<string, () => unknown>> = {
  agents: agentRegistry as Record<string, () => unknown>,
  skills: skillRegistry as Record<string, () => unknown>,
  rules: ruleRegistry as Record<string, () => unknown>,
};

// ---------------------------------------------------------------------------
// Output path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the output file path for a compiled entity.
 *
 * @param domain - Entity domain (agents, skills, rules)
 * @param name   - Entity name
 * @param format - Compilation format (CLAUDE or PLUGIN)
 * @returns Relative path from repo root to the output file
 */
function resolveOutputPath(
  domain: string,
  name: string,
  format: SupportedFormat,
): string {
  const prefix = format === "CLAUDE" ? ".claude" : "dist/plugin";
  switch (domain) {
    case "agents":
      return `${prefix}/agents/${name}.md`;
    case "skills":
      return `${prefix}/skills/${name}/SKILL.md`;
    case "rules":
      return `${prefix}/rules/${name}.md`;
    default:
      throw new Error("Unsupported domain for output path resolution");
  }
}

// ---------------------------------------------------------------------------
// Compilation logic
// ---------------------------------------------------------------------------

/**
 * Compile a single entity and write the output to disk.
 *
 * @param request - Validated compile request
 * @returns Object with output_path and compiled content
 * @throws Error if entity not found or compilation fails
 */
async function compileEntity(
  request: CompileRequest,
): Promise<{ output_path: string; content: string }> {
  const { domain, name, format } = request;

  const registry = DOMAIN_REGISTRIES[domain];
  if (!registry) {
    throw new Error("Invalid domain. Must be agents, skills, or rules.");
  }

  const factory = registry[name];
  if (!factory) {
    const safeDomain = String(domain).slice(0, 64);
    const safeName = String(name).slice(0, 64);
    const error = new Error(`${safeDomain}/${safeName} not found in registry`);
    (error as Error & { statusCode: number }).statusCode = 404;
    throw error;
  }

  const instance = factory();
  let content: string;

  switch (domain) {
    case "agents":
      content = compileAgent(
        instance as Parameters<typeof compileAgent>[0],
        format as SupportedFormat,
      );
      break;
    case "skills":
      content = compileSkill(
        instance as Parameters<typeof compileSkill>[0],
        format as SupportedFormat,
      );
      break;
    case "rules":
      content = compileRule(
        instance as Parameters<typeof compileRule>[0],
        format as SupportedFormat,
      );
      break;
    default:
      throw new Error("Unsupported domain for compilation");
  }

  const outputPath = resolveOutputPath(domain, name, format as SupportedFormat);

  // Ensure parent directory exists before writing (node:fs/promises — safe from
  // shell injection since the path comes from request data).
  const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
  const absolutePath = path.join(repoRoot, outputPath);
  const parentDir = path.dirname(absolutePath);
  await mkdir(parentDir, { recursive: true });
  await Bun.write(absolutePath, content);

  return { output_path: outputPath, content };
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------

/**
 * Create a JSON Response with the given body, status code, and optional schema validation.
 *
 * When a responseSchema is provided, validates the body before serialization.
 * Validation failures are logged but do NOT block the response to avoid
 * breaking clients on schema evolution.
 *
 * @param body           - JSON-serializable object
 * @param status         - HTTP status code (default: 200)
 * @param responseSchema - Optional Zod schema for response shape validation
 * @returns Response with application/json content type
 */
function jsonResponse(
  body: unknown,
  status = 200,
  responseSchema?: z.ZodType,
): Response {
  if (responseSchema) {
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      console.error(
        `[sidecar] Response validation failed: ${parsed.error.message}`,
      );
      // Still return the body to avoid breaking clients
    }
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

/**
 * Handle GET /health — readiness check.
 *
 * @returns JSON response with status and uptime
 */
function handleHealth(): Response {
  return jsonResponse({
    status: "ok",
    uptime_ms: Date.now() - startTime,
  });
}

/**
 * Handle POST /compile — per-entity compilation.
 *
 * Parses the request body with Zod, compiles the entity, writes output
 * to disk, and returns the result. All errors are caught and returned
 * as structured JSON responses.
 *
 * @param request - Incoming HTTP request
 * @returns JSON response with compilation result or error
 */
async function handleCompile(request: Request): Promise<Response> {
  const startMs = Date.now();

  // Parse request body as JSON
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(
      {
        status: "error",
        error: "Invalid JSON body",
        duration_ms: Date.now() - startMs,
      },
      400,
    );
  }

  // Validate with Zod schema
  const parseResult = CompileRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    // Distinguish invalid domain values (400) from missing fields (422)
    const hasDomainError = parseResult.error.issues.some(
      (issue) =>
        issue.path[0] === "domain" && issue.code === "invalid_enum_value",
    );
    const statusCode = hasDomainError ? 400 : 422;

    return jsonResponse(
      {
        status: "error",
        error: hasDomainError
          ? "Invalid domain value. Must be agents, skills, or rules."
          : "Validation failed",
        details: parseResult.error.issues,
        duration_ms: Date.now() - startMs,
      },
      statusCode,
      CompileErrorResponseSchema,
    );
  }

  // Compile with timeout
  try {
    const result = await Promise.race([
      compileEntity(parseResult.data),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Compilation timed out after 30s")),
          REQUEST_TIMEOUT_MS,
        ),
      ),
    ]);

    return jsonResponse(
      {
        status: "compiled",
        output_path: result.output_path,
        duration_ms: Date.now() - startMs,
      },
      200,
      CompileSuccessResponseSchema,
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = (error as Error & { statusCode?: number }).statusCode;

    if (error.message.includes("timed out")) {
      return jsonResponse(
        {
          status: "error",
          error: error.message,
          duration_ms: Date.now() - startMs,
        },
        504,
        CompileErrorResponseSchema,
      );
    }

    if (statusCode === 404) {
      return jsonResponse(
        {
          status: "error",
          error: error.message,
          duration_ms: Date.now() - startMs,
        },
        404,
        CompileErrorResponseSchema,
      );
    }

    // Domain validation errors
    if (error.message.startsWith("Invalid domain:")) {
      return jsonResponse(
        {
          status: "error",
          error: error.message,
          duration_ms: Date.now() - startMs,
        },
        400,
        CompileErrorResponseSchema,
      );
    }

    // All other compilation failures
    return jsonResponse(
      {
        status: "error",
        error: error.message,
        duration_ms: Date.now() - startMs,
      },
      500,
      CompileErrorResponseSchema,
    );
  }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

try {
  const server = Bun.serve({
    port: SIDECAR_PORT,
    async fetch(request) {
      const url = new URL(request.url);

      // Route: GET /health
      if (request.method === "GET" && url.pathname === "/health") {
        return handleHealth();
      }

      // Route: POST /compile
      if (request.method === "POST" && url.pathname === "/compile") {
        try {
          return await handleCompile(request);
        } catch (err) {
          // Catch-all error boundary — never crash the server
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[${new Date().toISOString()}] Unhandled error in /compile: ${message}`,
          );
          return jsonResponse(
            { status: "error", error: "Internal server error" },
            500,
          );
        }
      }

      // 404 for unknown routes
      return jsonResponse({ status: "error", error: "Not found" }, 404);
    },
  });

  console.log(
    `[sidecar] Compilation sidecar listening on http://localhost:${server.port}`,
  );
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));

  // Port conflict detection — Bun uses various error messages depending on version
  if (
    error.message.includes("EADDRINUSE") ||
    error.message.includes("address already in use") ||
    error.message.includes("Is port") ||
    error.message.includes("Failed to start server")
  ) {
    console.error(
      `[sidecar] Port ${SIDECAR_PORT} is already in use. ` +
        `Another process may be running on this port. ` +
        `Check with: lsof -i :${SIDECAR_PORT}`,
    );
    process.exit(1);
  }

  console.error(`[sidecar] Failed to start: ${error.message}`);
  process.exit(1);
}
