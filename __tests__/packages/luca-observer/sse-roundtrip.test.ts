import { test, expect, describe } from "bun:test";

describe("SSE event roundtrip", () => {
  test("insertEvent stores and broadcasts event", async () => {
    const { insertEvent, queryEvents } =
      await import("../../../packages/luca-observer/lib/db");
    const { broadcastEvent, addSSEClient, removeSSEClient } =
      await import("../../../packages/luca-observer/lib/sse");

    // Track broadcast events
    const received: unknown[] = [];
    const controller = {
      enqueue: (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        // SSE format: "data: {...}\n\n"
        const jsonStr = text.replace("data: ", "").trim();
        if (jsonStr) {
          try {
            received.push(JSON.parse(jsonStr));
          } catch {
            // heartbeat or non-JSON
          }
        }
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    addSSEClient(controller);

    // Insert and broadcast
    const stored = insertEvent({
      event_type: "test.roundtrip",
      session_id: "test-session",
    });

    broadcastEvent(stored);

    // Verify stored in database
    const events = queryEvents({ event_type: "test.roundtrip" });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.event_type).toBe("test.roundtrip");

    // Verify broadcast received
    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>).event_type).toBe(
      "test.roundtrip",
    );

    removeSSEClient(controller);
  });

  test("broadcast silently handles disconnected clients", async () => {
    const { insertEvent } =
      await import("../../../packages/luca-observer/lib/db");
    const { broadcastEvent, addSSEClient } =
      await import("../../../packages/luca-observer/lib/sse");

    // Create a controller that throws (simulating disconnected client)
    const badController = {
      enqueue: () => {
        throw new Error("Client disconnected");
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    addSSEClient(badController);

    const stored = insertEvent({
      event_type: "test.disconnect",
    });

    // Should not throw
    expect(() => broadcastEvent(stored)).not.toThrow();
  });
});
