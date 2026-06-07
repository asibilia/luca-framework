/**
 * POST /api/git/revert -- Revert a specific file to a specific commit SHA.
 *
 * Checks out the file from the given commit and stages it for the next
 * publish operation. Does NOT auto-commit the revert.
 *
 * Request body: `{ file_path: string, commit_sha: string }`
 *
 * @returns `{ reverted: true, file_path }` on success
 * @returns `{ error }` with 400/500 on failure
 */
import { execFileSync } from 'node:child_process'
import { isAbsolute, normalize, resolve, sep } from 'node:path'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { STUDIO_PATH_PREFIXES } from '~/lib/constants'
import { resolveProjectRoot } from '~/lib/project-root'
import { isLocalhostRequest } from '~/lib/request-guards'

/**
 * Check whether a file path belongs to a Studio-tracked entity.
 * Uses separator-aware prefix matching to avoid sibling directory collisions.
 *
 * @param filePath - Relative file path from the request body
 * @returns true if the file is a Studio-tracked path
 */
function isStudioFile(filePath: string): boolean {
    const trimmed = filePath.trim()
    return STUDIO_PATH_PREFIXES.some(
        (prefix) =>
            trimmed === prefix ||
            trimmed.startsWith(prefix.endsWith(sep) ? prefix : prefix + sep)
    )
}

/**
 * Validate that a file path is safe: relative, no traversal, and resolves
 * within the given root directory.
 */
function isSafePath(filePath: string, root: string): boolean {
    if (isAbsolute(filePath)) return false
    const resolved = resolve(root, filePath)
    return resolved.startsWith(root + sep) || resolved === root
}

/**
 * Request body schema for the revert endpoint.
 * Uses snake_case per API conventions.
 */
const RevertBodySchema = z.object({
    file_path: z.string().min(1, 'file_path is required'),
    commit_sha: z
        .string()
        .regex(
            /^[0-9a-f]{4,40}$/i,
            'commit_sha must be a hex string (4-40 chars)'
        ),
})

export async function POST(request: Request) {
    try {
        // Localhost guard: restrict to local development server
        if (!isLocalhostRequest(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 1. Parse and validate body
        let body: unknown
        try {
            body = await request.json()
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 }
            )
        }

        const parseResult = RevertBodySchema.safeParse(body)
        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error:
                        parseResult.error.issues[0]?.message ??
                        'Validation failed',
                },
                { status: 400 }
            )
        }

        const { file_path, commit_sha } = parseResult.data

        // 2. Normalize path and validate safety
        const normalizedPath = normalize(file_path)
        const root = await resolveProjectRoot()

        if (!isSafePath(normalizedPath, root)) {
            return NextResponse.json(
                { error: 'Path not allowed' },
                { status: 403 }
            )
        }

        if (!isStudioFile(normalizedPath)) {
            return NextResponse.json(
                { error: 'Path not allowed' },
                { status: 403 }
            )
        }

        // 3. Checkout the file from the given commit
        execFileSync('git', ['checkout', commit_sha, '--', normalizedPath], {
            cwd: root,
            encoding: 'utf-8',
        })

        // 4. File is automatically staged by git checkout -- no extra add needed

        return NextResponse.json({
            reverted: true,
            file_path: normalizedPath,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Revert failed'
        return NextResponse.json(
            { error: `Revert failed: ${message}` },
            { status: 500 }
        )
    }
}
