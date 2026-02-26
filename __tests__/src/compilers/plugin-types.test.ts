import { describe, test, expect } from "bun:test";
import {
  pluginAuthorSchema,
  pluginManifestSchema,
  generatePluginManifest,
  KEBAB_CASE_REGEX,
  SEMVER_REGEX,
} from "~/compilers/__schemas/compilers.schemas";

describe("KEBAB_CASE_REGEX", () => {
  test("accepts valid kebab-case names starting with a letter", () => {
    for (const name of ["luca", "my-plugin", "a1-b2", "plugin-v2"]) {
      expect(KEBAB_CASE_REGEX.test(name)).toBe(true);
    }
  });

  test("rejects names starting with a digit", () => {
    for (const name of ["123", "1plugin", "0-start"]) {
      expect(KEBAB_CASE_REGEX.test(name)).toBe(false);
    }
  });

  test("rejects non-kebab-case formats", () => {
    for (const name of ["MyPlugin", "my_plugin", "-leading", "trailing-"]) {
      expect(KEBAB_CASE_REGEX.test(name)).toBe(false);
    }
  });
});

describe("SEMVER_REGEX", () => {
  test("accepts valid semver strings", () => {
    for (const v of [
      "0.0.0",
      "1.2.3",
      "10.20.30",
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0+build",
    ]) {
      expect(SEMVER_REGEX.test(v)).toBe(true);
    }
  });

  test("rejects invalid semver strings", () => {
    for (const v of ["1.0", "v1.0.0", "latest", "01.0.0", "1.0.0.", ".1.0.0"]) {
      expect(SEMVER_REGEX.test(v)).toBe(false);
    }
  });
});

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

  test("rejects names starting with a digit", () => {
    const digitOnly = pluginManifestSchema.safeParse({ name: "123" });
    expect(digitOnly.success).toBe(false);

    const digitLeading = pluginManifestSchema.safeParse({ name: "123-plugin" });
    expect(digitLeading.success).toBe(false);

    const digitSegment = pluginManifestSchema.safeParse({ name: "1a-plugin" });
    expect(digitSegment.success).toBe(false);
  });

  test("valid kebab-case names pass", () => {
    for (const name of ["plugin", "my-plugin", "my-cool-plugin", "a1-b2-c3"]) {
      const result = pluginManifestSchema.safeParse({ name });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid semver version strings", () => {
    const noMinor = pluginManifestSchema.safeParse({
      name: "my-plugin",
      version: "1.0",
    });
    expect(noMinor.success).toBe(false);

    const vPrefix = pluginManifestSchema.safeParse({
      name: "my-plugin",
      version: "v1.0.0",
    });
    expect(vPrefix.success).toBe(false);

    const text = pluginManifestSchema.safeParse({
      name: "my-plugin",
      version: "latest",
    });
    expect(text.success).toBe(false);

    const leadingZero = pluginManifestSchema.safeParse({
      name: "my-plugin",
      version: "01.0.0",
    });
    expect(leadingZero.success).toBe(false);
  });

  test("accepts valid semver version strings", () => {
    for (const version of [
      "0.1.0",
      "1.0.0",
      "2.3.4",
      "1.0.0-beta.1",
      "1.0.0-rc.1+build.123",
    ]) {
      const result = pluginManifestSchema.safeParse({
        name: "my-plugin",
        version,
      });
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

  test("accepts description at exactly 500 characters", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      description: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  test("rejects description exceeding 500 characters", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test("accepts keywords array with exactly 20 items", () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `kw-${i}`);
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      keywords,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toHaveLength(20);
    }
  });

  test("rejects keywords array exceeding 20 items", () => {
    const keywords = Array.from({ length: 21 }, (_, i) => `kw-${i}`);
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      keywords,
    });
    expect(result.success).toBe(false);
  });

  test("accepts keyword at exactly 50 characters", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      keywords: ["a".repeat(50)],
    });
    expect(result.success).toBe(true);
  });

  test("rejects keyword exceeding 50 characters", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      keywords: ["a".repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty string keyword", () => {
    const result = pluginManifestSchema.safeParse({
      name: "my-plugin",
      keywords: ["valid", ""],
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
    });

    expect(manifest.name).toBe("custom-plugin");
    expect(manifest.version).toBe("2.0.0");
    expect(manifest.description).toBe("Custom description");
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.keywords).toEqual(["custom"]);
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
