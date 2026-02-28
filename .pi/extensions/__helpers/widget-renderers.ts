/**
 * Pure rendering functions for Pi widget components.
 *
 * Each function takes widget state and returns a pi-tui Component
 * (an object with `render(width): string[]`). Extracted from
 * luca-widgets.ts for testability.
 *
 * Source: src/hooks/pi-extensions/__helpers/widget-renderers.ts
 * Deployed to: .pi/extensions/__helpers/widget-renderers.ts
 */

// ─── Types ───────────────────────────────────────────────────

/** A single step in an agent chain. */
export interface StepState {
  agent: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  duration?: number;
}

/** Chain workflow state. */
export interface ChainState {
  name: string;
  steps: StepState[];
  currentStep: number;
}

/** Expert domain state in a research session. */
export interface ExpertState {
  domain: string;
  status: "pending" | "completed";
}

/** Research workflow state. */
export interface ResearchState {
  session: string;
  experts: ExpertState[];
}

/** TillDone loop state. */
export interface TillDoneState {
  command: string;
  attempt: number;
  max: number;
  lastStatus: string;
  failures?: number;
}

/** A single verification check result. */
export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "timeout";
  count?: { pass?: number; fail?: number; errors?: number };
  duration?: number;
}

/** Verification widget state. */
export interface VerifyState {
  checks: CheckResult[];
  timestamp: number;
}

/** A single subagent entry in the dashboard. */
export interface SubagentEntry {
  id: string;
  agent: string;
  status: "running" | "completed" | "failed" | "aborted";
  task_preview: string;
  duration_ms: number;
}

/** Subagent dashboard widget state. */
export interface SubagentDashState {
  agents: SubagentEntry[];
}

/** Quality zone for context meter. */
export type QualityZone = "PEAK" | "GOOD" | "DEGRADING" | "POOR";

