/**
 * Unit tests for the luca-search Pi extension.
 *
 * Tests registration behavior, tool metadata, execute handler
 * success/error paths, and result rendering.
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

import { createMockPi } from "../__helpers/mock-pi";
import lucaSearch from "~/hooks/pi-extensions/luca-search";

// ─── Env var save/restore ────────────────────────────────────────────────────

const ENV_KEYS = ["GOOGLE_CSE_API_KEY", "GOOGLE_CSE_ID"];
let savedEnv: Record<string, string | undefined>;

function setSearchEnv(apiKey?: string, cseId?: string) {
  if (apiKey !== undefined) process.env.GOOGLE_CSE_API_KEY = apiKey;
  else delete process.env.GOOGLE_CSE_API_KEY;

  if (cseId !== undefined) process.env.GOOGLE_CSE_ID = cseId;
  else delete process.env.GOOGLE_CSE_ID;
}

// ─── Fetch mock helpers ──────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetchResponse(body: unknown, status = 200) {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as any;
}

function mockFetchError(message: string) {
  globalThis.fetch = mock(() => Promise.reject(new Error(message))) as any;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  // Default: set valid env vars
  setSearchEnv("test-api-key", "test-cse-id");
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
  globalThis.fetch = originalFetch;
});

// ─── Registration ────────────────────────────────────────────────────────────

describe("registration", () => {
  test("registers luca_web_search tool", () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);
    expect(tools.size).toBe(1);
    expect(tools.has("luca_web_search")).toBe(true);
  });

  test("registers tool even when env vars are missing (checked at call time)", () => {
    setSearchEnv(undefined, undefined);
    const { api, tools } = createMockPi();
    lucaSearch(api);
    expect(tools.size).toBe(1);
  });
});

// ─── Tool metadata ───────────────────────────────────────────────────────────

describe("tool metadata", () => {
  test("has correct name, label, and parameter schema", () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);

    const tool = tools.get("luca_web_search");
    expect(tool.name).toBe("luca_web_search");
    expect(tool.label).toBe("Web Search");
    expect(tool.parameters.required).toEqual(["query"]);
    expect(tool.parameters.properties.query.type).toBe("string");
    expect(tool.parameters.properties.num_results.type).toBe("number");
  });
});

// ─── Execute: success paths ──────────────────────────────────────────────────

describe("execute success", () => {
  test("returns structured results from Google CSE response", async () => {
    mockFetchResponse({
      items: [
        {
          title: "Result 1",
          link: "https://example.com/1",
          snippet: "First result",
        },
        {
          title: "Result 2",
          link: "https://example.com/2",
          snippet: "Second result",
        },
      ],
    });

    const { api } = createMockPi();
    lucaSearch(api);

    const tool = createMockPi();
    lucaSearch(tool.api);
    const toolDef = tool.tools.get("luca_web_search");
    const result = await toolDef.execute("call-1", { query: "test query" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.query).toBe("test query");
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].title).toBe("Result 1");
    expect(parsed.results[0].link).toBe("https://example.com/1");
    expect(parsed.results[1].snippet).toBe("Second result");
  });

  test("defaults num_results to 5", async () => {
    mockFetchResponse({ items: [] });

    const { api, tools } = createMockPi();
    lucaSearch(api);

    await tools.get("luca_web_search").execute("call-1", { query: "test" });

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain("num=5");
  });

  test("clamps num_results to 1-10 range", async () => {
    mockFetchResponse({ items: [] });

    const { api, tools } = createMockPi();
    lucaSearch(api);

    // Test upper clamp
    await tools.get("luca_web_search").execute("call-1", {
      query: "test",
      num_results: 50,
    });
    let url = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain("num=10");

    // Reset mock
    mockFetchResponse({ items: [] });

    // Test lower clamp
    await tools.get("luca_web_search").execute("call-2", {
      query: "test",
      num_results: -3,
    });
    url = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain("num=1");
  });

  test("handles empty results gracefully", async () => {
    mockFetchResponse({ items: [] });

    const { api, tools } = createMockPi();
    lucaSearch(api);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "obscure query" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toEqual([]);
    expect(result.details?.result_count).toBe(0);
  });

  test("handles missing items key in response", async () => {
    mockFetchResponse({});

    const { api, tools } = createMockPi();
    lucaSearch(api);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "test" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toEqual([]);
  });
});

// ─── Execute: error paths ────────────────────────────────────────────────────

describe("execute errors", () => {
  test("returns error when env vars missing at call time", async () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);

    // Remove env vars after registration
    setSearchEnv(undefined, undefined);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "test" });
    const text = result.content[0].text;

    expect(text).toContain("GOOGLE_CSE_API_KEY");
    expect(text).toContain("GOOGLE_CSE_ID");
  });

  test("returns error on network failure", async () => {
    mockFetchError("getaddrinfo ENOTFOUND googleapis.com");

    const { api, tools } = createMockPi();
    lucaSearch(api);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "test" });
    const text = result.content[0].text;

    expect(text).toContain("Search failed:");
    expect(text).toContain("ENOTFOUND");
  });

  test("returns rate limit message on HTTP 429", async () => {
    mockFetchResponse({ error: { message: "Rate limit" } }, 429);

    const { api, tools } = createMockPi();
    lucaSearch(api);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "test" });
    const text = result.content[0].text;

    expect(text).toContain("rate limit");
  });

  test("returns HTTP status on non-200 response", async () => {
    mockFetchResponse({ error: { message: "Forbidden" } }, 403);

    const { api, tools } = createMockPi();
    lucaSearch(api);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "test" });
    const text = result.content[0].text;

    expect(text).toContain("HTTP 403");
  });

  test("returns error on empty query", async () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);

    const result = await tools
      .get("luca_web_search")
      .execute("call-1", { query: "  " });
    const text = result.content[0].text;

    expect(text).toContain("empty");
  });
});

// ─── renderResult ────────────────────────────────────────────────────────────

describe("renderResult", () => {
  test("formats results as numbered list", () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);

    const tool = tools.get("luca_web_search");
    const mockResult = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            results: [
              { title: "Bun", link: "https://bun.sh", snippet: "Fast runtime" },
              {
                title: "Node",
                link: "https://nodejs.org",
                snippet: "JS runtime",
              },
            ],
          }),
        },
      ],
    };

    const rendered = tool.renderResult(mockResult, {}, {});
    const lines = rendered.render(80);

    expect(lines.some((l: string) => l.includes("Bun"))).toBe(true);
    expect(lines.some((l: string) => l.includes("https://bun.sh"))).toBe(true);
    expect(lines.some((l: string) => l.includes("Node"))).toBe(true);
  });

  test("handles empty results", () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);

    const tool = tools.get("luca_web_search");
    const mockResult = {
      content: [{ type: "text", text: JSON.stringify({ results: [] }) }],
    };

    const rendered = tool.renderResult(mockResult, {}, {});
    const lines = rendered.render(80);

    expect(lines[0]).toContain("No search results");
  });

  test("returns null on invalid JSON", () => {
    const { api, tools } = createMockPi();
    lucaSearch(api);

    const tool = tools.get("luca_web_search");
    const mockResult = {
      content: [{ type: "text", text: "not json" }],
    };

    const rendered = tool.renderResult(mockResult, {}, {});
    expect(rendered).toBeNull();
  });
});
