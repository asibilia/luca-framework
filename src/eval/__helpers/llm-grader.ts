import type {
  GraderResult,
  LlmGraderConfig,
  LlmAdapter,
} from "../__schemas/eval.schemas";

/**
 * System prompt for the LLM judge.
 *
 * Instructs the model to evaluate agent output against a rubric
 * and return a structured JSON response.
 */
const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator scoring AI agent outputs.

You will receive:
1. The agent's output
2. The expected output (if available)
3. A rubric describing the scoring criteria

Score the output from 0.0 to 1.0 based on the rubric.

Respond with ONLY a JSON object in this exact format:
{
  "score": <number between 0.0 and 1.0>,
  "passed": <true if score >= 0.7, false otherwise>,
  "reasoning": "<1-3 sentences explaining the score>"
}`;

/**
 * Build the user message for the judge model.
 *
 * @param output - Raw output from the agent
 * @param expected - Expected output record (may be undefined)
 * @param rubric - Rubric text describing scoring criteria
 * @returns Formatted user message string
 */
function buildJudgeMessage(
  output: unknown,
  expected: Record<string, unknown> | undefined,
  rubric: string,
): string {
  const outputStr = JSON.stringify(output, null, 2);
  const expectedStr = expected
    ? JSON.stringify(expected, null, 2)
    : "Not provided";

  return `## Agent Output
${outputStr}

## Expected Output
${expectedStr}

## Rubric
${rubric}`;
}

/**
 * Parse the judge response into score, passed, and reasoning.
 *
 * Tries JSON.parse first. If that fails, attempts regex extraction
 * of the score field. Returns a fallback result if all parsing fails.
 *
 * @param text - Raw text response from the judge model
 * @returns Parsed judge verdict
 */
function parseJudgeResponse(text: string): {
  score: number;
  passed: boolean;
  reasoning: string;
} {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(text) as {
      score: number;
      passed: boolean;
      reasoning: string;
    };
    if (
      typeof parsed.score === "number" &&
      typeof parsed.passed === "boolean" &&
      typeof parsed.reasoning === "string"
    ) {
      return parsed;
    }
  } catch {
    // JSON parse failed, try regex fallback
  }

  // Regex fallback: extract score from text
  const scoreMatch = /"score"\s*:\s*([\d.]+)/.exec(text);
  if (scoreMatch && scoreMatch[1] !== undefined) {
    const score = parseFloat(scoreMatch[1]);
    if (!Number.isNaN(score)) {
      return {
        score,
        passed: score >= 0.7,
        reasoning: text,
      };
    }
  }

  // All parsing failed
  return {
    score: 0.0,
    passed: false,
    reasoning: text,
  };
}

/**
 * Grade an eval case output using an LLM as judge.
 *
 * Sends the agent output and rubric to a judge model, which returns
 * a structured score with reasoning. The judge prompt instructs the
 * model to respond with a JSON object: { score: number, passed: boolean, reasoning: string }.
 *
 * @param output - Raw output from the agent being evaluated
 * @param expected - Expected output (provided for context, not for matching)
 * @param config - LLM grader config (rubric, judge_model override, temperature)
 * @param defaultJudgeModel - Fallback judge model from suite config
 * @param adapter - LLM adapter for making API calls
 * @returns GraderResult with score, pass/fail, and judge reasoning
 *
 * @example
 * ```typescript
 * const result = await gradeWithLlm(
 *   agentOutput,
 *   expectedOutput,
 *   { rubric: "Score 1.0 if all gaps are identified with clear explanations..." },
 *   "claude-haiku-4-5-20250514",
 *   anthropicAdapter,
 * );
 * ```
 */
export async function gradeWithLlm(
  output: unknown,
  expected: Record<string, unknown> | undefined,
  config: LlmGraderConfig,
  defaultJudgeModel: string,
  adapter: LlmAdapter,
): Promise<GraderResult> {
  const model = config.judge_model ?? defaultJudgeModel;
  const temperature = config.temperature ?? 0;
  const userMessage = buildJudgeMessage(output, expected, config.rubric);

  try {
    const response = await adapter.call(
      model,
      JUDGE_SYSTEM_PROMPT,
      userMessage,
      temperature,
    );

    const verdict = parseJudgeResponse(response.text);

    return {
      passed: verdict.passed,
      score: verdict.score,
      reason: verdict.reasoning,
      metadata: {
        judge_model: model,
        input_tokens: response.input_tokens,
        output_tokens: response.output_tokens,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      passed: false,
      score: 0.0,
      reason: `Judge call failed: ${errorMessage}`,
      metadata: { error: true },
    };
  }
}
