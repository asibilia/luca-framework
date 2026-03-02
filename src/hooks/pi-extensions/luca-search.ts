/**
 * Luca Search Extension for Pi
 *
 * Registers a `luca_web_search` tool backed by Google Custom Search
 * JSON API. Provides web search capabilities when Pi's underlying
 * model provider lacks native search grounding.
 *
 * Requires two env vars:
 * - GOOGLE_CSE_API_KEY: Google Custom Search API key
 * - GOOGLE_CSE_ID: Custom Search Engine ID
 *
 * If env vars are not set at registration time, the tool is still
 * registered but will return a helpful error at call time. This allows
 * env vars to be set after Pi session start.
 *
 * Source: src/hooks/pi-extensions/luca-search.ts
 * Deployed to: .pi/extensions/luca-search.ts
 */
import {
  createJsonResponseWithDetails,
  createTextResponse,
} from "./__helpers/response";

import type { PiExtensionAPI } from "./__types/pi-context";

/** Shape of a single search result returned to the LLM. */
interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

/** Shape of Google Custom Search API response items. */
interface GoogleCSEItem {
  title?: string;
  link?: string;
  snippet?: string;
}

/**
 * Pi extension: Google Custom Search web search tool.
 *
 * Registers `luca_web_search` which accepts a query string and
 * optional num_results parameter (1–10, default 5). Returns
 * structured results with title, link, and snippet.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaSearch(pi: PiExtensionAPI) {
  pi.registerTool({
    name: "luca_web_search",
    label: "Web Search",
    description:
      "Search the web using Google Custom Search. Returns titles, URLs, and snippets for the top results.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        num_results: {
          type: "number",
          description: "Number of results to return (1-10, default 5)",
        },
      },
      required: ["query"],
    },

    async execute(_toolCallId, params) {
      const apiKey = process.env.GOOGLE_CSE_API_KEY;
      const cseId = process.env.GOOGLE_CSE_ID;

      if (!apiKey || !cseId) {
        return createTextResponse(
          "Search unavailable: GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID env vars required",
        );
      }

      const query = String(params.query ?? "").trim();
      if (!query) {
        return createTextResponse("Search query cannot be empty");
      }

      // Clamp num_results to 1–10 range, default 5
      const rawNum = Number(params.num_results);
      const numResults = Number.isFinite(rawNum)
        ? Math.max(1, Math.min(10, Math.round(rawNum)))
        : 5;

      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cseId)}&q=${encodeURIComponent(query)}&num=${numResults}`;

      let response: Response;
      try {
        response = await fetch(url);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return createTextResponse(`Search failed: ${message}`);
      }

      if (response.status === 429) {
        return createTextResponse(
          "Search rate limit exceeded (100 queries/day free tier)",
        );
      }

      if (!response.ok) {
        return createTextResponse(`Search failed: HTTP ${response.status}`);
      }

      let data: { items?: GoogleCSEItem[] };
      try {
        data = (await response.json()) as { items?: GoogleCSEItem[] };
      } catch {
        return createTextResponse("Search failed: invalid JSON response");
      }

      const results: SearchResult[] = (data.items ?? []).map((item) => ({
        title: item.title ?? "",
        link: item.link ?? "",
        snippet: item.snippet ?? "",
      }));

      return createJsonResponseWithDetails(
        { query, num_results: numResults, results },
        { query, num_results: numResults, result_count: results.length },
      );
    },

    renderResult(result, _opts, theme) {
      try {
        const parsed = JSON.parse(result?.content?.[0]?.text ?? "{}");
        const items: SearchResult[] = parsed.results ?? [];

        if (items.length === 0) {
          return {
            render(_width: number) {
              return ["No search results found."];
            },
          };
        }

        return {
          render(_width: number) {
            const lines: string[] = [];
            for (let i = 0; i < items.length; i++) {
              const item: SearchResult | undefined = items[i];
              if (!item) continue;
              const num = theme?.dim?.(`${i + 1}.`) ?? `${i + 1}.`;
              const title = theme?.bold?.(item.title) ?? item.title;
              lines.push(`${num} ${title}`);
              lines.push(`   ${item.link}`);
              if (item.snippet) {
                lines.push(`   ${item.snippet}`);
              }
              if (i < items.length - 1) lines.push("");
            }
            return lines;
          },
        };
      } catch {
        return null;
      }
    },
  });
}
