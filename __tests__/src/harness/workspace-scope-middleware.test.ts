/**
 * Tests for the workspace-scope middleware.
 *
 * Validates that createWorkspaceScopeMiddleware attaches scopedFiles to context,
 * passes through the check result from next, attaches workspace_changed_file_count
 * to metadata, and gracefully handles non-git directories.
 */

import { describe, test, expect } from "bun:test";
import { createWorkspaceScopeMiddleware } from "~/harness/middleware/workspace-scope";
import type {
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";
import { join } from "path";

const PROJECT_DIR = join(import.meta.dir, "../../..");

function makeCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    check: {
      name: "test",
      command: "bun test",
      enabled: true,
      timeout: 60,
      parser: "bun-test",
    },
    projectDir: PROJECT_DIR,
    metadata: {},
    ...overrides,
  };
}

function makeResult(overrides?: Partial<CheckResult>): CheckResult {
  return {
    name: "test",
    status: "passed",
    exitCode: 0,
    errors: [],
    warnings: [],
    rawOutput: "ok",
    duration: 100,
    ...overrides,
  };
}

describe("createWorkspaceScopeMiddleware", () => {
  test("attaches scopedFiles to context", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = makeCtx();
    let capturedCtx: MiddlewareContext | undefined;

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      capturedCtx = innerCtx;
      return makeResult();
    };

    await middleware(ctx, next);

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.scopedFiles).toBeDefined();
    expect(Array.isArray(capturedCtx!.scopedFiles)).toBe(true);
  });

  test("passes through the check result from next", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = makeCtx();
    const expectedResult = makeResult({
      name: "custom-check",
      status: "failed",
      exitCode: 1,
    });

    const next = async (_ctx: MiddlewareContext): Promise<CheckResult> =>
      expectedResult;

    const result = await middleware(ctx, next);

    expect(result.name).toBe("custom-check");
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
  });

  test("attaches workspace_changed_file_count to metadata", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = makeCtx();
    let capturedMetadata: Record<string, unknown> | undefined;

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      capturedMetadata = innerCtx.metadata;
      return makeResult();
    };

    await middleware(ctx, next);

    expect(capturedMetadata).toBeDefined();
    expect(capturedMetadata!.workspace_changed_file_count).toBeDefined();
    expect(typeof capturedMetadata!.workspace_changed_file_count).toBe(
      "number",
    );
  });

  test("attaches workspace_changed_files array to metadata", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = makeCtx();
    let capturedMetadata: Record<string, unknown> | undefined;

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      capturedMetadata = innerCtx.metadata;
      return makeResult();
    };

    await middleware(ctx, next);

    expect(capturedMetadata).toBeDefined();
    expect(capturedMetadata!.workspace_changed_files).toBeDefined();
    expect(Array.isArray(capturedMetadata!.workspace_changed_files)).toBe(true);
  });

  test("gracefully handles non-git directory (returns empty scopedFiles)", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = makeCtx({ projectDir: "/tmp/not-a-git-repo-" + Date.now() });
    let capturedCtx: MiddlewareContext | undefined;

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      capturedCtx = innerCtx;
      return makeResult();
    };

    await middleware(ctx, next);

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx!.scopedFiles).toEqual([]);
    expect(capturedCtx!.metadata.workspace_changed_file_count).toBe(0);
  });

  test("preserves existing metadata from context", async () => {
    const middleware = createWorkspaceScopeMiddleware();
    const ctx = makeCtx({ metadata: { existing_key: "value" } });

    const next = async (innerCtx: MiddlewareContext): Promise<CheckResult> => {
      expect(innerCtx.metadata.existing_key).toBe("value");
      expect(innerCtx.metadata.workspace_changed_file_count).toBeDefined();
      return makeResult();
    };

    await middleware(ctx, next);
  });
});
