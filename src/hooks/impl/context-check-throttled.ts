/**
 * context-check-throttled — PostToolUse throttled context monitor.
 *
 * Runs on a throttled basis (60s). Checks for urgent developer notes,
 * reads context metrics from statusline or estimates from transcript size,
 * detects zone worsening, and emits warnings for degrading/stop zones.
 *
 * Always exits 0 — async hook, non-blocking.
 *
 * @module context-check-throttled
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  mkdirSync,
  statSync,
} from "fs";
import { join, basename } from "path";

import {
  guardDedup,
  projectHash,
  exitSuccess,
  projectDir,
} from "./__helpers/hook-io.ts";
import { runBridge } from "./__helpers/bridge.ts";
import { resolveVault } from "./__helpers/vault.ts";
import { writeMuninnEngram } from "./__helpers/muninn.ts";

import type { SessionObservation } from "../__schemas/hook.schemas.ts";

// ─── Dedup guard ─────────────────────────────────────────────────────────────
guardDedup("context-check-throttled");

// ─── Zone Severity ───────────────────────────────────────────────────────────

const zoneSeverity = (zone: string): number => {
  switch (zone) {
    case "peak":
      return 0;
    case "good":
      return 1;
    case "degrading":
      return 2;
    case "stop":
      return 3;
    default:
      return 0;
  }
};

// ─── Main ────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // --- Throttle check ---
  const hash = projectHash();
  const throttleFile = `/tmp/.luca-context-check-${hash}-ts`;
  const throttleSeconds = 60;

  // Detect first invocation: throttle file does not exist yet
  const isFirstInvocation = !existsSync(throttleFile);

  if (!isFirstInvocation) {
    try {
      const lastCheck = parseInt(
        readFileSync(throttleFile, "utf-8").trim(),
        10,
      );
      const now = Math.floor(Date.now() / 1000);
      if (now - lastCheck < throttleSeconds) {
        return exitSuccess();
      }
    } catch {
      // Can't read throttle file — continue
    }
  }

  // Update timestamp
  writeFileSync(throttleFile, String(Math.floor(Date.now() / 1000)));

  const pd = projectDir();

  // --- Check for urgent developer notes ---
  const notesDir = join(pd, ".planning", "notes");
  if (existsSync(notesDir)) {
    try {
      const urgentFiles = readdirSync(notesDir)
        .filter((f) => f.startsWith("0-") && f.endsWith(".md"))
        .slice(0, 5);

      if (urgentFiles.length > 0) {
        let noteContent = "";
        for (const noteFile of urgentFiles) {
          const fullPath = join(notesDir, noteFile);
          try {
            const raw = readFileSync(fullPath, "utf-8");
            // Extract body (skip frontmatter between --- delimiters)
            let inFrontmatter = false;
            const bodyLines: string[] = [];
            for (const line of raw.split("\n")) {
              if (line.trim() === "---") {
                inFrontmatter = !inFrontmatter;
                continue;
              }
              if (!inFrontmatter) {
                bodyLines.push(line);
              }
            }
            // Sanitize: strip markdown headers and control characters
            const sanitizedBody = bodyLines
              .filter((line) => !line.trim().startsWith("#"))
              .join(" ")
              .trim()
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

            // Truncate note body to 500 chars max
            const truncated = sanitizedBody.slice(0, 500);
            noteContent += `\n- ${truncated}`;

            // Move to done/
            mkdirSync(join(notesDir, "done"), { recursive: true });
            try {
              renameSync(fullPath, join(notesDir, "done", basename(noteFile)));
            } catch {
              // move failed — skip
            }
          } catch {
            // Can't read note — skip
          }
        }

        if (noteContent) {
          process.stdout.write(
            JSON.stringify({
              systemMessage: `[Developer Notes] Urgent notes to incorporate:${noteContent}`,
            }),
          );
          return exitSuccess();
        }
      }
    } catch {
      // notes dir not readable — skip
    }
  }

  // --- Run context monitor ---
  let zone = "peak";
  let usagePercent = 0;
  let fileSize = 0;
  let metricsSource = "transcript_heuristic";

  // Check for fresh statusline data (within 120s)
  let statuslineFresh = false;
  const metricsFile = join(pd, ".planning", ".context-metrics.json");

  if (existsSync(metricsFile)) {
    try {
      const metrics = JSON.parse(await Bun.file(metricsFile).text());
      if (metrics.source === "statusline") {
        const checkedAt = new Date(metrics.checked_at).getTime();
        const now = Date.now();
        if (now - checkedAt <= 120000) {
          zone = metrics.zone || "peak";
          usagePercent = metrics.usage_percent || 0;
          statuslineFresh = true;
          metricsSource = "statusline";
        }
      }
    } catch {
      // Metrics unreadable — fall through
    }
  }

  // Fallback: estimate from transcript file size
  if (!statuslineFresh) {
    let transcriptPath = "";
    const sessionDir = process.env.CLAUDE_SESSION_DIR;
    if (sessionDir && existsSync(sessionDir)) {
      // Look for transcript file in session dir
      try {
        const entries = readdirSync(sessionDir);
        const transcriptFile = entries.find((f) => f === "transcript");
        if (transcriptFile) {
          transcriptPath = join(sessionDir, transcriptFile);
        }
      } catch {
        // Can't read session dir
      }
    }

    if (transcriptPath && existsSync(transcriptPath)) {
      try {
        fileSize = statSync(transcriptPath).size;
        const warnThreshold = parseInt(
          process.env.CONTEXT_WARN || "100000",
          10,
        );
        const alertThreshold = parseInt(
          process.env.CONTEXT_ALERT || "200000",
          10,
        );
        const criticalThreshold = parseInt(
          process.env.CONTEXT_CRITICAL || "300000",
          10,
        );

        usagePercent = Math.min(
          100,
          Math.floor((fileSize * 70) / criticalThreshold),
        );

        if (fileSize >= criticalThreshold) {
          zone = "stop";
        } else if (fileSize >= alertThreshold) {
          zone = "degrading";
        } else if (fileSize >= warnThreshold) {
          zone = "good";
        }
      } catch {
        // Can't stat transcript — skip
      }
    }
  }

  // --- Read previous zone (before overwriting metrics) ---
  let prevZone = "peak";
  if (existsSync(metricsFile)) {
    try {
      const prevMetrics = JSON.parse(readFileSync(metricsFile, "utf-8"));
      prevZone = prevMetrics.zone || "peak";
    } catch {
      // Can't read prev metrics
    }
  }

  // --- Write context metrics snapshot (only if using heuristic) ---
  if (!statuslineFresh) {
    const metrics = {
      zone,
      usage_percent: usagePercent,
      transcript_bytes: fileSize,
      checked_at: new Date().toISOString(),
      source: "transcript_heuristic",
    };
    try {
      await Bun.write(metricsFile, JSON.stringify(metrics, null, 2) + "\n");
    } catch {
      // Metrics write failed — non-critical
    }
  }

  // --- Proactive checkpoint on zone worsening ---
  const prevSev = zoneSeverity(prevZone);
  const currSev = zoneSeverity(zone);

  if (currSev > prevSev) {
    const checkpointThrottleFile = `/tmp/.luca-ctx-checkpoint-${hash}-ts`;
    const checkpointThrottleSeconds = 300;
    let shouldCheckpoint = true;

    if (existsSync(checkpointThrottleFile)) {
      try {
        const lastCp = parseInt(
          readFileSync(checkpointThrottleFile, "utf-8").trim(),
          10,
        );
        const now = Math.floor(Date.now() / 1000);
        if (now - lastCp < checkpointThrottleSeconds) {
          shouldCheckpoint = false;
        }
      } catch {
        // Can't read throttle — checkpoint anyway
      }
    }

    if (shouldCheckpoint) {
      writeFileSync(
        checkpointThrottleFile,
        String(Math.floor(Date.now() / 1000)),
      );
      await runBridge(["snapshot"]);
    }

    // --- Write observation to MuninnDB on zone transition ---
    try {
      // Read git branch (best-effort)
      let gitBranch = "";
      try {
        const branchResult = Bun.spawnSync(
          ["git", "branch", "--show-current"],
          { stdout: "pipe", stderr: "pipe", cwd: pd },
        );
        if (branchResult.exitCode === 0) {
          gitBranch = branchResult.stdout.toString().trim();
        }
      } catch {
        // git not available
      }

      // Read git diff summary (best-effort, first 10 lines)
      let gitDiffSummary = "";
      try {
        const diffResult = Bun.spawnSync(
          ["git", "diff", "--name-only", "HEAD"],
          { stdout: "pipe", stderr: "pipe", cwd: pd },
        );
        if (diffResult.exitCode === 0) {
          gitDiffSummary = diffResult.stdout
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean)
            .slice(0, 10)
            .join(", ");
        }
      } catch {
        // git not available
      }

      // Read phase context from STATE.md (best-effort)
      let phaseContext = "";
      const stateMdPath = join(pd, ".planning", "STATE.md");
      if (existsSync(stateMdPath)) {
        try {
          const stateContent = readFileSync(stateMdPath, "utf-8");
          const stateLines = stateContent.split("\n");
          const phaseFields: string[] = [];
          for (const line of stateLines) {
            if (
              line.includes("Phase:") ||
              line.includes("Plan:") ||
              line.includes("Status:")
            ) {
              const trimmed = line.replace(/^[-*\s]+/, "").trim();
              if (trimmed) phaseFields.push(trimmed);
            }
          }
          phaseContext = phaseFields.slice(0, 3).join(" | ");
        } catch {
          // STATE.md unreadable
        }
      }

      // Construct observation payload
      const observation: SessionObservation = {
        concept: `session:observation-${Date.now()}`,
        timestamp: new Date().toISOString(),
        zone: zone as SessionObservation["zone"],
        usage_percent: usagePercent,
        git_branch: gitBranch,
        git_diff_summary: gitDiffSummary,
        phase_context: phaseContext,
        source: "zone_transition",
      };

      // Resolve vault and write to MuninnDB (fire-and-forget)
      const vault = await resolveVault();
      writeMuninnEngram({
        vault,
        concept: observation.concept,
        content: JSON.stringify(observation),
        type: "observation",
        tags: ["session", "observation", "zone-transition"],
      });
    } catch {
      // Observation write failed — never throw from hook
    }
  }

  // --- Write session-start observation on first invocation ---
  if (isFirstInvocation) {
    try {
      // Read git branch (best-effort)
      let gitBranch = "";
      try {
        const branchResult = Bun.spawnSync(
          ["git", "branch", "--show-current"],
          { stdout: "pipe", stderr: "pipe", cwd: pd },
        );
        if (branchResult.exitCode === 0) {
          gitBranch = branchResult.stdout.toString().trim();
        }
      } catch {
        // git not available
      }

      // Read git diff summary (best-effort, first 10 lines)
      let gitDiffSummary = "";
      try {
        const diffResult = Bun.spawnSync(
          ["git", "diff", "--name-only", "HEAD"],
          { stdout: "pipe", stderr: "pipe", cwd: pd },
        );
        if (diffResult.exitCode === 0) {
          gitDiffSummary = diffResult.stdout
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean)
            .slice(0, 10)
            .join(", ");
        }
      } catch {
        // git not available
      }

      // Read phase context from STATE.md (best-effort)
      let phaseContext = "";
      const stateMdPath = join(pd, ".planning", "STATE.md");
      if (existsSync(stateMdPath)) {
        try {
          const stateContent = readFileSync(stateMdPath, "utf-8");
          const stateLines = stateContent.split("\n");
          const phaseFields: string[] = [];
          for (const line of stateLines) {
            if (
              line.includes("Phase:") ||
              line.includes("Plan:") ||
              line.includes("Status:")
            ) {
              const trimmed = line.replace(/^[-*\s]+/, "").trim();
              if (trimmed) phaseFields.push(trimmed);
            }
          }
          phaseContext = phaseFields.slice(0, 3).join(" | ");
        } catch {
          // STATE.md unreadable
        }
      }

      // Construct session-start observation payload
      const sessionStartObservation: SessionObservation = {
        concept: `session:observation-${Date.now()}`,
        timestamp: new Date().toISOString(),
        zone: zone as SessionObservation["zone"],
        usage_percent: usagePercent,
        git_branch: gitBranch,
        git_diff_summary: gitDiffSummary,
        phase_context: phaseContext,
        source: "session_start",
      };

      // Resolve vault and write to MuninnDB (fire-and-forget)
      const vault = await resolveVault();
      writeMuninnEngram({
        vault,
        concept: sessionStartObservation.concept,
        content: JSON.stringify(sessionStartObservation),
        type: "observation",
        tags: ["session", "observation", "session-start"],
      });
    } catch {
      // Session-start observation write failed — never throw from hook
    }
  }

  // --- Read context_management config ---
  let clearSuggestionThreshold = 42;
  let clearSuggestionEnabled = true;
  try {
    const configPath = join(pd, ".planning", "config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const cm = config.context_management;
      if (cm) {
        if (typeof cm.clear_suggestion_threshold === "number") {
          clearSuggestionThreshold = cm.clear_suggestion_threshold;
        }
        if (typeof cm.clear_suggestion_enabled === "boolean") {
          clearSuggestionEnabled = cm.clear_suggestion_enabled;
        }
      }
    }
  } catch {
    // Config unreadable — use defaults
  }

  // --- Build systemMessage based on zone state ---
  let systemMessage = "";

  // Zone transition messages (prompt-layer observer)
  if (currSev > prevSev) {
    if (prevZone === "peak" && zone === "good") {
      const vault = await resolveVault();
      systemMessage = `[Session Observer] Context at ${usagePercent}% (peak->good). Writing zone observation to MuninnDB. Please summarize your current goal and approach via: mcp__muninn__muninn_remember(vault: "${vault}", concept: "session:observation-work", content: "[current goal, approach, recent decisions]")`;
    } else if (
      zone === "degrading" &&
      clearSuggestionEnabled &&
      usagePercent >= clearSuggestionThreshold
    ) {
      // Proactive clear suggestion on degrading zone transition
      const clearSuggestThrottleFile = `/tmp/.luca-clear-suggest-${hash}-ts`;
      const clearSuggestThrottleSeconds = 600; // 10-minute TTL
      let shouldSuggestClear = true;

      if (existsSync(clearSuggestThrottleFile)) {
        try {
          const lastSuggest = parseInt(
            readFileSync(clearSuggestThrottleFile, "utf-8").trim(),
            10,
          );
          const now = Math.floor(Date.now() / 1000);
          if (now - lastSuggest < clearSuggestThrottleSeconds) {
            shouldSuggestClear = false;
          }
        } catch {
          // Can't read throttle — suggest anyway
        }
      }

      if (shouldSuggestClear) {
        writeFileSync(
          clearSuggestThrottleFile,
          String(Math.floor(Date.now() / 1000)),
        );
        systemMessage = `[Context Management] Context at ${usagePercent}%. Session observations are saved to MuninnDB.\nConsider running /clear at your next natural stopping point (after a commit, task completion, or phase boundary). Context will be fully restored on the next session start.`;
      } else {
        // Throttled — fall through to observation message
        systemMessage = `[Session Observer] Context at ${usagePercent}% (good->degrading). Observation saved. Consider /clear at your next natural stopping point.`;
      }
    } else if (zone === "stop") {
      // Escalated clear suggestion at stop zone
      systemMessage = `[Context Management] Context at ${usagePercent}% — degraded zone. Strongly recommend /clear now. All observations saved to MuninnDB. Run /clear then start a new session for full context restore.`;
    } else if (prevZone === "good" && zone === "degrading") {
      // Degrading transition but clear suggestion disabled or below threshold
      systemMessage = `[Session Observer] Context at ${usagePercent}% (good->degrading). Observation saved. Consider /clear at your next natural stopping point.`;
    }
  }

  // Fallback: existing zone warning for degrading/stop when no transition occurred
  if (!systemMessage && (zone === "degrading" || zone === "stop")) {
    systemMessage = `Context usage at ${usagePercent}% (zone: ${zone}). Consider compressing memory or starting a new session.`;
  }

  if (systemMessage) {
    process.stdout.write(JSON.stringify({ systemMessage }));
  }

  return exitSuccess();
};

await main();