/** pi-tui Component contract. */
export interface PiTuiComponent {
  render(width: number): string[];
  invalidate?(): void;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Truncate string to fit within a given width. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

/** Pad string to exact width (right-padded). */
function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

/** Step status icons. */
const STEP_ICONS: Record<string, string> = {
  completed: "\u2713",
  running: "\u25b8",
  failed: "\u2717",
  pending: "\u00b7",
};

/** Quality zone thresholds. */
export function getQualityZone(pct: number): QualityZone {
  if (pct <= 30) return "PEAK";
  if (pct <= 50) return "GOOD";
  if (pct <= 70) return "DEGRADING";
  return "POOR";
}

/**
 * Render a bordered widget box with a title and content lines.
 *
 * Handles the repeated border-drawing pattern across all widget renderers:
 * top border with title, content callback, bottom border.
 *
 * @param title - Box title (shown in top border, e.g., " Luca ")
 * @param width - Total widget width
 * @param contentFn - Callback that receives inner width and returns content lines
 * @returns Complete box as string array (top border + content + bottom border)
 */
function renderWidgetBox(
  title: string,
  width: number,
  contentFn: (inner: number) => string[],
): string[] {
  const inner = width - 4; // 2 border chars + 2 padding
  const borderLen = Math.max(0, inner - title.length);
  const lines: string[] = [];
  lines.push(`\u250c\u2500${title}${"─".repeat(borderLen)}\u2510`);
  lines.push(...contentFn(inner));
  lines.push(`\u2514${"─".repeat(inner + 2)}\u2518`);
  return lines;
}

// ─── Renderers ───────────────────────────────────────────────

/**
 * Render the workflow widget for chain/expert/tilldone progress.
 *
 * Shows different layouts depending on which workflow is active:
 * - Chain: step-by-step agent pipeline
 * - Research: inline expert status
 * - TillDone: single-line loop status
 *
 * @param chain - Active chain state, or null
 * @param research - Active research state, or null
 * @param tilldone - Active tilldone state, or null
 * @returns pi-tui Component, or null if no workflow active
 */
export function renderWorkflow(
  chain: ChainState | null,
  research: ResearchState | null,
  tilldone: TillDoneState | null,
): PiTuiComponent | null {
  if (!chain && !research && !tilldone) return null;

  return {
    render(width: number): string[] {
      return renderWidgetBox(" Luca ", width, (inner) => {
        const lines: string[] = [];

        if (chain) {
          // Chain header
          const completedCount = chain.steps.filter(
            (s) => s.status === "completed",
          ).length;
          const header = `Chain: ${truncate(chain.name, inner - 20)}  ${completedCount}/${chain.steps.length} steps`;
          lines.push(`\u2502 ${padRight(header, inner)} \u2502`);

          // Step lines
          for (const step of chain.steps) {
            const icon = STEP_ICONS[step.status] ?? "\u00b7";
            const durStr =
              step.status === "completed" && step.duration
                ? `(${(step.duration / 1000).toFixed(1)}s)`
                : step.status === "running"
                  ? "running"
                  : "";
            const taskStr = truncate(
              step.task,
              Math.max(10, inner - step.agent.length - durStr.length - 8),
            );
            const stepLine = ` ${icon} ${padRight(step.agent, 18)}${taskStr ? ` "${taskStr}"` : ""}${durStr ? `  ${durStr}` : ""}`;
            lines.push(
              `\u2502 ${padRight(truncate(stepLine, inner), inner)} \u2502`,
            );
          }
        } else if (research) {
          // Research header
          const completedCount = research.experts.filter(
            (e) => e.status === "completed",
          ).length;
          const header = `Research: ${truncate(research.session, inner - 25)}  ${completedCount}/${research.experts.length} experts`;
          lines.push(`\u2502 ${padRight(header, inner)} \u2502`);

          // Expert statuses inline
          const expertParts = research.experts.map(
            (e) =>
              `${e.status === "completed" ? "\u2713" : "\u00b7"} ${e.domain}`,
          );
          const expertLine = ` ${expertParts.join("  ")}`;
          lines.push(
            `\u2502 ${padRight(truncate(expertLine, inner), inner)} \u2502`,
          );
        } else if (tilldone) {
          // TillDone single-line
          const statusIcon =
            tilldone.lastStatus === "passed"
              ? "\u2713"
              : tilldone.lastStatus === "failed"
                ? "\u2717"
                : "\u25b8";
          const failStr =
            tilldone.failures && tilldone.failures > 0
              ? `  ${statusIcon} ${tilldone.failures} failures`
              : tilldone.lastStatus === "passed"
                ? `  \u2713 passed`
                : "";
          const tdLine = `TillDone: ${truncate(tilldone.command, inner - 30)}  attempt ${tilldone.attempt}/${tilldone.max}${failStr}`;
          lines.push(
            `\u2502 ${padRight(truncate(tdLine, inner), inner)} \u2502`,
          );
        }

        return lines;
      });
    },
  };
}

/**
 * Render the verification widget showing per-check results.
 *
 * @param state - Verification state with check results
 * @returns pi-tui Component, or null if no verify state
 */
export function renderVerify(state: VerifyState | null): PiTuiComponent | null {
  if (!state || state.checks.length === 0) return null;

  return {
    render(width: number): string[] {
      return renderWidgetBox(" Verify ", width, (inner) => {
        const lines: string[] = [];

        for (const check of state.checks) {
          const icon = check.status === "passed" ? "\u2713" : "\u2717";
          const durStr = check.duration
            ? `(${(check.duration / 1000).toFixed(1)}s)`
            : "";

          let detail = "";
          if (check.count) {
            if (check.status === "passed") {
              detail = `${check.count.pass ?? 0} pass  ${check.count.fail ?? 0} fail`;
            } else {
              detail = `${check.count.errors ?? check.count.fail ?? 0} errors`;
            }
          }

          const checkLine = `${icon} ${padRight(check.name, 12)}${detail ? detail + "  " : ""}${durStr}`;
          lines.push(
            `\u2502 ${padRight(truncate(checkLine, inner), inner)} \u2502`,
          );
        }

        return lines;
      });
    },
  };
}

/**
 * Render the context meter widget showing quality degradation.
 *
 * Progress bar mapped to Luca's quality degradation curve:
 * 0-30% PEAK, 30-50% GOOD, 50-70% DEGRADING, 70%+ POOR
 *
 * @param pct - Context usage percentage (0-100)
 * @param zone - Quality zone label
 * @returns pi-tui Component
 */
export function renderContext(
  pct: number,
  zone: QualityZone,
): PiTuiComponent | null {
  if (pct < 0) return null;

  return {
    render(width: number): string[] {
      return renderWidgetBox(" Context ", width, (inner) => {
        // Progress bar
        const barWidth = Math.max(10, inner - 30);
        const filled = Math.round((pct / 100) * barWidth);
        const empty = barWidth - filled;
        const bar = `[${"█".repeat(filled)}${"░".repeat(empty)}]`;

        const warning = zone === "POOR" ? "\u26a0 " : "";
        const zoneLabel =
          zone === "POOR"
            ? `${warning}POOR \u2014 stop soon`
            : zone === "DEGRADING"
              ? `${warning}DEGRADING`
              : `${zone} quality zone`;

        const meterLine = `${bar} ${pct}%  ${zoneLabel}`;
        return [
          `\u2502 ${padRight(truncate(meterLine, inner), inner)} \u2502`,
        ];
      });
    },
  };
}

/**
 * Render the subagent dashboard widget showing background process status.
 *
 * Displays a compact table of all tracked subagents with status icons,
 * agent names, task previews, and elapsed duration. Header shows
 * running/completed/failed counts.
 *
 * @param state - Subagent dashboard state with agent entries
 * @returns pi-tui Component, or null if no subagents tracked
 */
export function renderSubagents(
  state: SubagentDashState | null,
): PiTuiComponent | null {
  if (!state || state.agents.length === 0) return null;

  return {
    render(width: number): string[] {
      return renderWidgetBox(" Subagents ", width, (inner) => {
        const lines: string[] = [];

        // Summary header
        const running = state.agents.filter((a) => a.status === "running").length;
        const completed = state.agents.filter((a) => a.status === "completed").length;
        const failed = state.agents.filter(
          (a) => a.status === "failed" || a.status === "aborted",
        ).length;
        const parts: string[] = [];
        if (running > 0) parts.push(`${running} running`);
        if (completed > 0) parts.push(`${completed} done`);
        if (failed > 0) parts.push(`${failed} failed`);
        const header = parts.join("  ") || "none";
        lines.push(`\u2502 ${padRight(header, inner)} \u2502`);

        // Agent rows
        for (const agent of state.agents) {
          const icon = STEP_ICONS[agent.status] ?? "\u00b7";
          const durSec = Math.round(agent.duration_ms / 1000);
          const durStr = durSec >= 60
            ? `${Math.floor(durSec / 60)}m${durSec % 60}s`
            : `${durSec}s`;
          const nameWidth = Math.min(18, Math.max(8, inner - 30));
          const taskWidth = Math.max(10, inner - nameWidth - durStr.length - 8);
          const row = ` ${icon} ${padRight(truncate(agent.agent, nameWidth), nameWidth)} ${truncate(agent.task_preview, taskWidth)}  ${durStr}`;
          lines.push(
            `\u2502 ${padRight(truncate(row, inner), inner)} \u2502`,
          );
        }

        return lines;
      });
    },
  };
}
