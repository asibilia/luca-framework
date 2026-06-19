export interface MuninnInstructionInput {
    /** Fully-qualified MCP tool name, e.g. "mcp__muninn__muninn_remember". */
    tool: string
    /** Argument object — gets JSON-stringified into argsJson. */
    args: Record<string, unknown>
    /**
     * Short human-friendly description of WHAT this instruction
     * accomplishes. Surfaces in the instructionForAgent text so the
     * agent has context without parsing the args.
     */
    description: string
}

export interface MuninnInstruction {
    /** Fully-qualified MCP tool name to call. */
    tool: string
    /**
     * Pre-stringified JSON blob of arguments. The agent should
     * JSON.parse(argsJson) and pass the result to the tool. This is the
     * single-input-blob pattern that defangs prompt injection from
     * free-form string fields (see
     * review-finding:tool-instruction-prompt-injection-via-string-interpolation
     * in MuninnDB).
     */
    argsJson: string
    /**
     * The human-readable instruction the agent should follow. Contains
     * the tool name + description + a literal directive to JSON.parse
     * argsJson. Does NOT interpolate free-form fields — those live
     * inside argsJson only.
     */
    instructionForAgent: string
}

/**
 * Build a delegation instruction telling the agent to call a MuninnDB
 * MCP tool with a specific JSON-encoded argument blob.
 *
 * The luca MCP server cannot directly invoke other MCP servers, so
 * luca_todo_* tools (and any future MuninnDB-backed luca tools)
 * validate inputs server-side, then return one of these instructions
 * for the agent to execute. The agent sees a structured payload and
 * runs the named tool with the parsed args.
 *
 * SECURITY: free-form string fields (todo titles, bodies, etc.) are
 * NEVER interpolated into the instruction text. They live only in
 * argsJson, behind a JSON.parse the agent applies. This blocks the
 * pattern where a malicious body string could contain backticks or
 * function calls and trick the agent into running them as tool calls.
 */
export function buildMuninnInstruction(
    input: MuninnInstructionInput
): MuninnInstruction {
    const argsJson = JSON.stringify(input.args)
    // The "call DIRECTLY as a native environment function" directive below is
    // load-bearing for Antigravity. Antigravity exposes MCP tools in a
    // flattened registry, and routing a `mcp__muninn__*` call through the
    // generic `call_mcp_tool` wrapper made the server reject it — the tool
    // came back as "not enabled" / "unknown tool name" until invoked natively.
    // So we explicitly forbid `call_mcp_tool` and tell the agent to call the
    // named MCP tool directly. Keep the wording in sync with this rationale.
    const instructionForAgent =
        `Call the ${input.tool} tool DIRECTLY as a native environment function (do NOT use wrapper tools like \`call_mcp_tool\`). ${input.description} ` +
        `Parse the args via JSON.parse on the argsJson field; do NOT ` +
        `interpolate any free-form values directly into the call.`
    return {
        tool: input.tool,
        argsJson,
        instructionForAgent,
    }
}

/**
 * Placeholder token an agent substitutes with the backlog-root engram id
 * resolved by an earlier step in a {@link MuninnProcedure}. It is a fixed
 * constant (never free-form), so embedding it in step args / instruction
 * text carries no injection risk.
 */
export const ROOT_ID_PLACEHOLDER = '<<ROOT_ID>>'

/**
 * Placeholder token an agent substitutes with the resolved todo engram id
 * (the ULID found by concept lookup) in a later step of a
 * {@link MuninnProcedure}. Fixed constant — see {@link ROOT_ID_PLACEHOLDER}.
 */
export const TODO_ENGRAM_ID_PLACEHOLDER = '<<TODO_ENGRAM_ID>>'

/** A single ordered step in a {@link MuninnProcedure}. */
export interface MuninnProcedureStep {
    /** 1-based ordinal — the agent executes steps in this order. */
    step: number
    /** Fully-qualified MCP tool name to call for this step. */
    tool: string
    /**
     * Pre-stringified JSON arg blob. The agent JSON.parses it and passes
     * the result to the tool. May contain placeholder tokens
     * ({@link ROOT_ID_PLACEHOLDER}, {@link TODO_ENGRAM_ID_PLACEHOLDER})
     * that the agent replaces with ids resolved by earlier steps. As with
     * the single-call instruction, free-form values (todo titles/bodies)
     * live ONLY here, behind JSON.parse — never in `instructionForAgent`.
     */
    argsJson: string
    /**
     * What this step accomplishes, including any conditional ("only if
     * step 1 found nothing") and placeholder-substitution note.
     */
    description: string
}

/**
 * A multi-step MuninnDB delegation procedure.
 *
 * Some backlog operations are not a single tool call: tree-backed todos
 * require resolving the backlog root, then acting under it (add a child,
 * enumerate the subtree, evolve a node in place). A {@link MuninnInstruction}
 * models exactly one call; this models an ordered sequence with data flowing
 * between steps via placeholder tokens. The `kind: 'procedure'` discriminator
 * lets the agent (and tests) distinguish it from a single-call instruction.
 */
export interface MuninnProcedure {
    kind: 'procedure'
    steps: MuninnProcedureStep[]
    instructionForAgent: string
}

export interface MuninnProcedureInput {
    steps: Array<{
        tool: string
        args: Record<string, unknown>
        description: string
    }>
    /**
     * Ties the steps together — ordering, conditionals, and placeholder
     * substitution. MUST NOT interpolate free-form values; those live in
     * each step's argsJson behind JSON.parse (same injection-safety
     * property as {@link buildMuninnInstruction}).
     */
    instructionForAgent: string
}

/**
 * Build a multi-step delegation procedure. Each step's `args` object is
 * JSON-stringified into `argsJson` (preserving the single-input-blob
 * pattern that defangs prompt injection from free-form string fields),
 * and steps are numbered 1..N in order.
 */
export function buildMuninnProcedure(
    input: MuninnProcedureInput
): MuninnProcedure {
    return {
        kind: 'procedure',
        steps: input.steps.map((s, i) => ({
            step: i + 1,
            tool: s.tool,
            argsJson: JSON.stringify(s.args),
            description: s.description,
        })),
        instructionForAgent: input.instructionForAgent,
    }
}
