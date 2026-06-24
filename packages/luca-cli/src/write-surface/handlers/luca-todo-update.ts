import {
    TODO_BACKLOG_ROOT_CONCEPT,
    TODO_BACKLOG_ROOT_CONTENT,
    TodoAreaSchema,
    TodoIdSchema,
    TodoPriority,
    TodoSchema,
    TodoStatus,
    todoConceptFor,
    VerificationRefSchema,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    buildMuninnProcedure,
    ROOT_ID_PLACEHOLDER,
    TODO_ENGRAM_ID_PLACEHOLDER,
} from '../helpers/build-muninn-instruction.ts'
import { resolveBacklogRoot } from '../helpers/resolve-backlog-root.ts'
import { validateVerificationRef } from '../helpers/validate-verification-ref.ts'

const inputSchema = z.object({
    id: TodoIdSchema.describe(
        'Existing todo id (kebab-case). Used as the muninn concept suffix: todo:<id>.'
    ),
    title: z
        .string()
        .min(1)
        .max(200)
        .describe(
            'Full title of the todo. Pass the existing title unchanged unless renaming.'
        ),
    body: z
        .string()
        .max(8192)
        .optional()
        .describe(
            'Optional longer markdown body — context, acceptance criteria, references (dropped if omitted).'
        ),
    status: TodoStatus.describe(
        'New status. Promoting to "done" requires verificationRef pointing at a met PASS criterion in the active phase\'s verify.json.'
    ),
    priority: TodoPriority.optional().describe(
        'Optional triage priority: low | medium | high | critical (dropped if omitted).'
    ),
    area: TodoAreaSchema.optional().describe(
        'Optional kebab-case area/component tag (e.g. "cli", "mcp-server"); max 60 chars (dropped if omitted).'
    ),
    source: z
        .string()
        .max(120)
        .optional()
        .describe(
            'Where this todo originated — e.g. "gh-issue-#42", "phase-research", "manual" (dropped if omitted).'
        ),
    metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            'Arbitrary structured fields recorded alongside the todo (dropped if omitted).'
        ),
    verificationRef: VerificationRefSchema.optional().describe(
        'Required when status === "done". Points at a criterionId in the active phase\'s verify.json that is met=true with non-empty evidence and parent status=PASS.'
    ),
})

/**
 * Update a todo by REPLACE. Validates the new shape, enforces the
 * verification-ref guard when transitioning to `done`, and returns a
 * multi-step `muninn_*` procedure the agent executes.
 *
 * Mechanism (NOT `muninn_evolve` — see below): resolve the backlog root by
 * its CACHED ULID (`.luca/config.json#muninn.todoBacklog`, never by concept
 * — MuninnDB has no concept lookup), `muninn_recall_tree` to locate the
 * existing child by its `todo:<id>` concept, `muninn_add_child` the new
 * version, then `muninn_forget` the old. The fresh child keeps concept
 * `todo:<id>` and stays under the root; the old is soft-deleted so there is
 * no active duplicate.
 *
 * Why not `muninn_evolve`: evolve was empirically found (and re-confirmed)
 * to orphan the new version from its `is_part_of` parent — it soft-deletes
 * the old node and mints a NEW ULID with an empty concept that is NOT a
 * child of the root, so it drops out of `recall_tree` enumeration. The docs
 * and the MCP server's own guidance recommend evolve for flat memories, but
 * for a TREE member it breaks membership; add_child+forget is the
 * deterministic, synchronous replacement (it does not rely on async
 * re-linking). Do NOT "simplify" this back to evolve.
 *
 * The verification-ref guard reads the active phase's verify.json
 * server-side and refuses to emit the procedure unless the criterion is
 * met, has evidence, and the overall verification status is PASS. This
 * preserves the safety property from the legacy manageTodos tool: an agent
 * cannot mark work "done" without machine-checkable evidence.
 */
