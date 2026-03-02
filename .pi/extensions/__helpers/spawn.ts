/**
 * Shared subprocess spawning logic for Pi extensions.
 *
 * Extracts the core agent-reading and process-spawning logic from
 * luca-subagents.ts so it can be reused by luca-purpose-gating.ts
 * and luca-teams.ts for auto-spawn support.
 *
 * @security Spawns child processes via `spawn("pi", [...])`.
 *   Commands are constructed from validated parameters, not raw user input.
 *
 * Source: src/hooks/pi-extensions/__helpers/spawn.ts
 */
import { spawn } from "child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

import { parseFrontmatter } from "./frontmatter";
import { resolveAgentModel } from "./model-routing";
import { isWithinDirectory, sanitizeName } from "./sanitize";
import { subagentRegistry } from "./subagent-registry";

import type { AgentFrontmatter } from "./frontmatter";
import type { SubagentEntry } from "./subagent-registry";

/** Maximum output characters retained per subagent. */
const MAX_OUTPUT_CHARS = 8192;

/** Maximum concurrent subagents (enforced globally across all extensions). */
const MAX_SUBAGENTS = 8;

/** Maps Claude Code tool names (lowercased) to pi CLI tool names. null = drop. */
const PI_TOOL_MAP: Record<string, string | null> = {
  read: "read",
  write: "write",
  edit: "edit",
  bash: "bash",
  grep: "grep",
  glob: "find",
  websearch: null,
  webfetch: null,
  task: null,
  lsp: null,
};

/**
 * Maps Claude Code tool names (lowercased) to pi extension file paths.
 *
 * Tools that cannot be mapped to pi built-in tools (PI_TOOL_MAP = null)
 * may instead be provided by a pi extension loaded via `-e <path>`.
 * This map enables automatic extension injection when subagents declare
 * these tools in their frontmatter.
 *
 * websearch → luca-search.ts: Provides Google Custom Search via
 *   the luca_web_search tool (requires GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID).
 * webfetch stays unmapped: no extension equivalent yet.
 */
const EXTENSION_TOOL_MAP: Record<string, string> = {
  websearch: ".pi/extensions/luca-search.ts",
};

/**
 * Map Claude Code tool names to pi-compatible names, dropping unmappable ones.
 *
 * Pi's valid tools are: read, bash, edit, write, grep, find, ls.
 * Agent frontmatter uses Claude Code names (Read, Glob, WebSearch, etc.)
 * which need translation. MCP tool prefixes are silently dropped.
 *
 * @param tools - Array of Claude Code tool names
 * @returns Array of pi-compatible tool names
 */
export function mapToolsForPi(tools: string[]): string[] {
  const mapped: string[] = [];
  for (const tool of tools) {
    const lower = tool.toLowerCase();
    if (lower.startsWith("mcp__") || lower.startsWith("mcp_")) continue;
    const piTool = PI_TOOL_MAP[lower];
    if (piTool) mapped.push(piTool);
  }
  return mapped;
}

/**
 * Determine which pi extensions are required for a set of Claude Code tools.
 *
 * Looks up each tool in EXTENSION_TOOL_MAP and returns a deduplicated
 * list of extension file paths that must be loaded via `-e` flags.
 *
 * @param tools - Array of Claude Code tool names (e.g., ["Read", "WebSearch"])
 * @returns Deduplicated array of extension file paths
 */
export function getRequiredExtensions(tools: string[]): string[] {
  const extensions = new Set<string>();
  for (const tool of tools) {
    const ext = EXTENSION_TOOL_MAP[tool.toLowerCase()];
    if (ext) extensions.add(ext);
  }
  return [...extensions];
}

/**
 * Detect AI provider from env vars for pi subprocesses.
 *
 * Checks PI_PROVIDER first (explicit override), then falls back to
 * detecting provider from API key env vars. The API key itself is
 * NOT passed as a CLI arg for security (visible in `ps`); the
 * subprocess inherits process.env so pi auto-detects from env vars.
 *
 * @returns Provider name or undefined if none detected
 */
export function detectPiProvider(): string | undefined {
  const env = process.env;
  if (env.PI_PROVIDER) return env.PI_PROVIDER;
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GOOGLE_API_KEY || env.GEMINI_API_KEY) return "google";
  if (env.OPENAI_API_KEY) return "openai";
  return undefined;
}

