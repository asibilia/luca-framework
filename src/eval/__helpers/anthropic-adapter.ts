import type { LlmAdapter } from "../__schemas/eval.schemas";

/**
 * Anthropic Messages API response shape (subset).
 *
 * Only the fields we need for token usage and content extraction.
 */
interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Create an Anthropic API adapter for real eval runs.
 *
 * Requires ANTHROPIC_API_KEY environment variable to be set.
 * Uses fetch (built-in) for HTTP calls to the Anthropic Messages API.
 *
 * @returns LlmAdapter that calls the Anthropic Messages API
 * @throws Error if ANTHROPIC_API_KEY is not set
 *
 * @example
 * ```typescript
 * const adapter = createAnthropicAdapter();
 * const report = await runEvalSuite(suite, { adapter });
 * ```
 */
export function createAnthropicAdapter(): LlmAdapter {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for eval runs",
    );
  }

  return {
    async call(
      model: string,
      systemPrompt: string,
      userMessage: string,
      temperature: number,
    ) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Anthropic API error (${response.status}): ${errorBody}`,
        );
      }

      const data = (await response.json()) as AnthropicResponse;
      const text = data.content[0]?.text ?? "";

      return {
        text,
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      };
    },
  };
}

/**
 * Create a mock adapter that returns canned responses.
 *
 * For development and CI environments without API keys.
 * Delegates to createMockAdapterWithResponses with an empty response map,
 * which provides the same default mock behavior (judge-aware responses).
 *
 * @returns LlmAdapter that returns mock responses without API calls
 *
 * @example
 * ```typescript
 * const mockAdapter = createMockAdapter();
 * const report = await runEvalSuite(suite, { adapter: mockAdapter });
 * ```
 */
export const createMockAdapter = (): LlmAdapter =>
  createMockAdapterWithResponses(new Map());

/**
 * Create a mock adapter with custom response mapping.
 *
 * Allows tests to specify exact responses for specific inputs.
 *
 * @param responses - Map of user message substring to response text.
 *   If user message contains the key string, the mapped response is returned.
 *   Falls back to default mock response if no key matches.
 * @returns LlmAdapter with custom response behavior
 *
 * @example
 * ```typescript
 * const adapter = createMockAdapterWithResponses(
 *   new Map([
 *     ["classify complexity", '{"score": 1.0, "passed": true, "reasoning": "Correct"}'],
 *     ["identify gaps", '{"score": 0.5, "passed": false, "reasoning": "Missing gaps"}'],
 *   ]),
 * );
 * ```
 */
export function createMockAdapterWithResponses(
  responses: Map<string, string>,
): LlmAdapter {
  return {
    async call(
      _model: string,
      systemPrompt: string,
      userMessage: string,
      _temperature: number,
    ) {
      // Check custom responses by user message substring match
      for (const [key, value] of responses) {
        if (userMessage.includes(key)) {
          return {
            text: value,
            input_tokens: 100,
            output_tokens: 50,
          };
        }
      }

      // Fall back to default mock behavior
      if (systemPrompt.includes("evaluator")) {
        return {
          text: '{"score": 0.8, "passed": true, "reasoning": "Mock evaluation: output meets rubric criteria."}',
          input_tokens: 100,
          output_tokens: 50,
        };
      }

      return {
        text: "Mock response for eval",
        input_tokens: 100,
        output_tokens: 50,
      };
    },
  };
}
