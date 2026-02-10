export interface FetchMockConfig {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  error?: Error;
}

export function createFetchMock(
  defaultConfig: FetchMockConfig = { status: 200, body: {} },
  urlConfigs?: Record<string, FetchMockConfig>
) {
  const calls: Array<{ url: string; options?: RequestInit }> = [];

  const fetchMock = async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    calls.push({ url: urlStr, options });

    let config = defaultConfig;
    if (urlConfigs) {
      for (const [pattern, patternConfig] of Object.entries(urlConfigs)) {
        if (urlStr.includes(pattern)) {
          config = patternConfig;
          break;
        }
      }
    }

    if (config.error) {
      throw config.error;
    }

    return new Response(JSON.stringify(config.body), {
      status: config.status ?? 200,
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers ?? {}),
      },
    });
  };

  return { fetch: fetchMock, getCalls: () => calls };
}

export function installFetchMock(mockInstance: ReturnType<typeof createFetchMock>): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockInstance.fetch as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}
