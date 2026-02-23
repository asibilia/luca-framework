/**
 * GitHub Adapter Shell Hardening Tests
 *
 * Tests for input validation (validateBranchName, validateIssueNumber),
 * `--` argument markers in Bun.$ calls, and error message sanitization
 * in parseGhError.
 *
 * Uses Bun.$ global override via mock-shell to intercept shell commands.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  createShellMock,
  installShellMock,
} from "../../../../utils/mock-shell";
import { createGitHubAdapter } from "../../../../../packages/luca-framework/src/adapters/github-adapter";

// -- Fixtures --

const validIssueResponse = {
  number: 42,
  title: "Test issue",
  body: "Test body",
  state: "open",
  labels: [{ name: "bug" }],
  assignees: [{ login: "developer" }],
  url: "https://github.com/org/repo/issues/42",
};

// ---------------------------------------------------------------------------
// validateBranchName (tested indirectly via createBranch)
// ---------------------------------------------------------------------------

describe("GitHubAdapter Security", () => {
  let restoreShell: (() => void) | undefined;

  afterEach(() => {
    if (restoreShell) {
      restoreShell();
      restoreShell = undefined;
    }
  });

  describe("validateBranchName (via createBranch)", () => {
    test("rejects empty branch name", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Branch name is required");
      }
      // No shell calls should have been made
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name starting with -", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "--delete");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot start with -");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name containing ..", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "main..dev");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot contain ..");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name with whitespace", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "my branch");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("invalid characters");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name with tilde", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "branch~1");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("invalid characters");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name ending with .lock", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "refs.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot end with .lock");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name ending with .", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "branch.");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot end with .");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects branch name containing //", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "feat//branch");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot contain //");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("accepts valid branch names", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!(
        "42",
        "feat/valid-branch-name",
      );

      expect(result.success).toBe(true);
      // Should have made at least one shell call
      expect(shellMock.getCalls().length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateIssueNumber (tested indirectly via getTicket)
  // -------------------------------------------------------------------------

  describe("validateIssueNumber (via getTicket)", () => {
    test("rejects non-numeric issue number", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("--json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Issue number must be numeric");
      }
      // No shell calls should have been made
      expect(shellMock.getCalls().length).toBe(0);
    });

    test("rejects issue number with special characters", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42; rm -rf /");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Issue number must be numeric");
      }
      expect(shellMock.getCalls().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // -- markers in Bun.$ calls
  // -------------------------------------------------------------------------

  describe("-- argument markers", () => {
    test("getTicket uses -- before issue number in shell command", async () => {
      const shellMock = createShellMock({
        stdout: JSON.stringify(validIssueResponse),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      await adapter.getTicket("42");

      const calls = shellMock.getCalls();
      expect(calls.length).toBe(1);
      const raw = calls[0]!.raw;

      // --json should come before --, and -- should come before the issue number
      expect(raw).toContain("--json");
      expect(raw).toContain("-- 42");
      const jsonIndex = raw.indexOf("--json");
      const dashDashIndex = raw.indexOf("-- 42");
      expect(jsonIndex).toBeLessThan(dashDashIndex);
    });

    test("createBranch git fallback uses -- before branch name", async () => {
      const shellMock = createShellMock({}, [
        { error: new Error("gh issue develop not supported") },
        { stdout: "" }, // git checkout -b succeeds
      ]);
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      await adapter.createBranch!("42", "feat/test-branch");

      const calls = shellMock.getCalls();
      expect(calls.length).toBe(2);

      // Second call is git checkout -b -- <branchName>
      const gitCall = calls[1]!;
      expect(gitCall.raw).toContain("git checkout -b");
      expect(gitCall.raw).toContain("-- feat/test-branch");
    });
  });

  // -------------------------------------------------------------------------
  // Error sanitization in parseGhError
  // -------------------------------------------------------------------------

  describe("parseGhError sanitization", () => {
    test("redacts token patterns from error messages", async () => {
      const shellMock = createShellMock({
        error: new Error("Request failed: token ghp_abc123def456 is expired"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain("ghp_abc123def456");
        expect(result.error).toContain("[REDACTED]");
      }
    });

    test("redacts bearer patterns from error messages", async () => {
      const shellMock = createShellMock({
        error: new Error(
          "HTTP 401: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9 invalid",
        ),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain(
          "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
        );
        expect(result.error).toContain("[REDACTED]");
      }
    });

    test("redacts github_pat_ patterns from error messages", async () => {
      const shellMock = createShellMock({
        error: new Error(
          "Auth error with github_pat_11AAAAAA_xxxxxxxxxxxxx credential",
        ),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).not.toContain("github_pat_11AAAAAA_xxxxxxxxxxxxx");
        expect(result.error).toContain("[REDACTED]");
      }
    });
  });
});
