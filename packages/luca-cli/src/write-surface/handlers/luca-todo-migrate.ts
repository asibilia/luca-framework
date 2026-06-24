import {
    TODO_BACKLOG_ROOT_CONCEPT,
    TODO_BACKLOG_ROOT_CONTENT,
    TODO_CONCEPT_PREFIX,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import {
    buildMuninnProcedure,
    ROOT_ID_PLACEHOLDER,
} from '../helpers/build-muninn-instruction.ts'
import { resolveBacklogRoot } from '../helpers/resolve-backlog-root.ts'

const inputSchema = z.object({
    limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(200)
        .describe(
            'Max legacy flat todos to pull per recall pass (range 1–200, ' +
                'default 200 = the recall ceiling). Re-run migration to drain ' +
                'a backlog larger than one pass.'
        ),
})

/**
 * One-shot migration that pulls **legacy flat `todo:<id>` engrams** under
 * the backlog-root tree, so the tree-native `luca_todo_list` enumerates
 * them.
 *
 * Background: before the tree-backed backlog, each todo was a standalone
 * `muninn_remember(concept = "todo:<id>")` engram with no parent. The new
 * list walks the backlog-root subtree (`muninn_recall_tree`), so those
 * orphans are invisible until re-homed. Migration re-adds each one as a
 * proper `add_child` of the root (which wires the `is_part_of` edge and an
 * ordinal so it shows up in `recall_tree`) and forgets the unparented
 * original — no active duplicate. A plain `muninn_link` was rejected
 * because a link without an ordinal is not reliably returned by
 * `recall_tree`.
 *
 * BEST-EFFORT BY DESIGN: MuninnDB exposes no concept/prefix scan, so
 * enumerating the legacy flat set relies on semantic `muninn_recall`,
 * which can miss the long tail in a large vault (and may be weak/empty if
 * the vault has no embedder configured). The emitted instruction is
 * explicit about this and recommends re-running. Todos created via
 * `luca_todo_add` are tree-native from the start and never need migration.
 */
export const lucaTodoMigrateTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_todo_migrate',
        description:
            'Migrate legacy flat todo:<id> engrams under the backlog-root tree so they appear in `luca todo list`. Returns a procedure that ensures the root exists, best-effort recalls flat todos, then re-adds each as an add_child of the root and forgets the unparented original (no duplicates). BEST-EFFORT: semantic recall may miss the tail in large vaults; re-run. Phase-agnostic.',
        inputSchema,
        async handler(args, ctx) {
            const { vault, rootId } = await resolveBacklogRoot({ cwd: ctx.cwd })

            const recallFlatStep = {
                tool: 'mcp__muninn__muninn_recall',
                args: {
                    vault,
                    context: [TODO_CONCEPT_PREFIX],
                    mode: 'deep',
                    threshold: 0.01,
                    limit: args.limit,
                },
                description:
                    'Best-effort enumeration of legacy flat todo: engrams ' +
                    '(semantic — may miss the tail in a large vault or return ' +
                    'little if the vault has no embedder; that is expected).',
            }

            const loopInstruction =
                'For EACH result from the recall step whose concept starts ' +
                `with "${TODO_CONCEPT_PREFIX}" (and is not the backlog root) ` +
                'and whose content parses as a valid Todo, and whose ' +
                'content.id is NOT already a child of the root: call ' +
                'mcp__muninn__muninn_add_child({ vault, parent_id: <rootId>, ' +
                'concept: "todo:"+content.id, content: <that todo JSON>, type: ' +
                '"task" }), then mcp__muninn__muninn_forget({ vault, id: <that ' +
                "flat engram's id> }) to remove the unparented original. Dedupe " +
                'by content.id. BEST-EFFORT: semantic recall cannot guarantee ' +
                'every legacy todo in a large vault, so re-run this command ' +
                'until a pass migrates nothing new. New todos from `luca todo ' +
                "add` are tree-native already. Parse each step's args via " +
                'JSON.parse(argsJson).'

            // Bootstrap path: create the root and persist it, then migrate
            // into the fresh tree (no existing children to dedupe against).
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
                                'Create the backlog-root container (none ' +
                                'configured for this vault yet). Capture the ' +
                                'returned root_id.',
                        },
                        recallFlatStep,
                    ],
                    instructionForAgent:
                        'Migrate legacy flat todos under a NEW backlog root. ' +
                        'Run step 1 to create the root, capture its root_id, ' +
                        'and run the shell command `luca todo set-root --id ' +
                        '<root_id>` to persist it. Run step 2 to recall flat ' +
                        `todos. Then, using that root_id as <rootId>: ` +
                        `${loopInstruction} (No existing children to dedupe ` +
                        'against on a fresh root.) Substitute ' +
                        `${ROOT_ID_PLACEHOLDER} with the created root_id.`,
                })
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(procedure, null, 2),
                        },
                    ],
                }
            }

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
                            'Enumerate the backlog children already under the ' +
                            'root (their content.ids are the dedupe set — do ' +
                            'not re-migrate these).',
                    },
                    recallFlatStep,
                ],
                instructionForAgent:
                    'Migrate legacy flat todos under the existing backlog root ' +
                    `(root_id is already filled in as ${rootId}). Step 1 lists ` +
                    'the children already under the root; treat their content.ids ' +
                    'as the dedupe set. Step 2 best-effort recalls flat todos. ' +
                    `Using ${rootId} as <rootId>: ${loopInstruction}`,
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
