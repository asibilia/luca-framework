/**
 * Luca Work Tracking Extension for Pi
 *
 * Enforces that all code changes are backed by a tracked work item:
 * a pending todo, a GitHub issue, and a feature branch. Warns (or blocks)
 * on untracked edits and provides tools to start/check tracking.
 *
 * Flow:
 *   1. luca_track_work — link session to a todo, create GH issue + branch
 *   2. Make changes (extension validates tracking is active)
 *   3. luca_work_status — check current tracking state at any time
 *
 * Source: src/hooks/pi-extensions/luca-work-tracking.ts
 * Deployed to: .pi/extensions/luca-work-tracking.ts
 */
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";

import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { sanitizeName } from "./__helpers/sanitize";

/** Current work tracking state for the session. */
interface WorkTrackingState {
  /** Active todo slug (filename without .md), or null. */
  todo: string | null;
  /** Todo title for display. */
  todoTitle: string | null;
  /** GitHub issue number, or null. */
  issueNumber: number | null;
  /** Current git branch name. */
  branch: string | null;
  /** Whether tracking is considered active (todo + issue + feature branch). */
  tracked: boolean;
  /** Enforcement mode: "warn" shows warnings, "block" prevents changes, "off" disables. */
  mode: "warn" | "block" | "off";
}

/** Tools that modify code and should be gated. */
const MUTATION_TOOLS = new Set(["edit", "write"]);

