import { test, expect } from "bun:test";
import { VERSION } from "../src/cli.js";

test("VERSION is a semver-looking string", () => {
  expect(typeof VERSION).toBe("string");
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
});