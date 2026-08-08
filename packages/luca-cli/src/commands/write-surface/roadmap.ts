/**
 * CLI command group: `luca roadmap`
 *
 * Read and replace the roadmap array in `.luca/state.json`. Part of the
 * v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `roadmap read`         — read the roadmap with currentPhase context (read)
 *   - `roadmap create`       — replace the roadmap (idle/triage only)
 *   - `roadmap add-phase`    — append/insert ONE phase (any pipelineStep)
 *   - `roadmap remove-phase` — remove ONE future phase (any pipelineStep)
 *
 * `add-phase`/`remove-phase` are the incremental counterpart to the
 * full-replace `create`. They exist so phase registration is deterministic
 * instead of LLM prose that `mkdir -p`s a directory and hand-edits the
 * GENERATED `.luca/roadmap.md`.
 */
import { defineCommand } from 'citty'

import {
    readJsonPayload,
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

import {
    lucaRoadmapAddPhaseTool,
    lucaRoadmapCreateTool,
    lucaRoadmapReadTool,
    lucaRoadmapRemovePhaseTool,
} from '../../write-surface/index.ts'

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            'Read the roadmap array from .luca/state.json, plus ' +
            'currentPhase and totalPhases for context. Each entry is ' +
            '{ name, deps, status, complexity? }. Pure read; allowed in ' +
            'every pipelineStep.',
    },
    async run({ rawArgs, cmd }) {
        rejectUnknownFlags('roadmap read', cmd, rawArgs)
        await runWriteHandler('roadmap read', lucaRoadmapReadTool, {})
    },
})

const createCommand = defineCommand({
    meta: {
        name: 'create',
        description:
            'Replace the roadmap in .luca/state.json with a new ordered ' +
            'list of phases. Resets currentPhase to 0; updates totalPhases. ' +
            'Only callable in the idle or triage pipelineStep.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON file containing the phases array: ' +
                '[{ name, deps?, status?, complexity? }, ...]. The array ' +
                'may be large, so it is supplied as a file rather than a ' +
                'flag. Defaults applied: deps=[], status=pending.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('roadmap create', cmd, rawArgs)
        const phases = await readJsonPayload('roadmap create', args.file)
        await runWriteHandler('roadmap create', lucaRoadmapCreateTool, {
            phases,
        })
    },
})

const addPhaseCommand = defineCommand({
    meta: {
        name: 'add-phase',
        description:
            'Append (or --after N insert) ONE phase into the roadmap, create ' +
            'its .luca/phases/<NN>-<slug>/ directory, and regenerate the ' +
            'generated .luca/roadmap.md. Prints { nn, slug, dir } so the ' +
            'caller never picks a path. Inserting RENUMBERS every later ' +
            'phase and renames its directory (decimal phase numbers are not ' +
            'valid slugs). Callable in every pipelineStep.',
    },
    args: {
        name: {
            type: 'string',
            required: true,
            description:
                'Prose phase name, e.g. "fix auth". Slugified to ' +
                '<NN>-<kebab-case>; must contain a letter first so the slug ' +
                'starts with a letter (a name like "2fa rollout" is rejected).',
        },
        deps: {
            type: 'string',
            description:
                'Comma-separated names of phases this one depends on.',
        },
        complexity: {
            type: 'string',
            description:
                'Optional complexity hint: TRIVIAL | SIMPLE | MODERATE | ' +
                'COMPLEX | CRITICAL.',
        },
        after: {
            type: 'string',
            description:
                'Insert after this 1-based phase number (0 = insert first). ' +
                'Omit to append at the end.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('roadmap add-phase', cmd, rawArgs)
        const deps =
            typeof args.deps === 'string' && args.deps.length > 0
                ? args.deps
                      .split(',')
                      .map((d) => d.trim())
                      .filter((d) => d.length > 0)
                : []
        await runWriteHandler('roadmap add-phase', lucaRoadmapAddPhaseTool, {
            name: args.name,
            deps,
            // Left undefined when absent so the Zod `.optional()` applies;
            // NaN from a non-numeric flag fails schema validation loudly.
            complexity: args.complexity === undefined ? undefined : args.complexity,
            after: args.after === undefined ? undefined : Number(args.after),
        })
    },
})

const removePhaseCommand = defineCommand({
    meta: {
        name: 'remove-phase',
        description:
            'Remove ONE FUTURE phase (--nn must be greater than the active ' +
            'currentPhase) from the roadmap. It RENUMBERS every later phase ' +
            'and renames their .luca/phases/ directories — it does not leave ' +
            'a gap, because <NN> is derived from the roadmap index. The ' +
            'removed phase directory is deleted only when empty; one holding ' +
            'artifacts is preserved and reported. Regenerates the generated ' +
            '.luca/roadmap.md. Callable in every pipelineStep.',
    },
    args: {
        nn: {
            type: 'string',
            required: true,
            description:
                'The 1-based phase number to remove. Must be > currentPhase.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('roadmap remove-phase', cmd, rawArgs)
        await runWriteHandler(
            'roadmap remove-phase',
            lucaRoadmapRemovePhaseTool,
            { nn: Number(args.nn) }
        )
    },
})

export const roadmapCommand = defineCommand({
    meta: {
        name: 'roadmap',
        description: 'Read, replace, and incrementally edit the Luca roadmap',
    },
    subCommands: {
        read: readCommand,
        create: createCommand,
        'add-phase': addPhaseCommand,
        'remove-phase': removePhaseCommand,
    },
})
