import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { appendLedger } from '../state/session-ledger.js'
import {
    addTodo,
    listTodos,
    moveTodo,
    moveBatch,
    removeTodo,
    assignBatch,
    readTodoContent,
    type TodoStatus,
} from '../state/todos.js'
import {
    findCriterion,
    readVerificationHistory,
    type VerificationResult,
} from '../state/verification-result.js'

const verificationRefSchema = z.object({
    criterionId: z
        .string()
        .describe('Stable criterion ID from verification-result.json'),
    wave: z
        .number()
        .int()
        .describe('Wave number whose verification result contains the criterion'),
})

type VerificationRef = z.infer<typeof verificationRefSchema>

/**
 * Validate a verificationRef points at a real, met, evidence-backed criterion.
 * Returns null on success, or a structured error payload to return to the caller.
 */
function validateVerificationRef(
    ref: VerificationRef | undefined,
    history?: VerificationResult[]
): {
    code: string
    message: string
} | null {
    if (!ref) {
        return {
            code: 'TODO_DONE_UNVERIFIED',
            message:
                'verificationRef is required when moving a todo to "done". Provide { criterionId, wave } pointing at a PASS criterion in verification-history.jsonl.',
        }
    }
    const found = findCriterion({ ...ref, history })
    if (!found) {
        return {
            code: 'TODO_DONE_UNVERIFIED',
            message: `verificationRef { criterionId: "${ref.criterionId}", wave: ${ref.wave} } not found in verification-history.jsonl. Write a verification-result with this criterion before moving the todo.`,
        }
    }
    if (!found.criterion.met) {
        return {
            code: 'TODO_DONE_UNVERIFIED',
            message: `Criterion "${ref.criterionId}" (wave ${ref.wave}) is recorded as NOT met. Cannot move the todo to done.`,
        }
    }
    if (!found.criterion.evidence || !found.criterion.evidence.trim()) {
        return {
            code: 'TODO_DONE_UNVERIFIED',
            message: `Criterion "${ref.criterionId}" (wave ${ref.wave}) has empty evidence. Move blocked — re-run verification with concrete evidence (file/line/test).`,
        }
    }
    if (found.result.status !== 'PASS') {
        return {
            code: 'TODO_DONE_UNVERIFIED',
            message: `Criterion "${ref.criterionId}" (wave ${ref.wave}) belongs to a verification result with status "${found.result.status}", not PASS. Cannot move the todo to done — fix the failing/stalled wave first.`,
        }
    }
    return null
}

