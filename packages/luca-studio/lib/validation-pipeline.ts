/**
 * Composable three-step validation pipeline for write routes.
 *
 * Every write route in Luca Studio configures this pipeline with a Zod
 * schema, optional semantic validators, and a target file path. The
 * pipeline enforces a strict sequence — schema parse, semantic validation,
 * atomic write — so that no route can accidentally bypass integrity checks.
 *
 * Two factory functions are exported:
 *
 * - `createValidationPipeline` — returns a raw handler (framework-agnostic).
 * - `createApiHandler` — wraps the pipeline into a Next.js `Request -> NextResponse`
 *   handler suitable for use in `app/api/` route files.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { createApiHandler } from "~/lib/validation-pipeline";
 * import { detectCycles } from "~/lib/semantic-validators";
 *
 * const PipelineSchema = z.object({ steps: z.array(StepSchema) });
 *
 * export async function PUT(request: Request) {
 *   const handler = createApiHandler({
 *     schema: PipelineSchema,
 *     semanticValidators: [(data) => detectCycles(data.steps)],
 *     filePath: "/project/.planning/pipeline.json",
 *   });
 *   return handler(request);
 * }
 * ```
 */
import { NextResponse } from 'next/server'
import type { z } from 'zod'

import { atomicWrite } from '~/lib/atomic-write'
import type {
    SemanticError,
    SemanticValidator,
} from '~/lib/semantic-validators'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration options for `createValidationPipeline`. */
export type ValidationPipelineOptions<T extends z.ZodType> = {
    /** Zod schema for step 1 (structural validation). */
    schema: T

    /** Optional array of semantic validators for step 2. */
    semanticValidators?: SemanticValidator[]

    /**
     * Target file path for step 3 (atomic write).
     *
     * May be a static string or a function that derives the path from the
     * parsed data (useful when the filename depends on a field value).
     */
    filePath: string | ((data: z.output<T>) => string)

    /**
     * Custom serializer for the data before writing.
     *
     * Defaults to `JSON.stringify(data, null, 2)` for human-readable JSON.
     */
    serialize?: (data: z.output<T>) => string
}

/** Discriminated result returned by the validation pipeline. */
export type PipelineResult<T> =
    | { success: true; data: T }
    | {
          success: false
          status: 422 | 500
          errors: ReadonlyArray<SemanticError | z.ZodIssue>
      }

// ---------------------------------------------------------------------------
// Pipeline factory
// ---------------------------------------------------------------------------

/**
 * Create a composable validation pipeline.
 *
 * Returns an async handler that runs three steps in order:
 *
 * 1. **Schema parse** — `schema.safeParse(body)`. Short-circuits with 422 on failure.
 * 2. **Semantic validation** — runs every semantic validator against the parsed data.
 *    Short-circuits with 422 on any failure.
 * 3. **Atomic write** — serializes the data and writes it to `filePath` via the
 *    crash-safe `.tmp` + `rename` utility. Returns 500 on write failure.
 *
 * On success the handler returns `{ success: true, data }` with the parsed,
 * validated data.
 *
 * @param options - Pipeline configuration (schema, validators, file path, serializer).
 * @returns An async function `(body: unknown) => Promise<PipelineResult<T>>`.
 */
export function createValidationPipeline<T extends z.ZodType>(
    options: ValidationPipelineOptions<T>
): (body: unknown) => Promise<PipelineResult<z.output<T>>> {
    const { schema, semanticValidators, filePath, serialize } = options

    const serializer =
        serialize ?? ((data: z.output<T>) => JSON.stringify(data, null, 2))

    return async (body: unknown): Promise<PipelineResult<z.output<T>>> => {
        // Step 1: Schema parse
        const parseResult = schema.safeParse(body)
        if (!parseResult.success) {
            return {
                success: false,
                status: 422,
                errors: parseResult.error.issues,
            }
        }

        const data = parseResult.data as z.output<T>

        // Step 2: Semantic validation
        if (semanticValidators && semanticValidators.length > 0) {
            const semanticErrors: SemanticError[] = []

            for (const validator of semanticValidators) {
                const result = validator(data)
                if (!result.valid) {
                    semanticErrors.push(...result.errors)
                }
            }

            if (semanticErrors.length > 0) {
                return {
                    success: false,
                    status: 422,
                    errors: semanticErrors,
                }
            }
        }

        // Step 3: Atomic write
        const resolvedPath =
            typeof filePath === 'function' ? filePath(data) : filePath
        const serialized = serializer(data)

        try {
            await atomicWrite(resolvedPath, serialized)
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Unknown write error'
            return {
                success: false,
                status: 500,
                errors: [{ code: 'WRITE_FAILED', message }],
            }
        }

        return { success: true, data }
    }
}

// ---------------------------------------------------------------------------
// Next.js API handler wrapper
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper that creates a `Request -> NextResponse` handler.
 *
 * Extracts the JSON body from the incoming request, runs it through the
 * validation pipeline, and returns the appropriate `NextResponse`:
 *
 * - **200** with `{ data }` on success.
 * - **422** with `{ errors }` on schema or semantic validation failure.
 * - **500** with `{ errors }` on write failure.
 * - **400** with `{ error }` if the request body is not valid JSON.
 *
 * @param options - Same options as `createValidationPipeline`.
 * @returns An async function `(request: Request) => Promise<NextResponse>`.
 *
 * @example
 * ```typescript
 * import { createApiHandler } from "~/lib/validation-pipeline";
 *
 * export async function PUT(request: Request) {
 *   const handler = createApiHandler({ schema: MySchema, filePath: "/path/to/file.json" });
 *   return handler(request);
 * }
 * ```
 */
export function createApiHandler<T extends z.ZodType>(
    options: ValidationPipelineOptions<T>
): (request: Request) => Promise<NextResponse> {
    const pipeline = createValidationPipeline(options)

    return async (request: Request): Promise<NextResponse> => {
        // Parse JSON body
        let body: unknown
        try {
            body = await request.json()
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 }
            )
        }

        // Run pipeline
        const result = await pipeline(body)

        if (result.success) {
            return NextResponse.json({ data: result.data })
        }

        return NextResponse.json(
            { errors: result.errors },
            { status: result.status }
        )
    }
}
