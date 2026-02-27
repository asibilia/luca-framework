import { describe, test, expect } from "bun:test";

import { createRegistry } from "../registry";

describe("registry helpers", () => {
  describe("createRegistry", () => {
    test("set and get basic CRUD cycle", () => {
      const reg = createRegistry<{ value: number }>("test");
      reg.set("a", { value: 1 });
      expect(reg.get("a")).toEqual({ value: 1 });
    });

    test("get returns undefined for missing key", () => {
      const reg = createRegistry<string>("test");
      expect(reg.get("missing")).toBeUndefined();
    });

    test("has returns true for existing key", () => {
      const reg = createRegistry<string>("test");
      reg.set("key", "value");
      expect(reg.has("key")).toBe(true);
    });

    test("has returns false for missing key", () => {
      const reg = createRegistry<string>("test");
      expect(reg.has("missing")).toBe(false);
    });

    test("delete removes existing key and returns true", () => {
      const reg = createRegistry<string>("test");
      reg.set("key", "value");
      expect(reg.delete("key")).toBe(true);
      expect(reg.get("key")).toBeUndefined();
      expect(reg.has("key")).toBe(false);
    });

    test("delete returns false for missing key", () => {
      const reg = createRegistry<string>("test");
      expect(reg.delete("missing")).toBe(false);
    });

    test("entries returns all [key, value] pairs", () => {
      const reg = createRegistry<number>("test");
      reg.set("a", 1);
      reg.set("b", 2);
      reg.set("c", 3);
      const entries = reg.entries();
      expect(entries).toHaveLength(3);
      expect(entries).toContainEqual(["a", 1]);
      expect(entries).toContainEqual(["b", 2]);
      expect(entries).toContainEqual(["c", 3]);
    });

    test("values returns all values", () => {
      const reg = createRegistry<string>("test");
      reg.set("a", "alpha");
      reg.set("b", "beta");
      const values = reg.values();
      expect(values).toHaveLength(2);
      expect(values).toContain("alpha");
      expect(values).toContain("beta");
    });

    test("keys returns all keys", () => {
      const reg = createRegistry<string>("test");
      reg.set("x", "1");
      reg.set("y", "2");
      const keys = reg.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain("x");
      expect(keys).toContain("y");
    });

    test("clear empties the registry", () => {
      const reg = createRegistry<string>("test");
      reg.set("a", "1");
      reg.set("b", "2");
      reg.set("c", "3");
      expect(reg.size()).toBe(3);
      reg.clear();
      expect(reg.size()).toBe(0);
      expect(reg.entries()).toHaveLength(0);
    });

    test("size reflects current count", () => {
      const reg = createRegistry<string>("test");
      expect(reg.size()).toBe(0);
      reg.set("a", "1");
      expect(reg.size()).toBe(1);
      reg.set("b", "2");
      expect(reg.size()).toBe(2);
      reg.delete("a");
      expect(reg.size()).toBe(1);
    });

    test("name property matches constructor arg", () => {
      const reg = createRegistry<string>("my-registry");
      expect(reg.name).toBe("my-registry");
    });

    test("overwriting a key updates the value", () => {
      const reg = createRegistry<{ status: string }>("test");
      reg.set("item", { status: "pending" });
      reg.set("item", { status: "completed" });
      expect(reg.get("item")).toEqual({ status: "completed" });
      expect(reg.size()).toBe(1);
    });

    test("generic type parameter preserves type safety", () => {
      interface LoopState {
        name: string;
        status: "running" | "passed" | "failed";
        iterations: number;
      }

      const loops = createRegistry<LoopState>("loops");
      loops.set("test-loop", {
        name: "test-loop",
        status: "running",
        iterations: 0,
      });

      const loop = loops.get("test-loop");
      expect(loop).toBeDefined();
      expect(loop!.name).toBe("test-loop");
      expect(loop!.status).toBe("running");
      expect(loop!.iterations).toBe(0);
    });

    test("independent registries do not share state", () => {
      const reg1 = createRegistry<string>("reg1");
      const reg2 = createRegistry<string>("reg2");
      reg1.set("key", "value1");
      reg2.set("key", "value2");
      expect(reg1.get("key")).toBe("value1");
      expect(reg2.get("key")).toBe("value2");
    });

    test("entries returns empty array for empty registry", () => {
      const reg = createRegistry<string>("test");
      expect(reg.entries()).toEqual([]);
      expect(reg.values()).toEqual([]);
      expect(reg.keys()).toEqual([]);
    });
  });
});