/** Result of reading an agent definition file. */
export interface AgentDef {
  systemPrompt: string;
  model?: string;
  tools?: string[];
  frontmatter: AgentFrontmatter | null;
}

/** Payload delivered to the onComplete callback when a subagent exits. */
export interface SpawnCompletionInfo {
  id: string;
  agent: string;
  status: "completed" | "failed";
  output: string;
  elapsed: number;
  exitCode: number;
}

/** Options for spawning a subagent process. */
export interface SpawnOptions {
  id: string;
  agentName: string;
  task: string;
  cwd: string;
  model?: string;
  tools?: string[];
  systemPrompt?: string;
  continueSession?: boolean;
  sessionDir?: string;
  source?: string;
  /**
   * Callback invoked when the subagent process exits.
   * Errors thrown inside the callback are silently caught to avoid
   * crashing the process close handler.
   */
  onComplete?: (info: SpawnCompletionInfo) => void;
}

/**
 * Read agent definition from .pi/agents/ directory.
 *
 * Parses the YAML frontmatter to extract model, tools, purpose,
 * background_spawnable, and allowed_contexts. Returns the full
 * system prompt (body after frontmatter).
 *
 * @param cwd - Working directory (project root)
 * @param agentName - Agent filename (without .md)
 * @returns Agent definition, or null if not found
 */
export function readAgentDef(cwd: string, agentName: string): AgentDef | null {
  const safeName = sanitizeName(agentName);
  const filePath = join(cwd, ".pi", "agents", `${safeName}.md`);
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf-8");
  const frontmatter = parseFrontmatter(content);

  // Extract body (after frontmatter block)
  const bodyStart = content.indexOf("---", 4);
  const systemPrompt =
    bodyStart > 0 ? content.slice(bodyStart + 3).trim() : content;

  return {
    systemPrompt,
    model: frontmatter?.model,
    tools: frontmatter?.tools,
    frontmatter,
  };
}

/**
 * Write a system prompt to a temp file for --append-system-prompt.
 * Returns the file path. Caller must clean up.
 *
 * @param agentName - Agent name (used in filename)
 * @param prompt - System prompt content
 * @returns Path to the temp file
 */
export function writePromptFile(agentName: string, prompt: string): string {
  const dir = mkdtempSync(join(tmpdir(), "luca-subagent-"));
  const safeName = sanitizeName(agentName);
  const filePath = join(dir, `prompt-${safeName}.md`);
  writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return filePath;
}

/**
 * Create a session directory for a subagent.
 *
 * @param id - Subagent ID (used in directory name)
 * @returns Path to the created directory
 */
export function createSessionDir(id: string): string {
  const safeName = sanitizeName(id);
  const dir = mkdtempSync(join(tmpdir(), `luca-sub-session-${safeName}-`));
  chmodSync(dir, 0o700);
  return dir;
}

/**
 * Clean up a subagent's session directory.
 *
 * @param dir - Path to the session directory
 */
export function cleanupSessionDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Spawn a subagent process and return tracked state.
 *
 * Creates a `pi --mode json` subprocess with stdout/stderr capture,
 * usage tracking, and lifecycle management.
 *
 * @param opts - Spawn options
 * @returns Tracked subagent state entry
 */
