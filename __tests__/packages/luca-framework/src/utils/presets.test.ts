import { describe, test, expect } from "bun:test";

import {
  PRESETS,
  VALID_PRESETS,
  DEFAULT_PRESET,
  getPresetDefaults,
} from "../../../../../packages/luca-framework/src/utils/presets";

describe("PRESETS", () => {
  test("has starter, standard, and full presets", () => {
    expect(PRESETS.starter).toBeDefined();
    expect(PRESETS.standard).toBeDefined();
    expect(PRESETS.full).toBeDefined();
  });

  test("starter preset has minimal config", () => {
    expect(PRESETS.starter.harnesses).toEqual(["claude"]);
    expect(PRESETS.starter.workTracker).toBe("none");
    expect(PRESETS.starter.approvals.plans).toBe(false);
    expect(PRESETS.starter.approvals.destructive).toBe(false);
  });

  test("standard preset has balanced config", () => {
    expect(PRESETS.standard.harnesses).toEqual(["claude", "cursor"]);
    expect(PRESETS.standard.workTracker).toBe("github");
    expect(PRESETS.standard.approvals.plans).toBe(true);
    expect(PRESETS.standard.approvals.destructive).toBe(true);
    expect(PRESETS.standard.approvals.external).toBe(false);
  });

  test("full preset has everything enabled", () => {
    expect(PRESETS.full.harnesses).toEqual(["claude", "cursor", "pi"]);
    expect(PRESETS.full.workTracker).toBe("jira");
    expect(PRESETS.full.approvals.plans).toBe(true);
    expect(PRESETS.full.approvals.destructive).toBe(true);
    expect(PRESETS.full.approvals.external).toBe(true);
  });

  test("all presets have label and description", () => {
    for (const preset of Object.values(PRESETS)) {
      expect(typeof preset.label).toBe("string");
      expect(preset.label.length).toBeGreaterThan(0);
      expect(typeof preset.description).toBe("string");
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});

describe("VALID_PRESETS", () => {
  test("contains exactly three presets", () => {
    expect(VALID_PRESETS).toHaveLength(3);
  });

  test("contains starter, standard, and full", () => {
    expect(VALID_PRESETS).toContain("starter");
    expect(VALID_PRESETS).toContain("standard");
    expect(VALID_PRESETS).toContain("full");
  });

  test("matches PRESETS keys", () => {
    const presetKeys = Object.keys(PRESETS).sort();
    const validPresetsSorted = ([...VALID_PRESETS] as string[]).sort();
    expect(validPresetsSorted).toEqual(presetKeys);
  });
});

describe("DEFAULT_PRESET", () => {
  test("is standard", () => {
    expect(DEFAULT_PRESET).toBe("standard");
  });

  test("is a valid preset", () => {
    expect(VALID_PRESETS).toContain(DEFAULT_PRESET);
  });
});

describe("getPresetDefaults", () => {
  test("returns defaults for starter", () => {
    const defaults = getPresetDefaults("starter");
    expect(defaults.harnesses).toEqual(["claude"]);
    expect(defaults.workTracker).toBe("none");
  });

  test("returns defaults for standard", () => {
    const defaults = getPresetDefaults("standard");
    expect(defaults.harnesses).toEqual(["claude", "cursor"]);
    expect(defaults.workTracker).toBe("github");
  });

  test("returns defaults for full", () => {
    const defaults = getPresetDefaults("full");
    expect(defaults.harnesses).toEqual(["claude", "cursor", "pi"]);
    expect(defaults.workTracker).toBe("jira");
  });

  test("returns a copy (not the original object)", () => {
    const defaults1 = getPresetDefaults("starter");
    const defaults2 = getPresetDefaults("starter");

    // Should be equal in value
    expect(defaults1).toEqual(defaults2);

    // But not the same reference
    expect(defaults1).not.toBe(defaults2);
    expect(defaults1.harnesses).not.toBe(defaults2.harnesses);
    expect(defaults1.approvals).not.toBe(defaults2.approvals);
  });

  test("throws for invalid preset", () => {
    expect(() => {
      getPresetDefaults("invalid" as any);
    }).toThrow('Invalid preset "invalid"');
  });

  test("returned copy can be mutated without affecting original", () => {
    const defaults = getPresetDefaults("starter");
    defaults.harnesses.push("cursor");

    // Original should be unchanged
    expect(PRESETS.starter.harnesses).toEqual(["claude"]);
  });
});
