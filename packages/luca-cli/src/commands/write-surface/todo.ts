/**
 * CLI command group: `luca todo`
 *
 * Backlog management. Todos live in MuninnDB — these handlers validate
 * the shape and emit a `muninn_*` instruction for the agent to execute
 * (delegation pattern; the CLI cannot call other MCP servers). Part of
 * the v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `todo add`    — create a todo (emits a muninn_remember instruction)
 *   - `todo list`   — list todos (emits a muninn_recall instruction)
 *   - `todo update` — update a todo (emits a muninn_remember instruction)
 */
import { defineCommand } from 'citty'

import {
    lucaTodoAddTool,
    lucaTodoListTool,
    lucaTodoUpdateTool,
} from '../../write-surface/index.ts'
import { readJsonPayload, runWriteHandler } from './__helpers/run-handler.ts'

const addCommand = defineCommand({
    meta: {
        name: 'add',
        description:
            'Create a new todo in MuninnDB. Validates the shape and emits ' +
            'a muninn_remember instruction for the agent to execute. ' +
            'Concept: todo:<id> in the repo vault. Phase-agnostic.',
    },
    args: {
        title: {
            type: 'string',
            required: true,
            description:
                'Short imperative description of the todo. Used to derive ' +
                'the id when --id is omitted.',
        },
        body: {
            type: 'string',
            description:
                'Optional longer markdown body — context, acceptance ' +
                'criteria, references.',
        },
        status: {
            type: 'string',
            default: 'pending',
            description:
                'Initial status: "pending" or "backlog" (default ' +
                'pending). Promotion to "done" happens via `todo update`.',
        },
        source: {
            type: 'string',
            description:
                'Where the todo originated — e.g. "gh-issue-#42", ' +
                '"phase-research", "manual".',
        },
        id: {
            type: 'string',
            description:
                'Optional explicit id (kebab-case). Derived from the ' +
                'title when omitted.',
        },
        'metadata-file': {
            type: 'string',
            description:
                'Optional path to a JSON file of arbitrary structured ' +
                'fields to store alongside the todo.',
        },
    },
    async run({ args }) {
        const metadata = args['metadata-file']
            ? await readJsonPayload('todo add', args['metadata-file'])
            : undefined
        await runWriteHandler('todo add', lucaTodoAddTool, {
            title: args.title,
            body: args.body,
            status: args.status,
            source: args.source,
            id: args.id,
            metadata,
        })
    },
})

const listCommand = defineCommand({
    meta: {
        name: 'list',
        description:
            'List todos from MuninnDB. Emits a muninn_recall instruction ' +
            'with context ["todo:"] in the repo vault. Phase-agnostic.',
    },
    args: {
        status: {
            type: 'string',
            description:
                'Optional status filter (pending, backlog, done, ...). ' +
                'Applied by the agent post-recall.',
        },
        limit: {
            type: 'string',
            default: '50',
            description: 'Max todos to recall (range 1-200, default 50).',
        },
    },
    async run({ args }) {
        await runWriteHandler('todo list', lucaTodoListTool, {
            status: args.status,
            limit: Number(args.limit),
        })
    },
})

const updateCommand = defineCommand({
    meta: {
        name: 'update',
        description:
            'Update an existing todo. Validates the new shape, enforces ' +
            'the verification-ref guard when promoting to "done", and ' +
            'emits a muninn_remember instruction. Phase-agnostic.',
    },
    args: {
        id: {
            type: 'string',
            required: true,
            description:
                'Existing todo id (kebab-case). Used as the muninn ' +
                'concept suffix: todo:<id>.',
        },
        title: {
            type: 'string',
            required: true,
            description:
                'Full title of the todo. Pass the existing title ' +
                'unchanged unless renaming.',
        },
        status: {
            type: 'string',
            required: true,
            description:
                'New status. Promoting to "done" requires ' +
                '--verification-criterion pointing at a met PASS criterion.',
        },
        body: {
            type: 'string',
            description: 'Optional updated markdown body.',
        },
        source: {
            type: 'string',
            description: 'Optional updated origin label.',
        },
        'verification-criterion': {
            type: 'string',
            description:
                'Required when --status=done. A criterionId (e.g. ' +
                '"ac-03") in the active phase\'s verify.json that is ' +
                'met=true with non-empty evidence and parent status=PASS.',
        },
        'metadata-file': {
            type: 'string',
            description:
                'Optional path to a JSON file of arbitrary structured ' +
                'fields to store alongside the todo.',
        },
    },
    async run({ args }) {
        const metadata = args['metadata-file']
            ? await readJsonPayload('todo update', args['metadata-file'])
            : undefined
        const verificationRef = args['verification-criterion']
            ? { criterionId: args['verification-criterion'] }
            : undefined
        await runWriteHandler('todo update', lucaTodoUpdateTool, {
            id: args.id,
            title: args.title,
            status: args.status,
            body: args.body,
            source: args.source,
            metadata,
            verificationRef,
        })
    },
})

export const todoCommand = defineCommand({
    meta: {
        name: 'todo',
        description: 'Manage the Luca development backlog (MuninnDB todos)',
    },
    subCommands: {
        add: addCommand,
        list: listCommand,
        update: updateCommand,
    },
})
