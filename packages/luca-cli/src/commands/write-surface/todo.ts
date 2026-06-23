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
import { TodoPriority } from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

import {
    lucaTodoAddTool,
    lucaTodoListTool,
    lucaTodoMigrateTool,
    lucaTodoSetRootTool,
    lucaTodoUpdateTool,
} from '../../write-surface/index.ts'
import {
    readJsonPayload,
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

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
        priority: {
            type: 'enum',
            options: [...TodoPriority.options],
            description:
                'Optional triage priority: low | medium | high | critical.',
        },
        area: {
            type: 'string',
            description:
                'Optional kebab-case area/component tag (e.g. "cli", ' +
                '"mcp-server"); max 60 chars.',
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
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('todo add', cmd, rawArgs)
        const metadata = args['metadata-file']
            ? await readJsonPayload('todo add', args['metadata-file'])
            : undefined
        await runWriteHandler('todo add', lucaTodoAddTool, {
            title: args.title,
            body: args.body,
            status: args.status,
            priority: args.priority,
            area: args.area,
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
            'List todos from MuninnDB with COMPLETE enumeration. Emits a ' +
            'two-step procedure (find backlog root, then muninn_recall_tree) ' +
            'in the repo vault. Phase-agnostic.',
    },
    args: {
        status: {
            type: 'string',
            description:
                'Optional status filter (pending, backlog, done). Applied ' +
                'by the agent post-enumeration.',
        },
        priority: {
            type: 'enum',
            options: [...TodoPriority.options],
            description:
                'Optional priority filter (low | medium | high | ' +
                'critical). Applied by the agent post-enumeration.',
        },
        area: {
            type: 'string',
            description:
                'Optional area/component filter (e.g. "cli"). Applied by ' +
                'the agent post-enumeration.',
        },
        limit: {
            type: 'string',
            default: '0',
            description:
                'Max todo children per tree level. 0 (default) = no cap, ' +
                'complete enumeration. Positive value truncates.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('todo list', cmd, rawArgs)
        await runWriteHandler('todo list', lucaTodoListTool, {
            status: args.status,
            priority: args.priority,
            area: args.area,
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
            'emits a muninn_remember instruction. Phase-agnostic. ' +
            'Update is full-replace — omitted optional fields (body, ' +
            'source, metadata, priority, area) are dropped; re-send the ' +
            'full payload.',
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
            description:
                'Optional updated markdown body — context, acceptance ' +
                'criteria, references (dropped if omitted).',
        },
        priority: {
            type: 'enum',
            options: [...TodoPriority.options],
            description:
                'Optional triage priority: low | medium | high | ' +
                'critical (dropped if omitted).',
        },
        area: {
            type: 'string',
            description:
                'Optional kebab-case area/component tag (e.g. "cli"); ' +
                'max 60 chars (dropped if omitted).',
        },
        source: {
            type: 'string',
            description:
                'Optional origin label — e.g. "gh-issue-#42", ' +
                '"phase-research", "manual" (dropped if omitted).',
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
                'fields to store alongside the todo (dropped if omitted).',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('todo update', cmd, rawArgs)
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
            priority: args.priority,
            area: args.area,
            source: args.source,
            metadata,
            verificationRef,
        })
    },
})

const migrateCommand = defineCommand({
    meta: {
        name: 'migrate',
        description:
            'Migrate legacy flat todo:<id> engrams under the backlog-root ' +
            'tree so they show up in `todo list`. Emits a best-effort ' +
            'procedure (find/create root, recall flat todos, link each ' +
            'is_part_of the root — no duplicates). Re-run to drain large ' +
            'backlogs. Phase-agnostic.',
    },
    args: {
        limit: {
            type: 'string',
            default: '200',
            description:
                'Max legacy flat todos to pull per recall pass (range ' +
                '1-200, default 200). Re-run migration to drain more.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('todo migrate', cmd, rawArgs)
        await runWriteHandler('todo migrate', lucaTodoMigrateTool, {
            limit: Number(args.limit),
        })
    },
})

const setRootCommand = defineCommand({
    meta: {
        name: 'set-root',
        description:
            'Persist the backlog-root engram ULID (returned by ' +
            'muninn_remember_tree during bootstrap) to ' +
            '.luca/config.json#muninn.todoBacklog for the current vault. ' +
            'Local write — run once so future todo commands resolve the ' +
            'root deterministically. Phase-agnostic.',
    },
    args: {
        id: {
            type: 'string',
            required: true,
            description:
                'The backlog-root engram ULID (the root_id returned by ' +
                'muninn_remember_tree).',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('todo set-root', cmd, rawArgs)
        await runWriteHandler('todo set-root', lucaTodoSetRootTool, {
            id: args.id,
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
        migrate: migrateCommand,
        'set-root': setRootCommand,
    },
})
