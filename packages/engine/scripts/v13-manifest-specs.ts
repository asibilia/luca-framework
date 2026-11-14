/**
 * What `generate-v13-manifest.ts` looks for in each v13 version: the
 * markers of each feature, the settings v13 writes, and the manifest's notes.
 */
import { z } from 'zod'

import type { V13Setting } from '../src/doctor/v13-manifest'

export const PACKAGE_NAME = '@alecsibilia/luca'
export const CLAUDE_HOME = '~/.claude'
export const AGY_HOME = '~/.gemini/antigravity-cli'
export const REPO = '<repo>'
export const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'
export const HOME_PLACEHOLDER = '{home}'
export const TOKEN_VALUE = 'Bearer {muninn_token}'

export type Json = z.infer<ReturnType<typeof z.json>>

/** A literal string, or a pattern, from v13's install code. */
export type Marker = string | RegExp

/** A setting v13 writes, and the markers that show a version writes it. */
export type SettingSpec = Omit<V13Setting, 'versions'> & { markers: Marker[] }

/** The `.gitignore` header lines and entries one version writes. */
export type GitignoreBlock = { header: string[]; entries: string[] }

/** What one version installs. */
export type VersionInstall = {
    version: string
    files: { target: string; sha256: string }[]
    settings: { spec: SettingSpec }[]
    gitignore: GitignoreBlock | null
}

// ─── Markers ────────────────────────────────────────────────────────────────

/** Skills, agents and commands copied into `~/.claude/`. */
export const CLAUDE_ARTIFACT_MARKERS: Marker[] = [
    'async function installSkills(',
    'return join(homedir(), ".claude");',
]

/** Skills and agents (not commands) copied into Antigravity's home. */
export const AGY_ARTIFACT_MARKERS: Marker[] = [
    'return join(homedir(), ".gemini", "antigravity-cli");',
    'installArtifacts: { agents: true, commands: false, skills: true }',
]

/** Hook scripts copied into `<repo>/.claude/hooks/`, wired in its settings. */
export const REPO_HOOK_MARKERS: Marker[] = [
    'async function installHooks(',
    /join(\$\d+)?\(opts\.cwd, "\.claude", "hooks"\)/,
]

/** The status line script (`~/.claude/luca-statusline.ts`) and its setting. */
export const STATUSLINE_MARKERS: Marker[] = [
    'async function installStatusline(',
    'STATUSLINE_SCRIPT_NAME = "luca-statusline.ts"',
    'const command = `bun "${scriptPath}"`',
    'padding: 0',
]

/** The managed `.gitignore` block. */
export const GITIGNORE_MARKERS: Marker[] = [
    'async function ensureLucaGitignore(',
    'const LUCA_GITIGNORE_ENTRIES = [',
    'const header = "',
]

/** The copy functions for skills, agents and commands. */
export const ARTIFACT_COPY_FUNCTIONS = ['copyDir', 'copySkillTree']

// ─── Settings v13 writes ────────────────────────────────────────────────────

