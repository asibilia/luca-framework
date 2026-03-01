/**
 * Luca Widget Extension for Pi
 *
 * Renders persistent above-editor widgets via ctx.ui.setWidget() using
 * pi-tui components. Subscribes to tool_result, tool_call, turn_start,
 * turn_end, and agent_start events to maintain widget state.
 *
 * Widgets:
 * 1. Workflow — chain/expert/tilldone progress
 * 2. Verification — per-check pass/fail detail
 * 3. Context Meter — quality degradation awareness
 * 4. Turn Tracker — extends footer with turn count
 *
 * Follows the subagent-widget.ts pattern: state Map + event listeners
 * + pi-tui renderers in one file.
 *
 * Source: src/hooks/pi-extensions/luca-widgets.ts
 * Deployed to: .pi/extensions/luca-widgets.ts
 */
import { notifySafe } from "./__helpers/notify";
import type {
  ChainState,
  ResearchState,
  TillDoneState,
  VerifyState,
  CheckResult,
  StepState,
  ExpertState,
  QualityZone,
  SubagentDashState,
  SubagentEntry,
} from "./__helpers/widget-renderers";
import {
  renderWorkflow,
  renderVerify,
  renderContext,
  renderSubagents,
  getQualityZone,
} from "./__helpers/widget-renderers";
import type { PiExtensionAPI, PiExtensionContext } from "./__types/pi-context";

// ─── State ───────────────────────────────────────────────────

interface WidgetState {
  /** Active chain workflow. */
  chain: ChainState | null;
  /** Active research session. */
  research: ResearchState | null;
  /** Active tilldone loop. */
  tilldone: TillDoneState | null;
  /** Last verification result. */
  verify: VerifyState | null;
  /** Subagent dashboard state. */
  subagentDash: SubagentDashState | null;
  /** Context usage percentage (0-100). */
  contextPct: number;
  /** Quality degradation zone. */
  qualityZone: QualityZone;
  /**
   * Turn counter.
   *
   * NOTE: luca-state.ts also tracks turnCount independently for footer
   * display. Both are intentional — see luca-state.ts comment.
   */
  turnCount: number;
  /**
   * Currently active luca tool name (for footer).
   *
   * NOTE: luca-state.ts also tracks activeTool independently for footer
   * display. Both are intentional — see luca-state.ts comment.
   */
  activeTool: string | null;
  /** Notification thresholds already fired (50%, 70%). */
  notifiedThresholds: Set<number>;
  /** Number of context compactions in this session. */
  compactionCount: number;
}

function createInitialState(): WidgetState {
  return {
    chain: null,
    research: null,
    tilldone: null,
    verify: null,
    subagentDash: null,
    contextPct: -1,
    qualityZone: "PEAK",
    turnCount: 0,
    activeTool: null,
    notifiedThresholds: new Set(),
    compactionCount: 0,
  };
}

// ─── Tool result parsers ─────────────────────────────────────

/**
 * Safely parse JSON from a tool result's text content.
 * Returns an empty object if parsing fails or content is missing.
 *
 * tool_result events contain the tool's response payload. We extract
 * the text content and parse it as JSON. Returns null if parsing fails.
 *
 * @param result - Tool result with content array
 * @returns Parsed JSON object or null
 */
