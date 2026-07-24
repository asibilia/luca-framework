import { describe, expect, test } from "bun:test";

import { readSSE } from "../src/sse";

function streamFromChunks(chunks: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("readSSE resource limits", () => {
  test("rejects a physical line whose bytes exceed maxLineBytes across chunks", async () => {
    const source = streamFromChunks(["data: 12", "345\n\n"]);

    await expect(readSSE(source, () => {}, { maxLineBytes: 8 })).rejects.toThrow(
      "SSE line exceeds 8 bytes",
    );
  });

  test("rejects an event whose aggregate bytes exceed maxEventBytes", async () => {
    const source = streamFromChunks(["event: x\ndata: 1\ndata: 2\n\n"]);

    await expect(readSSE(source, () => {}, { maxEventBytes: 20 })).rejects.toThrow(
      "SSE event exceeds 20 bytes",
    );
  });

  test("validates limits without throwing synchronously", async () => {
    await expect(
      readSSE(streamFromChunks([]), () => {}, { maxLineBytes: 0 }),
    ).rejects.toThrow("invalid SSE options");
  });

  test("rejects a null signal as invalid options rather than crashing on `in`", async () => {
    // `typeof null === "object"`, so a null signal reaches the `in` operator in
    // the AbortSignal predicate and throws a raw TypeError instead of failing
    // schema validation.
    await expect(
      readSSE(streamFromChunks([]), () => {}, {
        signal: null as unknown as AbortSignal,
      }),
    ).rejects.toThrow("invalid SSE options");
  });
});

describe("readSSE cancellation cleanup", () => {
  test("aborting a pending read cancels and releases the reader", async () => {
    let cancelled = 0;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const source = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      cancel() {
        cancelled++;
      },
    });
    const abortController = new AbortController();
    const pending = readSSE(source, () => {}, { signal: abortController.signal });

    abortController.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(1);
    expect(source.locked).toBe(false);
    controller = undefined;
  });

  test("handler failure cancels the remaining stream and releases its lock", async () => {
    let cancelled = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: x\ndata: {}\n\n"));
      },
      cancel() {
        cancelled++;
      },
    });

    await expect(
      readSSE(source, () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    expect(cancelled).toBe(1);
    expect(source.locked).toBe(false);
  });
});