export const STATIC_SETTINGS: SettingSpec[] = [
    {
        id: 'claude-stage-gate-hook',
        file: `${CLAUDE_HOME}/settings.json`,
        path: ['hooks', 'PreToolUse'],
        match: {
            kind: 'array_entry_hook_command_contains',
            text: 'stage-gate',
        },
        values: [
            {
                matcher: 'Edit|Write|NotebookEdit|Bash',
                hooks: [
                    {
                        type: 'command',
                        command: 'luca hook stage-gate',
                        timeout: 30,
                    },
                ],
            },
        ],
        action: 'remove',
        note: "The global stage-gate hook, run before every Edit, Write, NotebookEdit and Bash call in every repo. Unwire it first: while v13 is installed it blocks agent writes under ~/.claude/, ~/.luca/ and .git/, and after an upgrade it runs v14's `luca`. Remove the matching entry, then drop `hooks.PreToolUse` and `hooks` if they end up empty. v13 skipped adding it when any PreToolUse command already contained `stage-gate`, and its own doctor used the same test.",
        markers: [
            'STAGE_GATE_COMMAND = "luca hook stage-gate"',
            /STAGE_GATE_MATCHER = "Edit\|Write\|NotebookEdit\|Bash"/,
            'timeout: 30',
        ],
    },
    {
        id: 'claude-status-line',
        file: `${CLAUDE_HOME}/settings.json`,
        path: ['statusLine'],
        match: {
            kind: 'command_equals',
            any_of: [
                `bun "${HOME_PLACEHOLDER}/.claude/luca-statusline.ts"`,
                `bun ${HOME_PLACEHOLDER}/.claude/luca-statusline.ts`,
            ],
        },
        values: [
            {
                type: 'command',
                command: `bun "${HOME_PLACEHOLDER}/.claude/luca-statusline.ts"`,
                padding: 0,
            },
        ],
        action: 'remove',
        note: "Written only when settings.json had no statusLine. v13 counted only these exact commands as its own; a command that wraps the script is the user's, so leave it. Unwire it before moving ~/.claude/luca-statusline.ts.",
        markers: STATUSLINE_MARKERS,
    },
    {
        id: 'antigravity-stage-gate-hook',
        file: `${AGY_HOME}/hooks.json`,
        path: ['luca-stage-gate'],
        match: { kind: 'key_present' },
        values: [
            {
                enabled: true,
                PreToolUse: [
                    {
                        matcher:
                            'replace|write_file|run_shell_command|run_command',
                        hooks: [
                            {
                                type: 'command',
                                command: 'luca hook stage-gate',
                                timeout: 30,
                            },
                        ],
                    },
                ],
            },
        ],
        action: 'remove',
        note: "Antigravity's copy of the stage-gate hook; it runs `luca` too. Written only if ~/.gemini/antigravity-cli/ already existed.",
        markers: [
            'async function wireAntigravityHooks(',
            '"luca-stage-gate"',
            'AGY_STAGE_GATE_MATCHER = "replace|write_file|run_shell_command|run_command"',
        ],
    },
    {
        id: 'antigravity-muninn-mcp',
        file: `${AGY_HOME}/mcp_config.json`,
        path: ['mcpServers', 'muninn'],
        match: { kind: 'key_present' },
        values: [
            {
                serverUrl: MUNINN_MCP_URL,
                headers: { Authorization: TOKEN_VALUE },
                enabledTools: ['*'],
            },
        ],
        action: 'remove',
        note: "Written only when ~/.muninn/mcp.token existed and ~/.gemini/antigravity-cli/ already existed. v13 left an entry alone when it already had this serverUrl, the token and '*' in enabledTools, and otherwise merged into it (kept its other fields and headers, dropped `url`). So the entry may predate v13 or carry extra enabledTools; match on the key, not the exact value. The file holds the literal token: back it up with mode 0600 and never print it.",
        markers: [
            'async function wireAntigravityMcp(',
            'mcp_config.json',
            `MUNINN_MCP_SERVER_URL = "${MUNINN_MCP_URL}"`,
            'enabledTools: ["*"]',
        ],
    },
    {
        id: 'claude-muninn-mcp',
        file: '~/.claude.json',
        path: ['mcpServers', 'muninn'],
        match: { kind: 'key_present' },
        values: [
            {
                type: 'sse',
                url: MUNINN_MCP_URL,
                headers: { Authorization: TOKEN_VALUE },
            },
        ],
        action: 'keep',
        note: 'Not a leftover: v14 reads this entry to reach MuninnDB, and doctor checks it (and re-adds it at user scope) under its MuninnDB check (#450). Listed so the v13-leftovers check never removes it. Written only when ~/.muninn/mcp.token existed. It holds the literal token; never print it.',
        markers: [
            'async function wireClaudeMcp(',
            `MUNINN_MCP_SERVER_URL = "${MUNINN_MCP_URL}"`,
            'type: "sse"',
        ],
    },
    {
        id: 'repo-langsmith-trace-metadata',
        file: `${REPO}/.claude/settings.local.json`,
        path: ['env', 'CC_LANGSMITH_METADATA'],
        match: { kind: 'key_present' },
        values: [
            JSON.stringify({
                environment: 'production',
                ls_message_format: 'anthropic',
                repo: '{repo_name}',
                luca_version: '{luca_version}',
            }),
        ],
        action: 'keep',
        note: 'A JSON string. Written only when LangSmith tracing was on (env.TRACE_TO_LANGSMITH is "true"). v13 owns only its `repo` and `luca_version` keys; `environment` and `ls_message_format` were filled only when missing, and any other key is the user\'s. Harmless to v14: report it, don\'t remove it.',
        markers: [
            'async function enrichTraceMetadata(',
            'CC_LANGSMITH_METADATA',
            'settings.local.json',
        ],
    },
]

export const NOTES = [
    'Generated by packages/engine/scripts/generate-v13-manifest.ts from every published 13.x tarball of @alecsibilia/luca. Do not edit by hand; regenerate with: bun packages/engine/scripts/generate-v13-manifest.ts',
    "`~/` is the user's home folder. `<repo>/` is the root of a repo where v13's `luca init` ran.",
    'v13 copies every file byte for byte (copyFile, no templating), so `sha256` is the hash of the file as shipped and as found on disk. Match leftovers by sha256, never by name alone: v13 overwrote same-named files and many names are generic (grill-me, plan, review, research).',
    'Antigravity targets were written only if ~/.gemini/antigravity-cli/ already existed (13.0.0-alpha.12 on). v13 never copied commands there.',
    'In setting values, `{home}` is the absolute home folder path and `{muninn_token}` is the literal MuninnDB token (a secret: never print it). `{repo_name}` and `{luca_version}` are the repo folder name and the v13 version.',
    'Order for a fix: unwire a setting before moving the file it runs (the repo hook entries before <repo>/.claude/hooks/*.ts, the statusLine before ~/.claude/luca-statusline.ts), and unwire the global stage-gate hook before anything else.',
    'Not fingerprinted (runtime or per-user content): <repo>/.luca/, <repo>/.claude/cache/context-refresher-state.json, <repo>/.env MUNINN_DB_API_KEY, ~/.luca/, /tmp/luca-*.json. See issue #445.',
]

// ─── Small helpers ──────────────────────────────────────────────────────────
