import { describe, test, expect } from "bun:test";
import {
  pluginAuthorSchema,
  pluginManifestSchema,
  generatePluginManifest,
} from "./plugin.types";

describe("pluginAuthorSchema", () => {
  test("accepts valid author with all fields", () => {
    const result = pluginAuthorSchema.safeParse({
      name: "Alec Sibilia",
      email: "alec@example.com",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  test("accepts author with name only", () => {
    const result = pluginAuthorSchema.safeParse({ name: "Alec Sibilia" });
    expect(result.success).toBe(true);
  });

  test("rejects author without name", () => {
    const result = pluginAuthorSchema.safeParse({
      email: "alec@example.com",
    });
    expect(result.success).toBe(false);
  });

  test("rejects author with invalid email", () => {
    const result = pluginAuthorSchema.safeParse({
      name: "Alec Sibilia",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  test("rejects author with invalid url", () => {
    const result = pluginAuthorSchema.safeParse({
      name: "Alec Sibilia",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("pluginManifestSchema", () => {
  test("valid manifest with all fields passes", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-cool-plugin",
      version: "1.2.3",
      description: "A plugin that does cool things",
      author: {
        name: "Alec Sibilia",
        email: "alec@example.com",
        url: "https://example.com",
      },
      homepage: "https://my-plugin.example.com",
      repository: "https://github.com/user/my-plugin",
      license: "Apache-2.0",
      keywords: ["analytics", "posthog"],
      commands: ["lu-cool"],
      agents: ["cool-agent"],
      skills: ["cool-skill"],
      hooks: ["post-cool-hook"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("my-cool-plugin");
      expect(result.data.version).toBe("1.2.3");
      expect(result.data.description).toBe("A plugin that does cool things");
      expect(result.data.author?.name).toBe("Alec Sibilia");
      expect(result.data.homepage).toBe("https://my-plugin.example.com");
      expect(result.data.repository).toBe("https://github.com/user/my-plugin");
      expect(result.data.license).toBe("Apache-2.0");
      expect(result.data.keywords).toEqual(["analytics", "posthog"]);
      expect(result.data.commands).toEqual(["lu-cool"]);
      expect(result.data.agents).toEqual(["cool-agent"]);
      expect(result.data.skills).toEqual(["cool-skill"]);
      expect(result.data.hooks).toEqual(["post-cool-hook"]);
    }
  });

  test("minimal manifest with name only passes", () => {
    const result = pluginManifestSchema.safeParse({
      name: "minimal-plugin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("minimal-plugin");
      expect(result.data.version).toBe("0.1.0");
      expect(result.data.license).toBe("MIT");
      expect(result.data.keywords).toEqual([]);
      expect(result.data.commands).toEqual([]);
      expect(result.data.agents).toEqual([]);
      expect(result.data.skills).toEqual([]);
      expect(result.data.hooks).toEqual([]);
    }
  });

  test("invalid name format (non-kebab-case) fails", () => {
    const camelCase = pluginManifestSchema.safeParse({ name: "myPlugin" });
    expect(camelCase.success).toBe(false);

    const pascalCase = pluginManifestSchema.safeParse({ name: "MyPlugin" });
    expect(pascalCase.success).toBe(false);

    const snakeCase = pluginManifestSchema.safeParse({ name: "my_plugin" });
    expect(snakeCase.success).toBe(false);

    const spaces = pluginManifestSchema.safeParse({ name: "my plugin" });
    expect(spaces.success).toBe(false);

    const trailingHyphen = pluginManifestSchema.safeParse({
      name: "my-plugin-",
    });
    expect(trailingHyphen.success).toBe(false);

    const leadingHyphen = pluginManifestSchema.safeParse({
      name: "-my-plugin",
    });
    expect(leadingHyphen.success).toBe(false);
  });

  test("valid kebab-case names pass", () => {
    for (const name of ["plugin", "my-plugin", "my-cool-plugin", "a1-b2-c3"]) {
      const result = pluginManifestSchema.safeParse({ name });
      expect(result.success).toBe(true);
    }
  });

  test("optional fields can be omitted", () => {
    const result = pluginManifestSchema.safeParse({
      name: "bare-plugin",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
      expect(result.data.author).toBeUndefined();
      expect(result.data.homepage).toBeUndefined();
      expect(result.data.repository).toBeUndefined();
    }
  });

  test("rejects manifest without name", () => {
    const result = pluginManifestSchema.safeParse({
      version: "1.0.0",
      description: "Missing name",
    });
    expect(result.success).toBe(false);
  });

  test("rejects manifest with empty name", () => {
    const result = pluginManifestSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid homepage url", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      homepage: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid repository url", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      repository: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("generatePluginManifest", () => {
  test("produces valid manifest from minimal input", () => {
    const manifest = generatePluginManifest({ name: "generated-plugin" });

    expect(manifest.name).toBe("generated-plugin");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.license).toBe("MIT");
    expect(manifest.keywords).toEqual([]);
    expect(manifest.commands).toEqual([]);
    expect(manifest.agents).toEqual([]);
    expect(manifest.skills).toEqual([]);
    expect(manifest.hooks).toEqual([]);

    // Verify the generated manifest also passes schema validation
    const validation = pluginManifestSchema.safeParse(manifest);
    expect(validation.success).toBe(true);
  });

  test("preserves provided overrides", () => {
    const manifest = generatePluginManifest({
      name: "custom-plugin",
      version: "2.0.0",
      description: "Custom description",
      license: "Apache-2.0",
      keywords: ["custom"],
      agents: ["my-agent"],
      skills: ["my-skill"],
    });

    expect(manifest.name).toBe("custom-plugin");
    expect(manifest.version).toBe("2.0.0");
    expect(manifest.description).toBe("Custom description");
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.keywords).toEqual(["custom"]);
    expect(manifest.agents).toEqual(["my-agent"]);
    expect(manifest.skills).toEqual(["my-skill"]);
    expect(manifest.commands).toEqual([]);
    expect(manifest.hooks).toEqual([]);
  });

  test("throws on invalid name", () => {
    expect(() => generatePluginManifest({ name: "BadName" })).toThrow();
  });

  test("includes author when provided", () => {
    const manifest = generatePluginManifest({
      name: "authored-plugin",
      author: { name: "Alec Sibilia", email: "alec@example.com" },
    });

    expect(manifest.author).toBeDefined();
    expect(manifest.author?.name).toBe("Alec Sibilia");
    expect(manifest.author?.email).toBe("alec@example.com");
  });
});
