/**
 * Unit tests for follow-up Pi extension helper.
 *
 * Tests that sendFollowUp dispatches the correct payload to pi.sendMessage
 * and silently handles missing or broken sendMessage.
 */
import { describe, test, expect } from "bun:test";

import { sendFollowUp } from "~/hooks/pi-extensions/__helpers/follow-up";

// ─── sendFollowUp ────────────────────────────────────────────

describe("sendFollowUp", () => {
  test("calls pi.sendMessage with correct payload structure", () => {
    const calls: Array<{ message: any; options: any }> = [];
    const pi = {
      registerTool: () => {},
      on: () => {},
      sendMessage: (message: any, options: any) => {
        calls.push({ message, options });
      },
    };

    sendFollowUp(pi, {
      customType: "luca:status",
      content: "Phase 3 complete",
      details: { phase: 3, status: "done" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toEqual({
      customType: "luca:status",
      content: "Phase 3 complete",
      display: true,
      details: { phase: 3, status: "done" },
    });
  });

  test("sets deliverAs: 'followUp' in options", () => {
    const calls: Array<{ message: any; options: any }> = [];
    const pi = {
      registerTool: () => {},
      on: () => {},
      sendMessage: (message: any, options: any) => {
        calls.push({ message, options });
      },
    };

    sendFollowUp(pi, {
      customType: "luca:info",
      content: "Info",
      details: {},
    });

    expect(calls[0]!.options).toEqual({ deliverAs: "followUp" });
  });

  test("defaults display to true when not specified", () => {
    const calls: Array<{ message: any; options: any }> = [];
    const pi = {
      registerTool: () => {},
      on: () => {},
      sendMessage: (message: any, options: any) => {
        calls.push({ message, options });
      },
    };

    sendFollowUp(pi, {
      customType: "luca:test",
      content: "Test",
      details: {},
    });

    expect(calls[0]!.message.display).toBe(true);
  });

  test("respects display: false when specified", () => {
    const calls: Array<{ message: any; options: any }> = [];
    const pi = {
      registerTool: () => {},
      on: () => {},
      sendMessage: (message: any, options: any) => {
        calls.push({ message, options });
      },
    };

    sendFollowUp(pi, {
      customType: "luca:silent",
      content: "Silent message",
      display: false,
      details: { silent: true },
    });

    expect(calls[0]!.message.display).toBe(false);
  });

  test("silent when pi.sendMessage is undefined", () => {
    const pi = {
      registerTool: () => {},
      on: () => {},
      // sendMessage intentionally omitted
    };

    expect(() =>
      sendFollowUp(pi as any, {
        customType: "luca:test",
        content: "Test",
        details: {},
      }),
    ).not.toThrow();
  });

  test("silent when pi.sendMessage throws", () => {
    const pi = {
      registerTool: () => {},
      on: () => {},
      sendMessage: () => {
        throw new Error("Session ended");
      },
    };

    expect(() =>
      sendFollowUp(pi, {
        customType: "luca:test",
        content: "Test",
        details: {},
      }),
    ).not.toThrow();
  });
});
