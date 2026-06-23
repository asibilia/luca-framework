import {
    slugFromTitle,
    TODO_BACKLOG_ROOT_CONCEPT,
    TODO_BACKLOG_ROOT_CONTENT,
    TodoAreaSchema,
    TodoIdSchema,
    TodoPriority,
    TodoSchema,
    stringifyError,
    todoConceptFor,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    buildMuninnProcedure,
    ROOT_ID_PLACEHOLDER,
} from '../helpers/build-muninn-instruction.ts'
import { resolveBacklogRoot } from '../helpers/resolve-backlog-root.ts'

const inputSchema = z.object({
    title: z
        .string()
        .min(1)
        .max(200)
        .describe(
            'Short imperative description of the todo. Used to derive the id when one is not supplied.'
        ),
    body: z
        .string()
        .max(8192)
        .optional()
        .describe(
            'Optional longer markdown body — context, acceptance criteria, references.'
        ),
    /**
     * Only pending and backlog are allowed at create time. Promoting
     * to `done` happens via luca_todo_update with a verificationRef
     * that points at a met criterion in verify.json.
     */
    status: z.enum(['pending', 'backlog']).default('pending'),
    priority: TodoPriority.optional().describe(
        'Optional triage priority: low | medium | high | critical.'
    ),
    area: TodoAreaSchema.optional().describe(
        'Optional kebab-case area/component tag (e.g. "cli", "mcp-server"); max 60 chars.'
    ),
    source: z
        .string()
        .max(120)
        .optional()
        .describe(
            'Where this todo originated — e.g. "gh-issue-#42", "phase-research", "manual".'
        ),
    metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            'Arbitrary structured fields the caller wants to record alongside the todo.'
        ),
    id: TodoIdSchema.optional().describe(
        'Optional explicit id (kebab-case). When omitted, derived from the title.'
    ),
})

/**
 * Create a new todo. The luca server validates the shape and emits a
 * multi-step `muninn_*` procedure for the agent to execute — todos live
 * in MuninnDB (delegation pattern; the luca MCP server cannot call other
 * MCP servers directly).
 *
 * Storage model: the backlog is a MuninnDB tree. A single reserved root
 * engram ({@link TODO_BACKLOG_ROOT_CONCEPT}) holds every todo as an
 * `is_part_of` child (concept `todo:<id>`). The root is resolved by its
 * CACHED ULID (`.luca/config.json#muninn.todoBacklog`), never by concept —
 * MuninnDB has no concept lookup. Fast path (root cached): a single
 * `muninn_add_child` under the root. Bootstrap path (first todo for a
 * vault): `muninn_remember_tree` to create the root, then the agent runs
 * `luca todo set-root --id <root_id>` to persist it, then `add_child`.
 * Listing later enumerates the subtree with `muninn_recall_tree` — a
 * structural walk that returns every todo regardless of vault size, fixing
 * the semantic-recall miss.
 *
 * Status lives inside the JSON-stringified content body. Transitions go
 * through `luca_todo_update`, which REPLACES the node (add_child + forget),
 * not `muninn_evolve` (evolve orphans tree members).
 */
export const lucaTodoAddTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_todo_add',
    description:
        'Create a new todo. Validates inputs server-side and returns a muninn procedure for the agent to execute (delegation pattern — todos persist as is_part_of children of the backlog-root tree under concept "todo:<id>"). Fast path: a single muninn_add_child under the cached backlog root. Bootstrap (first todo per vault): muninn_remember_tree + `luca todo set-root` + muninn_add_child. The root is resolved by cached ULID (.luca/config.json#muninn.todoBacklog), never by concept. Status defaults to pending; promotion to "done" goes through luca_todo_update.',
    inputSchema,
    async handler(args, ctx) {
        const { vault, rootId } = await resolveBacklogRoot({ cwd: ctx.cwd })

        let id: string
        try {
            id = args.id ?? slugFromTitle(args.title)
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text',
                        text: stringifyError(err),
                    },
                ],
                isError: true,
            }
        }

        const todo = TodoSchema.parse({
            schemaVersion: 1 as const,
            id,
            title: args.title,
            ...(args.body !== undefined ? { body: args.body } : {}),
            status: args.status,
            ...(args.priority !== undefined
                ? { priority: args.priority }
                : {}),
            ...(args.area !== undefined ? { area: args.area } : {}),
            ...(args.source !== undefined ? { source: args.source } : {}),
            ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
            updatedAt: new Date().toISOString(),
        })

        // `id` is a kebab-case slug (TodoIdSchema charset a-z0-9-), so it is
        // safe to interpolate into descriptions. The free-form title/body
        // live ONLY inside the add_child step's argsJson (behind JSON.parse).
        const addChildStep = {
            tool: 'mcp__muninn__muninn_add_child',
            args: {
                vault,
                parent_id: rootId ?? ROOT_ID_PLACEHOLDER,
                concept: todoConceptFor(id),
                content: JSON.stringify(todo),
                type: 'task',
            },
            description:
                `Append todo "${id}" (status=${todo.status}) as a child of ` +
                'the backlog root.',
        }

        // Fast path: backlog root already cached for this vault → a single
        // deterministic add_child with the real parent_id baked in.
        if (rootId) {
            const procedure = buildMuninnProcedure({
                steps: [addChildStep],
                instructionForAgent:
                    'Persist a new todo to the MuninnDB backlog (delegation ' +
                    'pattern). Run the single step: it appends the todo as a ' +
                    'child of the backlog root (parent_id is already filled ' +
                    "in). Parse the step's args via JSON.parse(argsJson); the " +
                    'todo title/body live only inside that argsJson.',
            })
            return {
                content: [
                    { type: 'text', text: JSON.stringify(procedure, null, 2) },
                ],
            }
        }

        // Bootstrap path: no backlog root configured for this vault yet.
        // Create it, persist its id locally via `luca todo set-root`, then
        // append the todo. The set-root call is what makes every FUTURE add
        // a single deterministic step.
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
                        'Create the backlog-root container (no root is ' +
                        'configured for this vault yet). Capture the returned ' +
                        'root_id.',
                },
                addChildStep,
            ],
            instructionForAgent:
                'Persist a new todo to the MuninnDB backlog (delegation ' +
                'pattern, first-time bootstrap — no backlog root is configured ' +
                'for this vault yet). Run step 1 to create the backlog root and ' +
                'capture its root_id. Then IMMEDIATELY persist it by running ' +
                'the shell command `luca todo set-root --id <root_id>` so all ' +
                'future todo commands resolve the root deterministically. Then ' +
                `run step 2, substituting ${ROOT_ID_PLACEHOLDER} with that ` +
                "root_id. Parse each step's args via JSON.parse(argsJson); the " +
                'todo title/body live only inside step 2 argsJson.',
        })

        return {
            content: [
                { type: 'text', text: JSON.stringify(procedure, null, 2) },
            ],
        }
    },
}
