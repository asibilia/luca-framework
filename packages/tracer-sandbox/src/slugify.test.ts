import { describe, expect, test } from "bun:test";

import { slugify } from "./slugify";

describe("slugify", () => {
  test("AC1: lowercases words and joins them with a dash", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("AC2: turns accented letters into plain letters", () => {
    expect(slugify("Crème Brûlée")).toBe("creme-brulee");
  });

  test("AC3: collapses runs of spaces, dashes, and symbols into one dash with none at the ends", () => {
    expect(slugify("  --Hello,   World!--  ")).toBe("hello-world");
  });

  test("AC4: returns an empty slug for text of only symbols", () => {
    expect(slugify("!!!")).toBe("");
  });

  test("AC4: returns an empty slug for empty text", () => {
    expect(slugify("")).toBe("");
  });

  test("AC5: maxLength cuts the slug without leaving a trailing dash", () => {
    expect(slugify("Hello World Again", { maxLength: 12 })).toBe(
      "hello-world",
    );
  });

  test("AC5: maxLength keeps the whole cut when it ends on a letter", () => {
    expect(slugify("Hello World Again", { maxLength: 8 })).toBe("hello-wo");
  });

  test("AC5: without maxLength the whole slug is returned", () => {
    expect(slugify("Hello World Again")).toBe("hello-world-again");
  });
});
