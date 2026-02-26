import { describe, test, expect } from "bun:test";
import type {
  ParsedError,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";
import {
  classifySingleError,
  classifyErrors,
  partitionByClass,
} from "../../../src/iteration/__helpers/classifier";

function makeError(overrides: Partial<ParsedError> = {}): ParsedError {
  return {
    file: "src/test.ts",
    line: 1,
    message: "test error",
    severity: "error",
    ...overrides,
  };
}

function makeCheckResult(
  name: string,
  errors: ParsedError[] = [],
): CheckResult {
  return {
    name,
    status: errors.length > 0 ? "failed" : "passed",
    exitCode: errors.length > 0 ? 1 : 0,
    errors,
    warnings: [],
    rawOutput: "",
    duration: 100,
  };
}

describe("classifySingleError", () => {
  test("test failure classified as correctable", () => {
    const result = classifySingleError(makeError(), "test", {});
    expect(result.classification).toBe("correctable");
  });

  test("typecheck error classified as correctable", () => {
    const result = classifySingleError(
      makeError({ code: "TS2322" }),
      "typecheck",
      {},
    );
    expect(result.classification).toBe("correctable");
  });

  test("build failure classified as transient", () => {
    const result = classifySingleError(
      makeError({ message: "Build failed" }),
      "build",
      {},
    );
    expect(result.classification).toBe("transient");
  });

  test("'Cannot find module' message overrides to permanent", () => {
    const result = classifySingleError(
      makeError({ message: "Cannot find module '@missing/pkg'" }),
      "typecheck",
      {},
    );
    expect(result.classification).toBe("permanent");
  });

  test("ECONNREFUSED message overrides to transient", () => {
    const result = classifySingleError(
      makeError({ message: "connect ECONNREFUSED 127.0.0.1:5432" }),
      "test",
      {},
    );
    expect(result.classification).toBe("transient");
  });

  test("after 3 iterations, correctable promotes to permanent", () => {
    const error = makeError({ message: "Expected true, got false" });
    const fp = classifySingleError(error, "test", {}).fingerprint;

    // Ledger shows this fingerprint appeared in 2 previous iterations
    const ledger = { [fp]: 2 };
    const result = classifySingleError(error, "test", ledger, 3);
    // iterationsSeen = 2 + 1 = 3, which equals promotionThreshold
    expect(result.classification).toBe("permanent");
    expect(result.iterations_seen).toBe(3);
  });

  test("after 2 iterations, correctable stays correctable", () => {
    const error = makeError({ message: "Expected true, got false" });
    const fp = classifySingleError(error, "test", {}).fingerprint;

    const ledger = { [fp]: 1 };
    const result = classifySingleError(error, "test", ledger, 3);
    // iterationsSeen = 1 + 1 = 2, which is less than promotionThreshold=3
    expect(result.classification).toBe("correctable");
    expect(result.iterations_seen).toBe(2);
  });

  test("unknown check name defaults to correctable", () => {
    const result = classifySingleError(makeError(), "unknown-check", {});
    expect(result.classification).toBe("correctable");
  });
});

describe("classifyErrors", () => {
  test("processes all checks and all errors within each check", () => {
    const checks = [
      makeCheckResult("test", [makeError(), makeError({ line: 10 })]),
      makeCheckResult("typecheck", [makeError({ file: "src/other.ts" })]),
    ];
    const { classified, updated_ledger } = classifyErrors(checks, {});
    expect(classified).toHaveLength(3);
    expect(Object.keys(updated_ledger).length).toBeGreaterThan(0);
  });

  test("updates ledger correctly (increments iteration count)", () => {
    const error = makeError();
    const checks = [makeCheckResult("test", [error])];
    const { updated_ledger } = classifyErrors(checks, {});

    // Run again with the updated ledger
    const { updated_ledger: ledger2 } = classifyErrors(checks, updated_ledger);

    // The fingerprint should now show 2 iterations
    const fps = Object.values(ledger2);
    expect(fps.some((count) => count === 2)).toBe(true);
  });

  test("returns both classified errors and updated ledger", () => {
    const checks = [makeCheckResult("test", [makeError()])];
    const result = classifyErrors(checks, {});
    expect(result).toHaveProperty("classified");
    expect(result).toHaveProperty("updated_ledger");
    expect(Array.isArray(result.classified)).toBe(true);
    expect(typeof result.updated_ledger).toBe("object");
  });

  test("empty checks array returns empty classified and unchanged ledger", () => {
    const { classified, updated_ledger } = classifyErrors([], {});
    expect(classified).toHaveLength(0);
    expect(updated_ledger).toEqual({});
  });
});

describe("partitionByClass", () => {
  test("correctly separates into transient, correctable, permanent arrays", () => {
    const errors = [
      {
        fingerprint: "fp1",
        source: "test",
        classification: "correctable" as const,
        iterations_seen: 1,
        message: "err1",
      },
      {
        fingerprint: "fp2",
        source: "build",
        classification: "transient" as const,
        iterations_seen: 1,
        message: "err2",
      },
      {
        fingerprint: "fp3",
        source: "test",
        classification: "permanent" as const,
        iterations_seen: 3,
        message: "err3",
      },
      {
        fingerprint: "fp4",
        source: "typecheck",
        classification: "correctable" as const,
        iterations_seen: 1,
        message: "err4",
      },
    ];
    const partitioned = partitionByClass(errors);
    expect(partitioned.transient).toHaveLength(1);
    expect(partitioned.correctable).toHaveLength(2);
    expect(partitioned.permanent).toHaveLength(1);
  });

  test("empty input returns three empty arrays", () => {
    const partitioned = partitionByClass([]);
    expect(partitioned.transient).toHaveLength(0);
    expect(partitioned.correctable).toHaveLength(0);
    expect(partitioned.permanent).toHaveLength(0);
  });
});
