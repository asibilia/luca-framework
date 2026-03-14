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
} from "./_lib/hook-io.ts";
import { runBridge } from "./_lib/bridge.ts";

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

  if (existsSync(throttleFile)) {
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
            const body = bodyLines.join(" ").trim();
            noteContent += `\n- ${body}`;

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
  }

  // Only output warning for degrading or stop zones
  if (zone === "degrading" || zone === "stop") {
    process.stdout.write(
      JSON.stringify({
        systemMessage: `Context usage at ${usagePercent}% (zone: ${zone}). Consider compressing memory or starting a new session.`,
      }),
    );
  }

  return exitSuccess();
};

await main();