/** Parse todo frontmatter title from a .md file. */
function parseTodoTitle(content: string): string | null {
  const match = content.match(/^---\n[\s\S]*?^title:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/** Parse todo frontmatter area from a .md file. */
function parseTodoArea(content: string): string | null {
  const match = content.match(/^---\n[\s\S]*?^area:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

/**
 * Run a shell command and return trimmed stdout, or null on failure.
 */
function run(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, {
      cwd,
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Pi extension: Work tracking enforcement.
 *
 * Registers tools for linking sessions to todos/issues and hooks
 * into mutation tool calls to warn or block untracked changes.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaWorkTracking(pi: any) {
  const cwd = process.cwd();
  const todosDir = join(cwd, ".planning", "todos", "pending");

  /** Session tracking state. */
  const state: WorkTrackingState = {
    todo: null,
    todoTitle: null,
    issueNumber: null,
    branch: null,
    tracked: false,
    mode: "warn",
  };

  /** Count of warnings issued this session (to avoid spamming). */
  let warningCount = 0;
  const MAX_WARNINGS = 3;

  /**
   * Detect current branch and try to infer tracking from it.
   * Feature branches follow: {issue_number}--{description}
   *
   * Called per-tool-invocation intentionally: the branch may change
   * between tool calls (e.g., after luca_track_work creates a new branch).
   */
  function detectBranchTracking(): void {
    state.branch = run("git branch --show-current", cwd);
    if (!state.branch) return;

    // Check if on a feature branch matching {number}--{description}
    const branchMatch = state.branch.match(/^(\d+)--(.+)/);
    if (branchMatch?.[1]) {
      state.issueNumber = parseInt(branchMatch[1], 10);
    }
  }

  /**
   * Refresh the tracked status based on current state fields.
   */
  function refreshTracked(): void {
    state.tracked =
      state.todo !== null &&
      state.issueNumber !== null &&
      state.branch !== null &&
      state.branch !== "main" &&
      state.branch !== "master";
  }

  // ─── Tool: Track Work ──────────────────────────────────

  pi.registerTool({
    name: "luca_track_work",
    label: "Track Work",
    description:
      "Link the current session to a todo for tracked development. " +
      "Creates a GitHub issue from the todo if one doesn't exist, and " +
      "creates/switches to a feature branch. Use before making changes.",
    parameters: {
      type: "object",
      properties: {
        todo: {
          type: "string",
          description:
            "Todo slug (filename without .md) from .planning/todos/pending/, " +
            "or 'new' to create an inline todo. Use luca_list_todos to see available.",
        },
        title: {
          type: "string",
          description: "Title for a new inline todo (required when todo='new')",
        },
        area: {
          type: "string",
          description:
            "Area for a new inline todo (e.g., 'pi-extensions', 'agents'). Defaults to 'general'.",
        },
      },
      required: ["todo"],
    },
    async execute(
      _toolCallId: string,
      params: { todo: string; title?: string; area?: string },
    ) {
      // Handle 'new' inline todo
      if (params.todo === "new") {
        if (!params.title) {
          return createTextResponse(
            'When todo="new", a title is required. Provide title parameter.',
          );
        }
        const slug = sanitizeName(
          params.title.toLowerCase().replace(/\s+/g, "-"),
        );
        const area = params.area ?? "general";
        const todoPath = join(todosDir, `${slug}.md`);

        // Create the todo file
        const now = new Date().toISOString();
        const todoContent = `---\ntitle: ${params.title}\narea: ${area}\ncreated: ${now}\nsource: luca-work-tracking\n---\n\n## Task\n\n${params.title}\n`;

        try {
          mkdirSync(todosDir, { recursive: true });
          writeFileSync(todoPath, todoContent, "utf-8");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return createTextResponse(`Failed to create todo: ${msg}`);
        }

        state.todo = slug;
        state.todoTitle = params.title;
      } else {
        // Load existing todo
        const todoPath = join(todosDir, `${params.todo}.md`);
        if (!existsSync(todoPath)) {
          const available = existsSync(todosDir)
            ? readdirSync(todosDir)
                .filter((f) => f.endsWith(".md"))
                .map((f) => f.replace(".md", ""))
                .join(", ")
            : "none";
          return createTextResponse(
            `Todo "${params.todo}" not found in ${todosDir}/. Available: ${available || "none"}`,
          );
        }
        const content = readFileSync(todoPath, "utf-8");
        state.todo = params.todo;
        state.todoTitle = parseTodoTitle(content) ?? params.todo;
      }

      // Create GitHub issue if not already linked
      if (!state.issueNumber) {
        const issueTitle = state.todoTitle ?? state.todo;
        const issueBody = `Tracked by todo: \`.planning/todos/pending/${state.todo}.md\``;
        const result = run(
          `gh issue create --title "${issueTitle?.replace(/"/g, '\\"')}" --body "${issueBody}" 2>&1`,
          cwd,
        );

        if (result) {
          // Parse issue number from URL: https://github.com/.../issues/123
          const issueMatch = result.match(/\/issues\/(\d+)/);
          if (issueMatch?.[1]) {
            state.issueNumber = parseInt(issueMatch[1], 10);
          }
        }

        if (!state.issueNumber) {
          return createTextResponse(
            `Todo "${state.todo}" linked, but failed to create GitHub issue. ` +
              `Check that \`gh\` CLI is authenticated. You can manually set an issue with luca_link_issue.`,
          );
        }
      }

      // Create/switch to feature branch
      const branchName = `${state.issueNumber}--${sanitizeName(state.todo!)}`;
      const currentBranch = run("git branch --show-current", cwd);

      if (currentBranch !== branchName) {
        // Check if branch already exists
        const branchExists =
          run(`git rev-parse --verify ${branchName}`, cwd) !== null;
        if (branchExists) {
          run(`git checkout ${branchName}`, cwd);
        } else {
          run(`git checkout -b ${branchName}`, cwd);
        }
        state.branch = branchName;
      } else {
        state.branch = currentBranch;
      }

      refreshTracked();
      warningCount = 0;

      return createJsonResponse({
        tracked: state.tracked,
        todo: state.todo,
        title: state.todoTitle,
        issue: state.issueNumber,
        branch: state.branch,
        message: state.tracked
          ? `[OK] Work tracked: #${state.issueNumber} on branch ${state.branch}`
          : "Partially tracked — see missing fields above.",
      });
    },
  });

  // ─── Tool: Link Issue ──────────────────────────────────

  pi.registerTool({
    name: "luca_link_issue",
    label: "Link Issue",
    description:
      "Manually link the current session to an existing GitHub issue number. " +
      "Use when an issue already exists and you want to skip auto-creation.",
    parameters: {
      type: "object",
      properties: {
        issue: {
          type: "number",
          description: "GitHub issue number to link",
        },
      },
      required: ["issue"],
    },
    async execute(_toolCallId: string, params: { issue: number }) {
      detectBranchTracking();
      // Explicit link takes priority over branch-inferred issue
      state.issueNumber = params.issue;
      refreshTracked();

      return createJsonResponse({
        tracked: state.tracked,
        issue: state.issueNumber,
        branch: state.branch,
        todo: state.todo,
        message: `Linked to issue #${params.issue}.${!state.todo ? " No todo linked yet — use luca_track_work to link one." : ""}`,
      });
    },
  });

  // ─── Helpers ───────────────────────────────────────────

  /**
   * Get the GitHub repo slug (owner/repo) from git remote.
   */
  function getRepoSlug(): string {
    const remote = run("git remote get-url origin", cwd);
    if (!remote) return "unknown/unknown";
    // Handle both HTTPS and SSH formats
    const match = remote.match(
      /(?:github\.com[:/])([^/]+\/[^/.]+?)(?:\.git)?$/,
    );
    return match?.[1] ?? "unknown/unknown";
  }

  // ─── Tool: Work Status ─────────────────────────────────

  pi.registerTool({
    name: "luca_work_status",
    label: "Work Status",
    description:
      "Check current work tracking status: active todo, GitHub issue, branch, and enforcement mode.",
    parameters: {},
    async execute() {
      detectBranchTracking();
      refreshTracked();

      return createJsonResponse({
        tracked: state.tracked,
        todo: state.todo,
        title: state.todoTitle,
        issue: state.issueNumber
          ? {
              number: state.issueNumber,
              url: `https://github.com/${getRepoSlug()}/issues/${state.issueNumber}`,
            }
          : null,
        branch: state.branch,
        mode: state.mode,
        warnings_issued: warningCount,
        checklist: {
          todo: state.todo !== null ? "[OK]" : "[FAIL] use luca_track_work",
          issue:
            state.issueNumber !== null
              ? "[OK]"
              : "[FAIL] use luca_track_work or luca_link_issue",
          branch:
            state.branch && state.branch !== "main" && state.branch !== "master"
              ? "[OK]"
              : "[FAIL] not on a feature branch",
        },
      });
    },
  });

  // ─── Tool: List Todos ──────────────────────────────────

  pi.registerTool({
    name: "luca_list_todos",
    label: "List Todos",
    description:
      "List all pending todos from .planning/todos/pending/ for work tracking selection.",
    parameters: {
      type: "object",
      properties: {
        area: {
          type: "string",
          description: "Filter by area (optional)",
        },
      },
    },
    async execute(_toolCallId: string, params: { area?: string }) {
      if (!existsSync(todosDir)) {
        return createJsonResponse({
          todos: [],
          message: "No pending todos directory found.",
        });
      }

      const files = readdirSync(todosDir).filter((f) => f.endsWith(".md"));
      const todos = files.map((f) => {
        const content = readFileSync(join(todosDir, f), "utf-8");
        const title = parseTodoTitle(content);
        const area = parseTodoArea(content);
        return {
          slug: f.replace(".md", ""),
          title: title ?? f.replace(".md", ""),
          area: area ?? "unknown",
        };
      });

      const filtered = params.area
        ? todos.filter((t) => t.area === params.area)
        : todos;

      return createJsonResponse({
        total: filtered.length,
        todos: filtered,
      });
    },
  });

  // ─── Tool: Set Tracking Mode ───────────────────────────

  pi.registerTool({
    name: "luca_set_tracking_mode",
    label: "Set Tracking Mode",
    description:
      "Set work tracking enforcement mode: 'warn' (advisory warnings on untracked edits), " +
      "'block' (prevent untracked edits), or 'off' (disable tracking checks).",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "Enforcement mode: warn, block, or off",
        },
      },
      required: ["mode"],
    },
    async execute(_toolCallId: string, params: { mode: string }) {
      const validModes = ["warn", "block", "off"];
      if (!validModes.includes(params.mode)) {
        return createTextResponse(
          `Invalid mode "${params.mode}". Use: ${validModes.join(", ")}`,
        );
      }
      state.mode = params.mode as "warn" | "block" | "off";
      return createTextResponse(
        `Work tracking mode set to "${state.mode}".` +
          (state.mode === "block"
            ? " Untracked edits will be blocked."
            : state.mode === "warn"
              ? " Untracked edits will show warnings."
              : " Tracking checks disabled."),
      );
    },
  });

  // ─── Event: Gate mutation tools ────────────────────────

  pi.on("tool_call", async (event: any, ctx: any) => {
    const toolName: string = event?.toolName ?? "";

    // Only gate mutation tools
    if (!MUTATION_TOOLS.has(toolName)) return;

    // Skip if tracking is off or already tracked
    if (state.mode === "off") return;
    refreshTracked();
    if (state.tracked) return;

    // Build warning message
    const missing: string[] = [];
    if (!state.todo) missing.push("todo");
    if (!state.issueNumber) missing.push("GitHub issue");
    if (!state.branch || state.branch === "main" || state.branch === "master") {
      missing.push("feature branch");
    }

    const warning =
      `[WARN] Untracked change detected -- missing: ${missing.join(", ")}. ` +
      `Use luca_track_work to link this session to a todo before making changes.`;

    if (state.mode === "block") {
      return { block: true, reason: warning };
    }

    // Warn mode: show warning but allow the change
    if (state.mode === "warn" && warningCount < MAX_WARNINGS) {
      warningCount++;
      if (ctx?.ui?.setStatus) {
        ctx.ui.setStatus(
          "luca-tracking",
          `[WARN] UNTRACKED${warningCount >= MAX_WARNINGS ? " (muted)" : ""}`,
        );
      }
    }
  });

  // ─── Event: Auto-detect tracking on session start ──────

  pi.on("session_start", async (_event: any, ctx: any) => {
    detectBranchTracking();
    refreshTracked();

    if (ctx?.ui?.setStatus) {
      if (state.tracked) {
        ctx.ui.setStatus(
          "luca-tracking",
          `# #${state.issueNumber} ${state.branch}`,
        );
      } else if (state.issueNumber) {
        ctx.ui.setStatus(
          "luca-tracking",
          `# #${state.issueNumber} (no todo linked)`,
        );
      }
    }
  });
}