export function spawnPiSubprocess(opts: SpawnOptions): SubagentEntry {
  // Enforce global subagent limit across all extensions
  const running = subagentRegistry
    .values()
    .filter((s) => s.status === "running");
  if (running.length >= MAX_SUBAGENTS) {
    throw new Error(
      `Maximum ${MAX_SUBAGENTS} concurrent subagents reached. Remove or wait for existing ones to complete.`,
    );
  }

  // Validate session directory is within temp (M4: path traversal guard)
  if (opts.sessionDir && !isWithinDirectory(opts.sessionDir, tmpdir())) {
    throw new Error(
      `Session directory "${opts.sessionDir}" is outside the temp directory. Possible path traversal.`,
    );
  }

  const sessionDir = opts.sessionDir ?? createSessionDir(opts.id);

  // Auto-resolve model from agent frontmatter if no explicit model provided
  let effectiveModel = opts.model;
  if (!effectiveModel) {
    const agentDef = readAgentDef(opts.cwd, opts.agentName);
    if (agentDef?.frontmatter) {
      effectiveModel = resolveAgentModel(agentDef.frontmatter, opts.cwd);
    }
  }

  const state: SubagentEntry = {
    id: opts.id,
    agent: opts.agentName,
    task: opts.task,
    status: "running",
    output: "",
    stderr: "",
    exitCode: -1,
    usage: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
    model: effectiveModel,
    createdAt: Date.now(),
    completedAt: undefined,
    process: undefined,
    sessionDir,
    source: opts.source,
  };

  const args: string[] = ["--mode", "json", "-p", "--no-extensions"];
  if (opts.continueSession) {
    args.push("--continue", "--session-dir", sessionDir);
  } else {
    args.push("--session-dir", sessionDir);
  }
  if (effectiveModel) args.push("--model", effectiveModel);
  if (opts.tools && opts.tools.length > 0) {
    const piTools = mapToolsForPi(opts.tools);
    if (piTools.length > 0) {
      args.push("--tools", piTools.join(","));
    }

    // Inject -e flags for tools provided by extensions (e.g., WebSearch → luca-web.ts)
    const requiredExtensions = getRequiredExtensions(opts.tools);
    for (const ext of requiredExtensions) {
      args.push("-e", ext);
    }
  }

  const provider = detectPiProvider();
  if (provider) {
    args.push("--provider", provider);
  }

  let promptFile: string | undefined;
  if (opts.systemPrompt) {
    promptFile = writePromptFile(opts.agentName, opts.systemPrompt);
    args.push("--append-system-prompt", promptFile);
  }

  const MAX_TASK_LENGTH = 10000;
  const taskStr = (opts.task || "").slice(0, MAX_TASK_LENGTH);
  args.push(`Task: ${taskStr}`);

  const proc = spawn("pi", args, {
    cwd: opts.cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  state.process = proc;

  let buffer = "";

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) return;
    try {
      const event = JSON.parse(trimmed);
      if (event.type === "message_end" && event.message) {
        const msg = event.message;
        if (msg.role === "assistant") {
          state.usage.turns++;
          if (msg.usage) {
            state.usage.inputTokens += msg.usage.input ?? 0;
            state.usage.outputTokens += msg.usage.output ?? 0;
            state.usage.cost += msg.usage.cost?.total ?? 0;
          }
          if (!state.model && msg.model) state.model = msg.model;

          // Capture final text output
          for (const part of msg.content ?? []) {
            if (part.type === "text") {
              state.output = part.text.slice(-MAX_OUTPUT_CHARS);
            }
          }
        }
      }
    } catch {
      // Non-JSON line, ignore
    }
  };

  proc.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) processLine(line);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    state.stderr += data.toString();
    if (state.stderr.length > MAX_OUTPUT_CHARS) {
      state.stderr = state.stderr.slice(-MAX_OUTPUT_CHARS);
    }
  });

  proc.on("close", (code) => {
    if (buffer.trim()) processLine(buffer);
    state.exitCode = code ?? 1;
    state.status = code === 0 ? "completed" : "failed";
    state.completedAt = Date.now();
    state.process = undefined;

    // Clean up temp prompt file and its directory
    if (promptFile) {
      try {
        rmSync(dirname(promptFile), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    // Invoke completion callback (if provided)
    if (opts.onComplete) {
      try {
        opts.onComplete({
          id: state.id,
          agent: state.agent,
          status: state.status as "completed" | "failed",
          output: state.output,
          elapsed: state.completedAt - state.createdAt,
          exitCode: state.exitCode,
        });
      } catch {
        // Never let callback errors crash the process handler
      }
    }
  });

  proc.on("error", () => {
    state.exitCode = 1;
    state.status = "failed";
    state.completedAt = Date.now();
    state.process = undefined;

    // Invoke completion callback on error (if provided)
    if (opts.onComplete) {
      try {
        opts.onComplete({
          id: state.id,
          agent: state.agent,
          status: "failed",
          output: state.output,
          elapsed: (state.completedAt ?? Date.now()) - state.createdAt,
          exitCode: state.exitCode,
        });
      } catch {
        // Never let callback errors crash the process handler
      }
    }
  });

  return state;
}
