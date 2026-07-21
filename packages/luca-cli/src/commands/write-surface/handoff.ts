/**
 * CLI command group: `luca handoff`
 *
 * The cross-repo handoff mailbox at `~/.luca/handoff/`. That directory sits
 * inside a `HOME_DENIED_SUBDIRS` entry, so agent `Write`/`Edit` calls into it
 * are always denied — this command group is the ONLY sanctioned way to put a
 * schema-validated envelope there, exactly as `luca state` is the only way to
 * mutate `.luca/state.json`.
 *
 * Leaves:
 *   - `handoff send --file <p>`     — post a new envelope (write)
 *   - `handoff list`                — list envelopes addressed to this repo (read)
 *   - `handoff accept --id <id>`    — pending -> accepted (write)
 *   - `handoff complete --id <id> --file <p>` — -> complete, result attached (write)
 *   - `handoff reject --id <id>`    — -> rejected (write)
 *
 * There is deliberately NO `--homedir` flag: the mailbox root is a
 * `ToolContext` test seam, not caller-controllable input, so an agent cannot
 * redirect the mailbox to a path of its choosing.
 */
import { defineCommand } from 'citty'

import {
    readJsonPayload,
    rejectUnknownFlags,
    runWriteHandler,
} from './__helpers/run-handler.ts'

import {
    lucaHandoffAcceptTool,
    lucaHandoffCompleteTool,
    lucaHandoffListTool,
    lucaHandoffRejectTool,
    lucaHandoffSendTool,
} from '../../write-surface/index.ts'

/** Shared `--expected-updated-at` flag description (CAS override). */
const EXPECTED_UPDATED_AT_DESCRIPTION =
    'Optional compare-and-set token. Defaults to the updatedAt read from ' +
    'the envelope immediately before the write; pass it explicitly only if ' +
    'you read the envelope earlier and want the stronger guard.'

