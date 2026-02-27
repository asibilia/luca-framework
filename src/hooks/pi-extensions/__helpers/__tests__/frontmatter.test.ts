import { describe, test, expect } from "bun:test";

import { parseFrontmatter, extractFrontmatterField } from "../frontmatter";

import type { AgentFrontmatter } from "../frontmatter";

describe("frontmatter helpers", () => {
  describe("parseFrontmatter", () => {
    test("parses full agent frontmatter with all fields", () => {
      const content = `---
name: lu-executor
description: Executes development plans
model: claude-sonnet-4-20250514
tools:
  - Read
  - Write
  - Bash
  - Edit
---
Body content here.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("lu-executor");
      expect(result!.description).toBe("Executes development plans");
      expect(result!.model).toBe("claude-sonnet-4-20250514");
      expect(result!.tools).toEqual(["Read", "Write", "Bash", "Edit"]);
    });

    test("parses frontmatter without model (optional field)", () => {
      const content = `---
name: code-architect
description: Reviews code architecture
tools:
  - Read
---
Body.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("code-architect");
      expect(result!.description).toBe("Reviews code architecture");
      expect(result!.model).toBeUndefined();
      expect(result!.tools).toEqual(["Read"]);
    });

    test("parses frontmatter without tools list", () => {
      const content = `---
name: simple-agent
description: A simple agent
---
Body.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("simple-agent");
      expect(result!.tools).toEqual([]);
    });

    test("returns null when no frontmatter found", () => {
      const content = "Just a plain markdown file without frontmatter.";
      const result = parseFrontmatter(content);
      expect(result).toBeNull();
    });

    test("returns null when frontmatter is missing name", () => {
      const content = `---
description: No name field
tools:
  - Read
---
Body.`;

      const result = parseFrontmatter(content);
      expect(result).toBeNull();
    });

    test("returns null for malformed frontmatter (missing closing ---)", () => {
      const content = `---
name: broken
description: Missing close fence
No closing delimiter`;

      const result = parseFrontmatter(content);
      expect(result).toBeNull();
    });

    test("handles tools list with various indentation styles", () => {
      const content = `---
name: test-agent
description: Test agent
tools:
  - Read
  - Write
  - Bash
---
Body.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.tools).toEqual(["Read", "Write", "Bash"]);
    });

    test("handles empty description", () => {
      const content = `---
name: minimal-agent
description:
---
Body.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("minimal-agent");
      // description regex match returns empty string when no value after colon
      expect(result!.description).toBe("");
    });

    test("regression: matches exact output of luca-roles parseFrontmatter", () => {
      // This is the exact format used in .pi/agents/ files
      const content = `---
name: lu-verifier
description: Verifies implementation against plan requirements
model: claude-sonnet-4-20250514
tools:
  - Read
  - Glob
  - Grep
  - Bash
  - luca_verify
---

# lu-verifier

Verification agent body content...`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();

      // Verify exact structure matches what luca-roles expects
      const expected: AgentFrontmatter = {
        name: "lu-verifier",
        description: "Verifies implementation against plan requirements",
        model: "claude-sonnet-4-20250514",
        tools: ["Read", "Glob", "Grep", "Bash", "luca_verify"],
      };

      expect(result).toEqual(expected);
    });

    test("handles frontmatter with extra whitespace in values", () => {
      const content = `---
name:   spaced-agent
description:   Has extra spaces
model:   claude-sonnet-4-20250514
tools:
  -   Read
  -   Write
---
Body.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("spaced-agent");
      expect(result!.description).toBe("Has extra spaces");
      expect(result!.model).toBe("claude-sonnet-4-20250514");
      expect(result!.tools).toEqual(["Read", "Write"]);
    });
  });

  describe("extractFrontmatterField", () => {
    const content = `---
name: lu-executor
description: Executes development plans
model: claude-sonnet-4-20250514
tools:
  - Read
  - Write
---
Body content.`;

    test("extracts description field", () => {
      const result = extractFrontmatterField(content, "description");
      expect(result).toBe("Executes development plans");
    });

    test("extracts name field", () => {
      const result = extractFrontmatterField(content, "name");
      expect(result).toBe("lu-executor");
    });

    test("extracts model field", () => {
      const result = extractFrontmatterField(content, "model");
      expect(result).toBe("claude-sonnet-4-20250514");
    });

    test("returns null for non-existent field", () => {
      const result = extractFrontmatterField(content, "nonexistent");
      expect(result).toBeNull();
    });

    test("returns null when no frontmatter present", () => {
      const result = extractFrontmatterField("No frontmatter here", "name");
      expect(result).toBeNull();
    });

    test("works for chain use case (description only)", () => {
      // luca-chain only reads description from frontmatter
      const agentContent = `---
name: lu-planner
description: Creates development plans
---
# lu-planner
Planning agent body.`;

      const desc = extractFrontmatterField(agentContent, "description");
      expect(desc).toBe("Creates development plans");
    });
  });
});
