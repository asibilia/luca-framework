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
    const instructionForAgent =
        `Call ${input.tool}. ${input.description} ` +
        `Parse the args via JSON.parse on the argsJson field; do NOT ` +
        `interpolate any free-form values directly into the call.`
    return {
        tool: input.tool,
        argsJson,
        instructionForAgent,
    }
}