function parseToolResultJson(event: any): any {
  try {
    const text = event?.result?.content?.[0]?.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Update chain state from luca_define_chain tool result.
 */
function parseDefineChain(data: any): ChainState | null {
  if (!data?.chain || !Array.isArray(data.steps)) return null;
  return {
    name: data.chain,
    steps: data.steps.map((s: any) => ({
      agent: s.agent ?? "",
      task: s.task ?? "",
      status: "pending" as const,
    })),
    currentStep: 0,
  };
}

/**
 * Update chain state from luca_chain_next tool result.
 */
function updateChainFromNext(
  existing: ChainState | null,
  data: any,
): ChainState | null {
  if (!data?.chain) return existing;

  // Chain completed
  if (data.status === "completed" && Array.isArray(data.steps)) {
    return {
      name: data.chain,
      steps: data.steps.map((s: any) => ({
        agent: s.agent ?? "",
        task: s.task ?? "",
        status: s.status ?? "completed",
      })),
      currentStep: data.steps.length,
    };
  }

  // Advancing to next step
  if (existing && existing.name === data.chain) {
    const stepIdx = (data.step_number ?? 1) - 1;
    const updated = { ...existing, currentStep: data.step_number ?? 1 };

    // Mark previous steps completed
    updated.steps = existing.steps.map((s, i) => {
      if (i < stepIdx) return { ...s, status: "completed" as const };
      if (i === stepIdx) return { ...s, status: "running" as const };
      return s;
    });

    return updated;
  }

  return existing;
}

/**
 * Update chain state from luca_chain_status tool result.
 */
function updateChainFromStatus(data: any): ChainState | null {
  if (!data?.name || !Array.isArray(data.steps)) return null;
  return {
    name: data.name,
    steps: data.steps.map((s: any) => ({
      agent: s.agent ?? "",
      task: s.task ?? "",
      status: s.status ?? "pending",
    })),
    currentStep: data.current_step ?? 0,
  };
}

/**
 * Update research state from luca_define_experts result.
 */
function parseDefineExperts(data: any): ResearchState | null {
  if (!data?.session || !Array.isArray(data.experts)) return null;
  return {
    session: data.session,
    experts: data.experts.map((e: any) => ({
      domain: typeof e === "string" ? e : (e.domain ?? ""),
      status: "pending" as const,
    })),
  };
}

/**
 * Update research state from luca_query_expert result.
 */
function updateResearchFromQuery(
  existing: ResearchState | null,
  data: any,
): ResearchState | null {
  if (!existing || !data?.domain) return existing;
  return {
    ...existing,
    experts: existing.experts.map((e) =>
      e.domain === data.domain ? { ...e, status: "completed" as const } : e,
    ),
  };
}

/**
 * Update research state from luca_research_status result.
 */
function updateResearchFromStatus(data: any): ResearchState | null {
  if (!data?.name) return null;
  // Infer expert status from findings
  const domains: string[] = Array.isArray(data.experts)
    ? data.experts.map((e: any) =>
        typeof e === "string" ? e : (e.domain ?? ""),
      )
    : [];
  const completedDomains = new Set<string>(
    Array.isArray(data.findings) ? data.findings.map((f: any) => f.domain) : [],
  );
  return {
    session: data.name,
    experts: domains.map((d) => ({
      domain: d,
      status: completedDomains.has(d)
        ? ("completed" as const)
        : ("pending" as const),
    })),
  };
}

/**
 * Update tilldone state from luca_tilldone result.
 */
function parseTillDone(data: any): TillDoneState | null {
  if (!data?.name) return null;
  return {
    command: data.name,
    attempt: data.iteration ?? 1,
    max: data.max_iterations ?? 5,
    lastStatus: data.status ?? "running",
    failures: data.status === "failed" ? 1 : 0,
  };
}

/**
 * Update tilldone state from luca_loop_status result.
 */
function updateTillDoneFromStatus(data: any): TillDoneState | null {
  if (!data?.name) return null;
  const failCount = Array.isArray(data.history)
    ? data.history.filter((h: any) => h.status === "failed").length
    : 0;
  return {
    command: data.command ?? data.name,
    attempt: data.iteration ?? 0,
    max: data.max_iterations ?? 5,
    lastStatus: data.status ?? "running",
    failures: failCount,
  };
}

/**
 * Parse verification result from luca_verify tool.
 */
function parseVerifyResult(data: any): VerifyState | null {
  if (!Array.isArray(data?.checks)) return null;
  return {
    checks: data.checks.map((c: any) => ({
      name: c.name ?? "unknown",
      status: c.status ?? "failed",
      count: c.count ?? undefined,
      duration: c.duration ?? undefined,
    })),
    timestamp: Date.now(),
  };
}

/**
 * Parse subagent create response into a dashboard entry.
 */
function parseSubagentCreate(data: any): SubagentEntry | null {
  if (!data?.id || !data?.agent) return null;
  return {
    id: data.id,
    agent: data.agent,
    status: data.status ?? "running",
    task_preview: "",
    duration_ms: 0,
  };
}

/**
 * Update subagent dashboard from luca_subagent_list response.
 */
function parseSubagentList(data: any): SubagentDashState | null {
  if (!Array.isArray(data)) return null;
  if (data.length === 0) return null;
  return {
    agents: data.map((s: any) => ({
      id: s.id ?? "",
      agent: s.agent ?? "",
      status: s.status ?? "running",
      task_preview: s.task_preview ?? "",
      duration_ms: s.duration_ms ?? 0,
    })),
  };
}

/**
 * Update subagent dashboard from luca_subagent_result response.
 */
function updateSubagentFromResult(
  existing: SubagentDashState | null,
  data: any,
): SubagentDashState | null {
  if (!data?.id) return existing;
  if (!existing) return null;

  return {
    agents: existing.agents.map((a) =>
      a.id === data.id
        ? {
            ...a,
            status: data.status ?? a.status,
            task_preview: data.task ? data.task.slice(0, 100) : a.task_preview,
            duration_ms: data.duration_ms ?? a.duration_ms,
          }
        : a,
    ),
  };
}

/**
 * Remove a subagent entry from the dashboard.
 */
function removeSubagentEntry(
  existing: SubagentDashState | null,
  id: string,
): SubagentDashState | null {
  if (!existing) return null;
  const filtered = existing.agents.filter((a) => a.id !== id);
  return filtered.length > 0 ? { agents: filtered } : null;
}

// ─── Extension ───────────────────────────────────────────────

/**
 * Pi extension: Above-editor widget rendering.
 *
 * Subscribes to tool_result, tool_call, tool_execution_end,
 * turn_start, turn_end, and agent_start events. Maintains state
 * and renders pi-tui widgets via ctx.ui.setWidget().
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaWidgets(pi: PiExtensionAPI) {
  const state: WidgetState = createInitialState();

  /**
   * Wrap a pi-tui Component in a factory function for ctx.ui.setWidget().
   *
   * Pi's setWidget API accepts:
   *   - string[]  → auto-wrapped in Container/Text
   *   - (ui, theme) => Component  → factory function (called to create component)
   *   - undefined → clears the widget
   *
   * Our renderers return PiTuiComponent objects. This helper converts them
   * to the factory-function form Pi expects: `(ui, theme) => component`.
   */
  function toWidgetFactory(
    component: ReturnType<typeof renderWorkflow>,
  ): ((ui: any, theme: any) => any) | undefined {
    if (!component) return undefined;
    return () => component;
  }

  /**
   * Master render function. Called after any state change.
   * Updates all widgets via ctx.ui.setWidget().
   */
  function updateWidgets(ctx: PiExtensionContext): void {
    if (!ctx?.ui?.setWidget) return;

    // Workflow widget
    const workflowComponent = renderWorkflow(
      state.chain,
      state.research,
      state.tilldone,
    );
    ctx.ui.setWidget("luca-workflow", toWidgetFactory(workflowComponent));

    // Verify widget
    const verifyComponent = renderVerify(state.verify);
    ctx.ui.setWidget("luca-verify", toWidgetFactory(verifyComponent));

    // Subagent dashboard widget
    const subagentComponent = renderSubagents(state.subagentDash);
    ctx.ui.setWidget("luca-subagents", toWidgetFactory(subagentComponent));

    // Context meter widget
    const contextComponent = renderContext(state.contextPct, state.qualityZone);
    ctx.ui.setWidget("luca-context", toWidgetFactory(contextComponent));
  }

  // NOTE: Turn count and active tool display moved to luca-state.ts footer.
  // luca-widgets.ts still tracks activeTool and turnCount internally for
  // widget rendering decisions, but does not call setStatus("luca-turns")
  // to avoid conflicting with luca-state's setFooter.

  // ─── Event handlers ──────────────────────────────────────

  // Parse tool results to update widget state
  pi.on("tool_result", async (event: any, ctx: PiExtensionContext) => {
    const toolName: string = event?.toolName ?? "";
    if (!toolName.startsWith("luca_")) return;

    const data = parseToolResultJson(event);
    if (!data) return;

    let changed = false;

    switch (toolName) {
      case "luca_define_chain": {
        const chain = parseDefineChain(data);
        if (chain) {
          state.chain = chain;
          state.research = null;
          state.tilldone = null;
          changed = true;
        }
        break;
      }
      case "luca_chain_next": {
        state.chain = updateChainFromNext(state.chain, data);
        changed = true;
        break;
      }
      case "luca_chain_status": {
        // Only update if it's a single chain status (has "name")
        if (data.name) {
          const chain = updateChainFromStatus(data);
          if (chain) {
            state.chain = chain;
            changed = true;
          }
        }
        break;
      }
      case "luca_define_experts": {
        const research = parseDefineExperts(data);
        if (research) {
          state.research = research;
          state.chain = null;
          state.tilldone = null;
          changed = true;
        }
        break;
      }
      case "luca_query_expert": {
        state.research = updateResearchFromQuery(state.research, data);
        changed = true;
        break;
      }
      case "luca_research_status": {
        if (data.name) {
          const research = updateResearchFromStatus(data);
          if (research) {
            state.research = research;
            changed = true;
          }
        }
        break;
      }
      case "luca_tilldone": {
        const td = parseTillDone(data);
        if (td) {
          state.tilldone = td;
          state.chain = null;
          state.research = null;
          changed = true;
        }
        break;
      }
      case "luca_loop_status": {
        if (data.name) {
          const td = updateTillDoneFromStatus(data);
          if (td) {
            state.tilldone = td;
            changed = true;
          }
        }
        break;
      }
      case "luca_verify": {
        const verify = parseVerifyResult(data);
        if (verify) {
          state.verify = verify;
          changed = true;
        }
        break;
      }
      case "luca_subagent_create": {
        const entry = parseSubagentCreate(data);
        if (entry) {
          if (!state.subagentDash) {
            state.subagentDash = { agents: [] };
          }
          state.subagentDash.agents.push(entry);
          changed = true;
        }
        break;
      }
      case "luca_subagent_list": {
        const dash = parseSubagentList(data);
        // Always update — null clears the widget when no subagents remain
        state.subagentDash = dash;
        changed = true;
        break;
      }
      case "luca_subagent_continue": {
        // Continue returns JSON like create — update existing entry to running
        if (data?.id && state.subagentDash) {
          state.subagentDash = {
            agents: state.subagentDash.agents.map((a) =>
              a.id === data.id
                ? { ...a, status: "running" as const, duration_ms: 0 }
                : a,
            ),
          };
          changed = true;
        }
        break;
      }
      case "luca_subagent_result": {
        state.subagentDash = updateSubagentFromResult(state.subagentDash, data);
        changed = true;
        break;
      }
    }

    // Handle text-only responses (luca_subagent_remove returns text, not JSON)
    if (!changed && toolName === "luca_subagent_remove" && state.subagentDash) {
      const rawText = event?.result?.content?.[0]?.text ?? "";
      const idMatch = rawText.match(/Subagent "([^"]+)"/);
      if (idMatch?.[1]) {
        state.subagentDash = removeSubagentEntry(
          state.subagentDash,
          idMatch[1],
        );
        changed = true;
      }
    }

    if (changed) {
      updateWidgets(ctx);
    }
  });

  // Track active luca tool (internal state only — display handled by luca-state footer)
  pi.on("tool_call", async (event: any, _ctx: PiExtensionContext) => {
    const toolName: string = event?.toolName ?? "";
    if (!toolName.startsWith("luca_")) return;

    state.activeTool = toolName.replace("luca_", "").replace(/_/g, " ");
  });

  // Clear active tool when finished (internal state only)
  pi.on("tool_execution_end", async (event: any, _ctx: PiExtensionContext) => {
    const toolName: string = event?.toolName ?? "";
    if (!toolName.startsWith("luca_")) return;

    state.activeTool = null;
  });

  // Increment turn counter (internal state only)
  pi.on("turn_start", async (_event: any, _ctx: PiExtensionContext) => {
    state.turnCount++;
  });

  // Poll context usage on turn end
  pi.on("turn_end", async (_event: any, ctx: PiExtensionContext) => {
    if (typeof ctx?.getContextUsage !== "function") return;

    try {
      const usage = ctx.getContextUsage();
      const total = usage?.totalTokens ?? usage?.total ?? 0;
      const limit = usage?.maxTokens ?? usage?.limit ?? 0;

      if (limit > 0) {
        state.contextPct = Math.round((total / limit) * 100);
        state.qualityZone = getQualityZone(state.contextPct);

        // Fire notifications at thresholds
        if (state.contextPct >= 50 && !state.notifiedThresholds.has(50)) {
          state.notifiedThresholds.add(50);
          notifySafe(
            ctx,
            "Context usage at 50% \u2014 quality may start degrading",
            "warning",
          );
        }
        if (state.contextPct >= 70 && !state.notifiedThresholds.has(70)) {
          state.notifiedThresholds.add(70);
          notifySafe(
            ctx,
            "Context usage at 70% \u2014 POOR quality zone, consider stopping soon",
            "error",
          );
        }

        updateWidgets(ctx);
      }
    } catch {
      // getContextUsage may not be available in all Pi versions
    }
  });

  // Clear stale widgets on new agent session
  pi.on("agent_start", async (_event: any, ctx: PiExtensionContext) => {
    state.chain = null;
    state.research = null;
    state.tilldone = null;
    state.verify = null;
    state.subagentDash = null;
    state.turnCount = 0;
    state.activeTool = null;
    state.notifiedThresholds.clear();
    // Keep contextPct and compactionCount — they persist across agent runs

    updateWidgets(ctx);
  });

  // Track context compaction events
  pi.on("session_compact", async (_event: any, ctx: PiExtensionContext) => {
    state.compactionCount++;
    notifySafe(
      ctx,
      `Context compacted (${state.compactionCount} time${state.compactionCount > 1 ? "s" : ""})`,
      "info",
    );
    updateWidgets(ctx);
  });
}
