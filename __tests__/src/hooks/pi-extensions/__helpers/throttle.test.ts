/**
 * Tests for in-memory throttle utility.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  shouldRunThrottled,
  resetThrottle,
  resetAllThrottles,
} from "~/hooks/pi-extensions/__helpers/throttle";

beforeEach(() => {
  resetAllThrottles();
});

describe("shouldRunThrottled", () => {
  test("first call always runs", () => {
    expect(shouldRunThrottled("test-key", 60_000)).toBe(true);
  });

  test("second call within interval is suppressed", () => {
    expect(shouldRunThrottled("test-key", 60_000)).toBe(true);
    expect(shouldRunThrottled("test-key", 60_000)).toBe(false);
  });

  test("call after interval elapses runs", () => {
    // Use a very short interval (1ms) so it elapses immediately
    expect(shouldRunThrottled("test-key", 1)).toBe(true);

    // Wait just enough for the interval to pass
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait 5ms
    }

    expect(shouldRunThrottled("test-key", 1)).toBe(true);
  });

  test("different keys are independent", () => {
    expect(shouldRunThrottled("key-a", 60_000)).toBe(true);
    expect(shouldRunThrottled("key-b", 60_000)).toBe(true);
    expect(shouldRunThrottled("key-a", 60_000)).toBe(false);
    expect(shouldRunThrottled("key-b", 60_000)).toBe(false);
  });

  test("resetThrottle allows key to run again", () => {
    expect(shouldRunThrottled("test-key", 60_000)).toBe(true);
    expect(shouldRunThrottled("test-key", 60_000)).toBe(false);

    resetThrottle("test-key");
    expect(shouldRunThrottled("test-key", 60_000)).toBe(true);
  });

  test("resetAllThrottles allows all keys to run again", () => {
    expect(shouldRunThrottled("key-a", 60_000)).toBe(true);
    expect(shouldRunThrottled("key-b", 60_000)).toBe(true);

    resetAllThrottles();

    expect(shouldRunThrottled("key-a", 60_000)).toBe(true);
    expect(shouldRunThrottled("key-b", 60_000)).toBe(true);
  });
});