const sendCommand = defineCommand({
    meta: {
        name: 'send',
        description:
            'Post a cross-repo handoff envelope into ~/.luca/handoff/. The ' +
            'payload supplies target/intent/acceptanceCriteria/context/' +
            'callback only — id, status, statusHistory and result are ' +
            'stamped by the CLI and any caller-supplied values are ignored.',
    },
    args: {
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON payload: { target: { repoPath, repoName? }, ' +
                'intent, acceptanceCriteria?, context?, callback? }. Write it ' +
                'to .luca/tmp/<kebab-name>.json.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('handoff send', cmd, rawArgs)
        const payload = await readJsonPayload('handoff send', args.file)
        await runWriteHandler('handoff send', lucaHandoffSendTool, payload)
    },
})

const listCommand = defineCommand({
    meta: {
        name: 'list',
        description:
            'List handoff envelopes from ~/.luca/handoff/. Defaults to ' +
            'envelopes addressed to the current repo. Pure read; allowed in ' +
            'every pipelineStep.',
    },
    args: {
        status: {
            type: 'string',
            description:
                'Restrict to one lifecycle status (pending, accepted, ' +
                'in-progress, complete, rejected, failed, cancelled).',
        },
        'target-repo': {
            type: 'string',
            description:
                'Absolute repo path to list envelopes for. Defaults to the ' +
                'current repo. Mutually exclusive with --all-targets.',
        },
        'all-targets': {
            type: 'boolean',
            description:
                'List envelopes addressed to every repo on this machine. ' +
                'Mutually exclusive with --target-repo.',
        },
        json: {
            type: 'boolean',
            description: 'Emit the annotated envelope array as JSON.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('handoff list', cmd, rawArgs)
        await runWriteHandler('handoff list', lucaHandoffListTool, {
            ...(args.status === undefined ? {} : { status: args.status }),
            ...(args['target-repo'] === undefined
                ? {}
                : { targetRepo: args['target-repo'] }),
            allTargets: Boolean(args['all-targets']),
            json: Boolean(args.json),
        })
    },
})

const acceptCommand = defineCommand({
    meta: {
        name: 'accept',
        description:
            'Accept a pending handoff envelope (pending -> accepted). A ' +
            'bare accept is explicit human acceptance; --auto is refused ' +
            'unless the origin repo is listed in this repo ' +
            'handoff.autoAcceptFrom allowlist.',
    },
    args: {
        id: {
            type: 'string',
            required: true,
            description: 'Envelope id, as shown by `luca handoff list`.',
        },
        auto: {
            type: 'boolean',
            description:
                'Unattended acceptance via the handoff.autoAcceptFrom ' +
                'allowlist. An absent or empty allowlist denies everything.',
        },
        'expected-updated-at': {
            type: 'string',
            description: EXPECTED_UPDATED_AT_DESCRIPTION,
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('handoff accept', cmd, rawArgs)
        await runWriteHandler('handoff accept', lucaHandoffAcceptTool, {
            id: args.id,
            auto: Boolean(args.auto),
            ...(args['expected-updated-at'] === undefined
                ? {}
                : { expectedUpdatedAt: args['expected-updated-at'] }),
        })
    },
})

const completeCommand = defineCommand({
    meta: {
        name: 'complete',
        description:
            'Complete a handoff envelope, attaching the result payload. ' +
            'Drives accepted -> in-progress -> complete; the payload is ' +
            'validated before the first hop, so an invalid result can never ' +
            'strand the envelope.',
    },
    args: {
        id: {
            type: 'string',
            required: true,
            description: 'Envelope id, as shown by `luca handoff list`.',
        },
        file: {
            type: 'string',
            required: true,
            description:
                'Path to a JSON result payload: { outcome: ' +
                '"success"|"partial"|"failure", phaseSlug, notes?, ' +
                'evidence? }. Write it to .luca/tmp/<kebab-name>.json.',
        },
        'expected-updated-at': {
            type: 'string',
            description: EXPECTED_UPDATED_AT_DESCRIPTION,
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('handoff complete', cmd, rawArgs)
        const payload = await readJsonPayload('handoff complete', args.file)
        // Same FLAT shape as `send`: the payload's own keys sit at the top
        // level, and the handler's schema is the allowlist. `id` AND
        // `expectedUpdatedAt` are spread AFTER the payload so a payload key
        // can never shadow either flag — `expectedUpdatedAt` is set
        // unconditionally (to `undefined` when the flag is absent) because a
        // payload-supplied CAS token is caller data masquerading as a flag,
        // and the docstring promises the flag is the only source.
        await runWriteHandler('handoff complete', lucaHandoffCompleteTool, {
            ...(typeof payload === 'object' && payload !== null ? payload : {}),
            id: args.id,
            expectedUpdatedAt: args['expected-updated-at'],
        })
    },
})

const rejectCommand = defineCommand({
    meta: {
        name: 'reject',
        description:
            'Reject a handoff envelope (pending|accepted -> rejected), ' +
            'optionally recording a reason. Terminal — a rejected envelope ' +
            'has no outgoing transition.',
    },
    args: {
        id: {
            type: 'string',
            required: true,
            description: 'Envelope id, as shown by `luca handoff list`.',
        },
        reason: {
            type: 'string',
            description:
                'Optional decline reason, stored verbatim as the ' +
                'statusHistory note.',
        },
        'expected-updated-at': {
            type: 'string',
            description: EXPECTED_UPDATED_AT_DESCRIPTION,
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('handoff reject', cmd, rawArgs)
        await runWriteHandler('handoff reject', lucaHandoffRejectTool, {
            id: args.id,
            ...(args.reason === undefined ? {} : { reason: args.reason }),
            ...(args['expected-updated-at'] === undefined
                ? {}
                : { expectedUpdatedAt: args['expected-updated-at'] }),
        })
    },
})

export const handoffCommand = defineCommand({
    meta: {
        name: 'handoff',
        description: 'Send and triage cross-repo handoff envelopes',
    },
    subCommands: {
        send: sendCommand,
        list: listCommand,
        accept: acceptCommand,
        complete: completeCommand,
        reject: rejectCommand,
    },
})