export const lucaTodoUpdateTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_todo_update',
    description:
        'Update a todo\'s state by REPLACE. Returns a multi-step muninn procedure the agent executes (delegation pattern): resolve the backlog root by its cached ULID, muninn_recall_tree to locate the existing child, muninn_add_child the new version, then muninn_forget the old (NOT muninn_evolve, which orphans tree members; NOT muninn_remember, which dedups by content and duplicates). Update is full-replace — omitted optional fields (body, source, metadata, priority, area) are dropped; re-send the full payload. Server-side verification-ref guard: transitioning to status="done" requires a verificationRef pointing at a met PASS criterion in the active phase\'s verify.json.',
    inputSchema,
    async handler(args, ctx) {
        if (args.status === 'done') {
            if (!args.verificationRef) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'luca_todo_update: verificationRef is required when status === "done". Provide { criterionId } pointing at a met PASS criterion in the active phase\'s verify.json.',
                        },
                    ],
                    isError: true,
                }
            }
            const err = await validateVerificationRef({
                cwd: ctx.cwd,
                ref: args.verificationRef,
            })
            if (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `luca_todo_update: ${err.code} — ${err.message}`,
                        },
                    ],
                    isError: true,
                }
            }
        }

        const todo = TodoSchema.parse({
            schemaVersion: 1 as const,
            id: args.id,
            title: args.title,
            ...(args.body !== undefined ? { body: args.body } : {}),
            status: args.status,
            ...(args.priority !== undefined ? { priority: args.priority } : {}),
            ...(args.area !== undefined ? { area: args.area } : {}),
            ...(args.source !== undefined ? { source: args.source } : {}),
            ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
            updatedAt: new Date().toISOString(),
            ...(args.verificationRef !== undefined
                ? { verificationRef: args.verificationRef }
                : {}),
        })

        const { vault, rootId } = await resolveBacklogRoot({ cwd: ctx.cwd })
        const concept = todoConceptFor(args.id)
        const newContent = JSON.stringify(todo)

        // `args.id` is a kebab-case slug (TodoIdSchema), safe to interpolate
        // into step descriptions. The free-form title/body live ONLY inside
        // the add_child step's argsJson (behind JSON.parse).
        //
        // Update is REPLACE, not evolve: muninn_evolve was empirically found
        // to orphan the new version from its is_part_of parent (it would drop
        // out of recall_tree enumeration). So we add a fresh child and forget
        // the old one — the new node keeps concept "todo:<id>" and stays under
        // the root; the old is soft-deleted (no active duplicate).
        const addChildStep = {
            tool: 'mcp__muninn__muninn_add_child',
            args: {
                vault,
                parent_id: rootId ?? ROOT_ID_PLACEHOLDER,
                concept,
                content: newContent,
                type: 'task',
            },
            description:
                `Append the updated todo "${args.id}" (status=${todo.status}) ` +
                'as a fresh child of the backlog root.',
        }

        // Bootstrap path: no backlog root for this vault yet. Treat update as
        // create — make the root, persist it, add the todo. Nothing to forget.
        if (!rootId) {
            const procedure = buildMuninnProcedure({
                steps: [
                    {
                        tool: 'mcp__muninn__muninn_remember_tree',
                        args: {
                            vault,
                            root: {
                                concept: TODO_BACKLOG_ROOT_CONCEPT,
                                content: TODO_BACKLOG_ROOT_CONTENT,
                                type: 'backlog',
                            },
                        },
                        description:
                            'Create the backlog-root container (none configured ' +
                            'for this vault yet). Capture the returned root_id.',
                    },
                    addChildStep,
                ],
                instructionForAgent:
                    'Update a todo, but no backlog root is configured for this ' +
                    'vault yet — so this behaves as a create. Run step 1 to ' +
                    'create the backlog root and capture its root_id, then run ' +
                    'the shell command `luca todo set-root --id <root_id>` to ' +
                    `persist it. Then run step 2, substituting ${ROOT_ID_PLACEHOLDER} ` +
                    "with that root_id. Parse each step's args via " +
                    'JSON.parse(argsJson); the todo body lives only inside the ' +
                    'add_child step argsJson.',
            })
            return {
                content: [
                    { type: 'text', text: JSON.stringify(procedure, null, 2) },
                ],
            }
        }

        // Normal path: root is cached. Enumerate children, add the new
        // version, forget the old one (located by its concept).
        const procedure = buildMuninnProcedure({
            steps: [
                {
                    tool: 'mcp__muninn__muninn_recall_tree',
                    args: {
                        vault,
                        root_id: rootId,
                        include_completed: true,
                        max_depth: 1,
                        limit: 0,
                    },
                    description:
                        'Enumerate the backlog children to locate the existing ' +
                        `engram for todo "${args.id}".`,
                },
                addChildStep,
                {
                    tool: 'mcp__muninn__muninn_forget',
                    args: { vault, id: TODO_ENGRAM_ID_PLACEHOLDER },
                    description:
                        `Soft-delete the OLD engram for todo "${args.id}" so ` +
                        'there is no active duplicate. Substitute ' +
                        `${TODO_ENGRAM_ID_PLACEHOLDER} with its id (see the ` +
                        'instruction). SKIP this step if no existing child ' +
                        'matched (then this update was effectively a create).',
                },
            ],
            instructionForAgent:
                'Update a todo by REPLACE (delegation pattern; muninn_evolve is ' +
                'NOT used because it orphans the node from the backlog tree). ' +
                'Step 1 returns the backlog children (id, concept, state). Find ' +
                `the non-deleted child whose concept === "${concept}" — that is ` +
                `the OLD engram id (<<TODO_ENGRAM_ID>>). Run step 2 to add the ` +
                'updated todo as a fresh child. Then run step 3 to forget the ' +
                'OLD engram id. If NO non-deleted child matched in step 1, skip ' +
                "step 3 (this was effectively a create). Parse each step's args " +
                'via JSON.parse(argsJson); the todo body lives only inside the ' +
                'add_child step argsJson.',
        })

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(procedure, null, 2),
                },
            ],
        }
    },
}
