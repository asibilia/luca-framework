import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { buildMuninnProcedure } from '../helpers/build-muninn-instruction.ts'
import { resolveBrainRoot } from '../helpers/resolve-brain-root.ts'

const BrainConceptSchema = z
    .string()
    .regex(/^brain:[a-z0-9](?:[a-z0-9:-]*[a-z0-9])?$/, {
        message:
            'must be a brain tree concept like "brain:project-identity"',
    })

const inputSchema = z.object({
    concept: BrainConceptSchema.describe(
        'The brain tree root concept to recall (e.g. ' +
            '"brain:project-identity" or "brain:project-requirements").'
    ),
})

/**
 * Recall a `brain:*` tree by its CACHED root ULID.
 *
 * Replaces the framework-wide broken pattern
 * `muninn_recall_tree(id="brain:project-identity")` — `recall_tree` requires
 * a ULID and rejects a concept ("parse ulid: bad data size"), so every
 * reader that passed the concept errored. This resolves the cached ULID
 * (`.luca/config.json#muninn.brainRoots`, written by `luca brain set-root`
 * at creation) for the current repo vault and emits a single deterministic
 * `muninn_recall_tree` procedure with the real id baked in.
 *
 * When no root is cached for the vault the brain tree is uninitialized and a
 * plain notice is returned instead of a doomed query — readers should treat
 * that as "no project identity seeded; run /project-new or /seed-memory".
 */
export const lucaBrainRecallRootTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_brain_recall_root',
    description:
        'Recall a brain:* tree (e.g. brain:project-identity) by its cached root ULID. Resolves .luca/config.json#muninn.brainRoots[<concept>] for the current vault and emits a muninn_recall_tree procedure with the real id baked in — replacing the broken recall_tree(id="brain:project-identity") (recall_tree rejects a concept). Uninitialized → a plain notice. Phase-agnostic.',
    inputSchema,
    async handler(args, ctx) {
        const { vault, rootId } = await resolveBrainRoot({
            cwd: ctx.cwd,
            concept: args.concept,
        })

        if (!rootId) {
            return {
                content: [
                    {
                        type: 'text',
                        text:
                            `No "${args.concept}" tree cached for vault ` +
                            `"${vault}" (brain not initialized). Seed it with ` +
                            '`/project-new` or `/seed-memory` — those create ' +
                            'the tree and run `luca brain set-root` to register ' +
                            'its root id.',
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
                    },
                    description:
                        `Load the ${args.concept} tree by its cached root ` +
                        'ULID (deterministic; recall_tree requires a ULID, not ' +
                        'a concept). The root_id is already filled in.',
                },
            ],
            instructionForAgent:
                `Load the ${args.concept} tree from MuninnDB. Run the step: ` +
                'it returns the tree rooted at the cached id. recall_tree ' +
                'returns node structure (id/concept/state) but NOT content — ' +
                'muninn_read the nodes whose content you need. Parse the ' +
                "step's args via JSON.parse(argsJson).",
        })

        return {
            content: [
                { type: 'text', text: JSON.stringify(procedure, null, 2) },
            ],
        }
    },
}
