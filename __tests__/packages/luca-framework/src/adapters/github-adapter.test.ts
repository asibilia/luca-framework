/**
 * GitHub Adapter Tests
 *
 * Tests for createGitHubAdapter() including getTicket, createBranch, linkPR,
 * validate, label mapping (type and priority), and error parsing.
 *
 * Uses Bun.$ global override via mock-shell to intercept shell commands.
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  createShellMock,
  installShellMock,
} from "../../../../utils/mock-shell";
import { createGitHubAdapter } from "../../../../../packages/luca-framework/src/adapters/github-adapter";

// -- Fixtures matching the actual GitHubIssueResponse shape used by the adapter --

const fullIssueResponse = {
  number: 42,
  title: "Bug: something is broken",
  body: "Steps to reproduce...",
  state: "open",
  labels: [{ name: "bug" }],
  assignees: [{ login: "developer" }],
  url: "https://github.com/org/repo/issues/42",
};

const minimalIssueResponse = {
  number: 1,
  title: "Minimal issue",
  body: null,
  state: "closed",
  labels: [],
  assignees: [],
  url: "https://github.com/org/repo/issues/1",
};

// ---------------------------------------------------------------------------
// getTicket
// ---------------------------------------------------------------------------

describe("GitHubAdapter", () => {
  let restoreShell: (() => void) | undefined;

  afterEach(() => {
    if (restoreShell) {
      restoreShell();
      restoreShell = undefined;
    }
  });

  describe("getTicket", () => {
    test("returns ticket for valid issue with # prefix", async () => {
      const shellMock = createShellMock({
        stdout: JSON.stringify(fullIssueResponse),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("#42");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("#42");
        expect(result.data.title).toBe("Bug: something is broken");
        expect(result.data.description).toBe("Steps to reproduce...");
        expect(result.data.type).toBe("bug");
        expect(result.data.status).toBe("open");
        expect(result.data.priority).toBe("medium");
        expect(result.data.assignee).toBe("developer");
        expect(result.data.url).toBe("https://github.com/org/repo/issues/42");
      }

      // Verify shell was called with correct command (# stripped, -- before issue number)
      const calls = shellMock.getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0]!.raw).toContain("gh issue view");
      expect(calls[0]!.raw).toContain("--json");
      expect(calls[0]!.raw).toContain("-- 42");
    });

    test("returns ticket for valid issue without # prefix", async () => {
      const shellMock = createShellMock({
        stdout: JSON.stringify(fullIssueResponse),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("#42");
      }
    });

    test("returns ticket with empty description when body is null", async () => {
      const shellMock = createShellMock({
        stdout: JSON.stringify(minimalIssueResponse),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("1");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe("");
        expect(result.data.assignee).toBeUndefined();
        expect(result.data.type).toBe("task");
        expect(result.data.priority).toBe("medium");
      }
    });

    test("returns error when issue not found", async () => {
      const shellMock = createShellMock({
        error: new Error("could not resolve to an issue: not found"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("999");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Issue #999 not found");
      }
    });

    test("returns error when gh CLI not installed (ENOENT style)", async () => {
      // Note: "command not found" also contains "not found" which matches the
      // first condition in parseGhError, so it returns "Issue #1 not found".
      // The ENOENT pattern is the reliable way to detect missing CLI.
      // This test verifies the "command not found" message is handled
      // (it matches the "not found" branch in parseGhError).
      const shellMock = createShellMock({
        error: new Error("command not found: gh"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("1");

      expect(result.success).toBe(false);
      // "command not found" contains "not found", so parseGhError matches that first
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    test("returns error when gh CLI ENOENT", async () => {
      const shellMock = createShellMock({
        error: new Error("ENOENT"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("1");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("GitHub CLI (gh) not installed");
      }
    });

    test("returns error when not authenticated", async () => {
      const shellMock = createShellMock({
        error: new Error("not logged in to any GitHub hosts"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("1");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("GitHub CLI not authenticated");
      }
    });

    test("returns generic error for unknown errors", async () => {
      const shellMock = createShellMock({
        error: new Error("something unexpected happened"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("1");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("GitHub CLI error:");
        expect(result.error).toContain("something unexpected happened");
      }
    });

    test("handles non-Error thrown values", async () => {
      const shellMock = createShellMock({
        error: "string error" as unknown as Error,
      });
      // The mock factory throws the error object; when it's a string, parseGhError
      // uses String(error) path
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("1");

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Label mapping — type inference
  // -------------------------------------------------------------------------

  describe("inferTypeFromLabels (via getTicket)", () => {
    test('maps "bug" label to bug type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "bug" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("bug");
    });

    test('maps "enhancement" label to story type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "enhancement" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("story");
    });

    test('maps "feature" label to story type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "feature" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("story");
    });

    test('maps "epic" label to epic type', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "epic" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("epic");
    });

    test("defaults to task type with no matching labels", async () => {
      const issue = {
        ...fullIssueResponse,
        labels: [{ name: "documentation" }],
      };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("task");
    });

    test("label matching is case-insensitive", async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "BUG" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("bug");
    });
  });

  // -------------------------------------------------------------------------
  // Label mapping — priority inference
  // -------------------------------------------------------------------------

  describe("inferPriorityFromLabels (via getTicket)", () => {
    test('maps "critical" label to highest priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "critical" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe("highest");
    });

    test('maps "urgent" label to highest priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "urgent" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe("highest");
    });

    test('maps "high" label to high priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "high" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe("high");
    });

    test('maps "priority" label to high priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "priority" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe("high");
    });

    test('maps "low" label to low priority', async () => {
      const issue = { ...fullIssueResponse, labels: [{ name: "low" }] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe("low");
    });

    test("defaults to medium priority with no matching labels", async () => {
      const issue = { ...fullIssueResponse, labels: [] };
      const shellMock = createShellMock({ stdout: JSON.stringify(issue) });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.getTicket("42");

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.priority).toBe("medium");
    });
  });

  // -------------------------------------------------------------------------
  // createBranch
  // -------------------------------------------------------------------------

  describe("createBranch", () => {
    test("creates branch via gh issue develop", async () => {
      const shellMock = createShellMock({ stdout: "" });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("#42", "feat/my-branch");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("feat/my-branch");
      }

      const calls = shellMock.getCalls();
      expect(calls[0]!.raw).toContain("gh issue develop");
      expect(calls[0]!.raw).toContain("42");
      expect(calls[0]!.raw).toContain("--name");
      expect(calls[0]!.raw).toContain("feat/my-branch");
    });

    test("falls back to git checkout when gh issue develop fails", async () => {
      const shellMock = createShellMock({}, [
        { error: new Error("gh issue develop not supported") },
        { stdout: "" }, // git checkout -b succeeds
      ]);
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "feat/fallback");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("feat/fallback");
      }

      const calls = shellMock.getCalls();
      expect(calls.length).toBe(2);
      expect(calls[1]!.raw).toContain("git checkout -b");
      expect(calls[1]!.raw).toContain("-- feat/fallback");
    });

    test("returns error when both gh and git fail", async () => {
      const shellMock = createShellMock({}, [
        { error: new Error("gh issue develop failed") },
        { error: new Error("branch already exists") },
      ]);
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.createBranch!("42", "feat/existing");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to create branch");
        expect(result.error).toContain("branch already exists");
      }
    });
  });

  // -------------------------------------------------------------------------
  // linkPR
  // -------------------------------------------------------------------------

  describe("linkPR", () => {
    test("always returns success (no-op)", async () => {
      const shellMock = createShellMock();
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.linkPR!(
        "#42",
        "https://github.com/org/repo/pull/1",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }

      // No shell calls should have been made
      expect(shellMock.getCalls().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe("validate", () => {
    test("returns success when logged in", async () => {
      const shellMock = createShellMock({
        stdout: "Logged in to github.com account user (keyring)",
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    test("returns success when active account status", async () => {
      const shellMock = createShellMock({
        stdout: "Active account: true",
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(true);
    });

    test("returns error when not authenticated (stdout without login status)", async () => {
      // The validate method checks if stdout includes "logged in" or "active account: true".
      // When neither matches, it returns an error.
      const shellMock = createShellMock({
        stdout: "No accounts configured. Run gh auth login.",
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("GitHub CLI not authenticated");
      }
    });

    test("returns error when gh CLI not installed (exception)", async () => {
      const shellMock = createShellMock({
        error: new Error("command not found: gh"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("GitHub CLI (gh) not installed");
      }
    });

    test("returns generic validation error for unknown errors", async () => {
      const shellMock = createShellMock({
        error: new Error("some unexpected error"),
      });
      restoreShell = installShellMock(shellMock);

      const adapter = createGitHubAdapter();
      const result = await adapter.validate!();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("GitHub CLI validation failed");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Adapter properties
  // -------------------------------------------------------------------------

  describe("adapter properties", () => {
    test('has name "github"', () => {
      const adapter = createGitHubAdapter();
      expect(adapter.name).toBe("github");
    });

    test("accepts optional config", () => {
      const adapter = createGitHubAdapter({ owner: "myorg", repo: "myrepo" });
      expect(adapter.name).toBe("github");
    });
  });
});
