import { describe, test, expect } from "bun:test";

import { bunRuntimeCheck } from "../../../../../../../packages/luca-framework/src/utils/doctor/checks/bun-runtime";

describe("bunRuntimeCheck", () => {
  test("has correct name", () => {
    expect(bunRuntimeCheck.name).toBe("Bun Runtime");
  });

  test("passes when running under Bun (current environment)", async () => {
    const result = await bunRuntimeCheck.run();

    expect(result.status).toBe("pass");
    expect(result.message).toContain("Bun");
    expect(result.message).toContain("1.0.0+ required");
    expect(result.fixCommand).toBeNull();
    expect(result.details).toBeNull();
  });

  test("result name matches check name", async () => {
    const result = await bunRuntimeCheck.run();
    expect(result.name).toBe("Bun Runtime");
  });

  test("includes current Bun version in message", async () => {
    const result = await bunRuntimeCheck.run();
    expect(result.message).toContain(Bun.version);
  });
});
