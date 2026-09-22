import { z } from "zod";

/** A handler invoked once per dispatched SSE event. May be async. */
export type SSEHandler = (event: string, data: string) => void | Promise<void>;

/** Source accepted by {@link readSSE}. */
export type SSESource =
  | ReadableStream<Uint8Array>
  | { stream(): ReadableStream<Uint8Array> };

/** Default maximum bytes in one physical SSE line. */
export const DEFAULT_MAX_SSE_LINE_BYTES = 64 * 1024;
/** Default maximum aggregate bytes in one SSE event. */
export const DEFAULT_MAX_SSE_EVENT_BYTES = 1024 * 1024;

export interface ReadSSEOptions {
  /** Cancels a pending reader and rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Maximum UTF-8 bytes in one physical line. */
  maxLineBytes?: number;
  /** Maximum aggregate physical-line bytes in one event. */
  maxEventBytes?: number;
}

const ReadSSEOptionsSchema = z.object({
  signal: z
    .custom<AbortSignal>(
      (value) =>
        // `typeof null === "object"`, so null must be excluded explicitly
        // before the `in` operator is reached — otherwise a null signal throws
        // a raw TypeError instead of failing validation.
        value !== undefined &&
        value !== null &&
        typeof value === "object" &&
        "aborted" in value &&
        "addEventListener" in value,
    )
    .optional(),
  maxLineBytes: z.number().int().positive().default(DEFAULT_MAX_SSE_LINE_BYTES),
  maxEventBytes: z.number().int().positive().default(DEFAULT_MAX_SSE_EVENT_BYTES),
});

function toReadableStream(source: SSESource): ReadableStream<Uint8Array> {
  if (source instanceof ReadableStream) return source;
  if (typeof source.stream === "function") return source.stream();
  throw new TypeError("readSSE: source must be a ReadableStream or Blob-like (.stream())");
}

function parseFieldLine(line: string): { field: string; value: string } {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return { field: line, value: "" };
  const field = line.slice(0, colonIdx);
  let value = line.slice(colonIdx + 1);
  if (value.startsWith(" ")) value = value.slice(1);
  return { field, value };
}

function appendBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  if (left.byteLength === 0) return right.slice();
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left);
  joined.set(right, left.byteLength);
  return joined;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

/**
 * Parse an SSE stream with bounded line/event buffering and cancellation-safe
 * reader cleanup. A handler is awaited before subsequent events are processed.
 *
 * @param source - Byte stream or Blob-like source.
 * @param fn - Handler called for each blank-line-terminated event.
 * @param options - Optional cancellation and byte limits.
 * @throws When limits are invalid/exceeded, reading fails, handling fails, or
 * the supplied signal aborts.
 */
export async function readSSE(
  source: SSESource,
  fn: SSEHandler,
  options: ReadSSEOptions = {},
): Promise<void> {
  const parsedOptions = ReadSSEOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    throw new TypeError(`readSSE: invalid SSE options: ${parsedOptions.error.message}`);
  }
  const { signal, maxLineBytes, maxEventBytes } = parsedOptions.data;
  if (signal?.aborted) throw abortReason(signal);

  const stream = toReadableStream(source);
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let event = "";
  let eventBytes = 0;
  let completed = false;
  const dataLines: string[] = [];

  const cancelReader = () => {
    void reader.cancel(signal ? abortReason(signal) : undefined).catch(() => {});
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  async function processLine(rawLine: Uint8Array): Promise<void> {
    if (rawLine.byteLength > maxLineBytes) {
      throw new RangeError(`SSE line exceeds ${maxLineBytes} bytes`);
    }
    const hasTrailingCR = rawLine.byteLength > 0 && rawLine[rawLine.byteLength - 1] === 13;
    const lineBytes = hasTrailingCR ? rawLine.subarray(0, rawLine.byteLength - 1) : rawLine;
    const line = decoder.decode(lineBytes);
    if (line === "") {
      if (event !== "" || dataLines.length > 0) {
        await fn(event, dataLines.join("\n"));
      }
      event = "";
      eventBytes = 0;
      dataLines.length = 0;
      return;
    }

    eventBytes += rawLine.byteLength + 1;
    if (eventBytes > maxEventBytes) {
      throw new RangeError(`SSE event exceeds ${maxEventBytes} bytes`);
    }
    if (line.startsWith(":")) return;
    const { field, value } = parseFieldLine(line);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }

  try {
    for (;;) {
      if (signal?.aborted) throw abortReason(signal);
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortReason(signal);
      if (done) {
        completed = true;
        break;
      }
      buffer = appendBytes(buffer, value);

      let newlineIndex = buffer.indexOf(10);
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await processLine(line);
        newlineIndex = buffer.indexOf(10);
      }
      if (buffer.byteLength > maxLineBytes) {
        throw new RangeError(`SSE line exceeds ${maxLineBytes} bytes`);
      }
    }

    if (buffer.byteLength > 0) await processLine(buffer);
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the original read, handler, limit, or abort error.
      }
    }
    reader.releaseLock();
  }
}

/** Produce canonical SSE framing for one event. */
export function writeSSE(event: string, value: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
}