export const manageTodosTool = createTool({
    id: 'manage-todos',
    description:
        'Manage the Luca development backlog stored as markdown files in .planning/todos/. ' +
        'Todos live in status directories: pending/, backlog/, done/. ' +
        'Supports listing, adding, moving between statuses (single or batch), reading full content, removing, and batch-assigning. ' +
        "Use 'list' before 'add' to check for duplicates. When moving to 'done', verify the task is actually complete. " +
        "Use 'move-batch' (NOT a sequence of 'move' calls) when changing the status of multiple todos at once — " +
        "indices are reassigned every list, so sequential 'move' calls with stale indices will hit the wrong todos.",
    inputSchema: z.object({
        action: z
            .enum([
                'list',
                'add',
                'move',
                'move-batch',
                'read',
                'remove',
                'assign-batch',
            ])
            .describe('Operation to perform on the backlog'),
        title: z
            .string()
            .optional()
            .describe('Title for a new todo (required for add)'),
        area: z
            .string()
            .optional()
            .describe(
                "Area/domain tag for a new todo (e.g. 'data', 'ui', 'admin')"
            ),
        priority: z
            .string()
            .optional()
            .describe(
                "Priority for a new todo (e.g. 'low', 'medium', 'high', 'critical')"
            ),
        source: z
            .string()
            .optional()
            .describe(
                "Source tag for a new todo (e.g. 'luca-cli', 'research', 'triage')"
            ),
        body: z
            .string()
            .optional()
            .describe(
                'Optional markdown body appended after the task title. Use for context notes, recall instructions, etc.'
            ),
        identifier: z
            .union([z.number(), z.string()])
            .optional()
            .describe(
                'Todo identifier — numeric index (from list output) or slug string (required for move, read, remove)'
            ),
        targetStatus: z
            .enum(['pending', 'backlog', 'done'])
            .optional()
            .describe('Target status directory (required for move)'),
        indices: z
            .array(z.number())
            .optional()
            .describe(
                'Array of todo indices to assign to pending (required for assign-batch)'
            ),
        items: z
            .array(
                z.object({
                    identifier: z.union([z.number(), z.string()]),
                    targetStatus: z.enum(['pending', 'backlog', 'done']),
                    verificationRef: verificationRefSchema.optional(),
                })
            )
            .optional()
            .describe(
                'Array of {identifier, targetStatus, verificationRef?} for batch status changes (required for move-batch). ' +
                    'Identifiers may be numeric indices or slug strings; mixing is allowed. ' +
                    'All identifiers are resolved against a single backlog snapshot before any moves run, ' +
                    'so indices captured from a prior `list` call remain valid for the entire batch. ' +
                    'verificationRef is REQUIRED for any item whose targetStatus is "done"; the batch is rejected atomically if any done item lacks a valid ref.'
            ),
        verificationRef: verificationRefSchema
            .optional()
            .describe(
                'Required when moving a single todo to "done". Points at a PASS criterion in verification-history.jsonl. ' +
                    'Format: { criterionId: string, wave: number }. The criterion must exist, be met, and have non-empty evidence.'
            ),
        filterStatus: z
            .enum(['pending', 'backlog', 'done'])
            .optional()
            .describe('Filter todos by status directory (for list action)'),
    }),
    execute: async (inputData) => {
        const {
            action,
            title,
            area,
            priority,
            source,
            body,
            identifier,
            targetStatus,
            indices,
            items,
            filterStatus,
            verificationRef,
        } = inputData as typeof inputData & {
            verificationRef?: VerificationRef
        }

        switch (action) {
            case 'list': {
                const todos = listTodos({
                    status: filterStatus as TodoStatus | undefined,
                })
                const lines = todos.map((t) => {
                    const icon =
                        t.status === 'done'
                            ? '✅'
                            : t.status === 'backlog'
                              ? '📋'
                              : '⬜'
                    const tags = [t.area, t.priority].filter(Boolean).join(', ')
                    return `${icon} #${t.index} [${t.status}] ${t.title}${tags ? ` (${tags})` : ''}`
                })
                return {
                    count: todos.length,
                    todos: lines.join('\n') || '(empty backlog)',
                }
            }
            case 'add': {
                if (!title) return { error: 'title is required for add' }
                const todo = addTodo({ title, area, priority, source, body })
                return {
                    added: `${todo.title}`,
                    slug: todo.slug,
                    status: todo.status,
                }
            }
            case 'move': {
                if (identifier === undefined || !targetStatus)
                    return {
                        error: 'identifier and targetStatus are required for move',
                    }
                if (targetStatus === 'done') {
                    const violation = validateVerificationRef(verificationRef)
                    if (violation) {
                        appendLedger('todo-move-blocked', {
                            identifier: String(identifier),
                            targetStatus,
                            reason: violation.code,
                            message: violation.message,
                        })
                        return {
                            error: violation.message,
                            code: violation.code,
                        }
                    }
                }
                const moved = moveTodo({
                    identifier,
                    targetStatus: targetStatus as TodoStatus,
                })
                if (!moved) return { error: `Todo not found: ${identifier}` }
                if (targetStatus === 'done' && verificationRef) {
                    appendLedger('todo-moved-to-done', {
                        slug: moved.slug,
                        title: moved.title,
                        verificationRef,
                    })
                }
                return {
                    moved: `#${moved.index} ${moved.title} → ${moved.status}`,
                }
            }
            case 'move-batch': {
                if (!items?.length)
                    return {
                        error: 'items array is required for move-batch',
                    }
                // Atomic guard: validate every done item BEFORE any move runs.
                // Read verification history exactly once and reuse it for every
                // item — otherwise this is O(items × history) on disk reads.
                const blocked: Array<{
                    identifier: string
                    code: string
                    message: string
                }> = []
                const historyForBatch = items.some(
                    (it) => it.targetStatus === 'done'
                )
                    ? readVerificationHistory()
                    : undefined
                for (const it of items) {
                    if (it.targetStatus === 'done') {
                        const violation = validateVerificationRef(
                            it.verificationRef,
                            historyForBatch
                        )
                        if (violation) {
                            blocked.push({
                                identifier: String(it.identifier),
                                code: violation.code,
                                message: violation.message,
                            })
                        }
                    }
                }
                if (blocked.length > 0) {
                    for (const b of blocked) {
                        appendLedger('todo-move-blocked', {
                            identifier: b.identifier,
                            targetStatus: 'done',
                            reason: b.code,
                            message: b.message,
                        })
                    }
                    return {
                        error: `move-batch rejected: ${blocked.length} done-move(s) lack a valid verificationRef. The whole batch was atomic; no todos were moved.`,
                        code: 'TODO_DONE_UNVERIFIED',
                        blocked,
                    }
                }

                const result = moveBatch({ items })

                // Log each successful done move with its ref so postmortem can correlate.
                const refByIdentifier = new Map<string, VerificationRef>()
                for (const it of items) {
                    if (it.targetStatus === 'done' && it.verificationRef) {
                        refByIdentifier.set(
                            String(it.identifier),
                            it.verificationRef
                        )
                    }
                }
                for (const t of result.moved) {
                    if (t.status === 'done') {
                        const ref =
                            refByIdentifier.get(String(t.index)) ??
                            refByIdentifier.get(t.slug)
                        if (ref) {
                            appendLedger('todo-moved-to-done', {
                                slug: t.slug,
                                title: t.title,
                                verificationRef: ref,
                            })
                        }
                    }
                }

                return {
                    moved: result.moved.map(
                        (t) => `#${t.index} ${t.title} → ${t.status}`
                    ),
                    movedCount: result.moved.length,
                    missing: result.missing.map((id) => String(id)),
                    missingCount: result.missing.length,
                }
            }
            case 'read': {
                if (identifier === undefined)
                    return { error: 'identifier is required for read' }
                const result = readTodoContent({ identifier })
                if (!result) return { error: `Todo not found: ${identifier}` }
                return {
                    slug: result.todo.slug,
                    title: result.todo.title,
                    status: result.todo.status,
                    content: result.content,
                }
            }
            case 'remove': {
                if (identifier === undefined)
                    return { error: 'identifier is required for remove' }
                const removed = removeTodo({ identifier })
                return removed
                    ? { removed: `${identifier}` }
                    : { error: `Todo not found: ${identifier}` }
            }
            case 'assign-batch': {
                if (!indices?.length)
                    return {
                        error: 'indices array is required for assign-batch',
                    }
                const assigned = assignBatch({ indices })
                return {
                    assigned: assigned.map((t) => `#${t.index}: ${t.title}`),
                    count: assigned.length,
                }
            }
            default:
                return { error: `Unknown action: ${action}` }
        }
    },
})
