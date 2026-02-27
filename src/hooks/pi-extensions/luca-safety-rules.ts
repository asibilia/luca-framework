/**
 * Luca Safety Rules Extension for Pi
 *
 * Provides damage control and safety guardrails. Registers safety rules
 * with severity levels, checks operations against safety gates, and
 * supports block/warn/log modes. Designed to prevent destructive
 * operations and enforce project-specific safety policies.
 *
 * Source: src/hooks/pi-extensions/luca-safety-rules.ts
 * Deployed to: .pi/extensions/luca-safety-rules.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/** Severity levels for safety rules. */
type Severity = "critical" | "high" | "medium" | "low";

/** Gate enforcement modes. */
type GateMode = "block" | "warn" | "log";

/** A safety rule definition. */
interface SafetyRule {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  pattern: string;
  mitigation: string;
}

/** Audit log entry. */
interface AuditEntry {
  timestamp: string;
  rule_id: string;
  action: "blocked" | "warned" | "logged";
  context: string;
}

export default function lucaSafetyRules(pi: any) {
  const cwd = process.cwd();

  /** Gate mode (default: warn). */
  let gateMode: GateMode = "warn";

  /** Registered safety rules. */
  const rules: Map<string, SafetyRule> = new Map();

  /** Audit log. */
  const auditLog: AuditEntry[] = [];

  // Pre-register built-in safety rules
  const BUILTIN_RULES: SafetyRule[] = [
    {
      id: "destructive-git",
      name: "Destructive Git Operations",
      description:
        "Prevents force-push, hard reset, and branch deletion without confirmation",
      severity: "critical",
      pattern: "git push --force|git reset --hard|git branch -D|git clean -f",
      mitigation:
        "Use non-destructive alternatives: git push --force-with-lease, git stash, git branch -d",
    },
    {
      id: "rm-recursive",
      name: "Recursive File Deletion",
      description: "Prevents rm -rf on directories without confirmation",
      severity: "critical",
      pattern: "rm -rf|rm -r /|rmdir /s",
      mitigation:
        "Use targeted file removal, or move to trash instead of permanent deletion",
    },
    {
      id: "credentials-in-code",
      name: "Credentials in Code",
      description:
        "Detects API keys, tokens, and passwords in source code or commits",
      severity: "high",
      pattern:
        "api_key|api_secret|password|token|secret_key|private_key|AWS_SECRET",
      mitigation:
        "Use environment variables or a secrets manager. Add patterns to .gitignore",
    },
    {
      id: "database-drop",
      name: "Database Drop/Truncate",
      description:
        "Prevents DROP TABLE, DROP DATABASE, and TRUNCATE without review",
      severity: "critical",
      pattern: "DROP TABLE|DROP DATABASE|TRUNCATE TABLE|DELETE FROM .* WHERE 1",
      mitigation:
        "Use migrations with rollback support. Never run destructive SQL without a backup",
    },
    {
      id: "env-file-commit",
      name: "Environment File Commit",
      description: "Prevents committing .env files that may contain secrets",
      severity: "high",
      pattern: "\\.env$|\\.env\\.local|\\.env\\.production",
      mitigation:
        "Add .env* to .gitignore. Use .env.example for templates without values",
    },
    {
      id: "breaking-api-change",
      name: "Breaking API Change",
      description:
        "Warns when removing or renaming public API endpoints or exports",
      severity: "medium",
      pattern: "removed endpoint|breaking change|deprecated .* removed",
      mitigation:
        "Use deprecation warnings first. Provide migration path in changelog",
    },
  ];

  for (const rule of BUILTIN_RULES) {
    rules.set(rule.id, rule);
  }

  // Tool: List safety rules
  pi.registerTool({
    name: "luca_list_safety_rules",
    label: "List Safety Rules",
    description:
      "List all registered safety rules with severity levels and current gate mode.",
    parameters: {},
    async execute() {
      const ruleList = Array.from(rules.values()).map((r) => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        pattern: r.pattern,
        mitigation: r.mitigation,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                gate_mode: gateMode,
                rules: ruleList,
                total: ruleList.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Tool: Register a custom safety rule
  pi.registerTool({
    name: "luca_register_safety_rule",
    label: "Register Safety Rule",
    description:
      "Register a custom safety rule with a trigger pattern, severity level, and mitigation advice.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique rule ID (e.g., 'no-console-log')",
        },
        name: {
          type: "string",
          description: "Human-readable rule name",
        },
        description: {
          type: "string",
          description: "What this rule guards against",
        },
        severity: {
          type: "string",
          description: "Severity: critical, high, medium, low",
        },
        pattern: {
          type: "string",
          description:
            "Pipe-separated patterns to match (e.g., 'console.log|console.debug')",
        },
        mitigation: {
          type: "string",
          description: "How to fix or avoid the violation",
        },
      },
      required: ["id", "name", "severity", "pattern", "mitigation"],
    },
    async execute(
      _toolCallId: string,
      params: {
        id: string;
        name: string;
        description?: string;
        severity: string;
        pattern: string;
        mitigation: string;
      },
    ) {
      const validSeverities = ["critical", "high", "medium", "low"];
      if (!validSeverities.includes(params.severity)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid severity "${params.severity}". Use: ${validSeverities.join(", ")}`,
            },
          ],
        };
      }

      const rule: SafetyRule = {
        id: params.id,
        name: params.name,
        description: params.description ?? params.name,
        severity: params.severity as Severity,
        pattern: params.pattern,
        mitigation: params.mitigation,
      };

      rules.set(params.id, rule);

      return {
        content: [
          {
            type: "text",
            text: `Safety rule "${params.id}" registered (severity: ${params.severity})`,
          },
        ],
      };
    },
  });

  // Tool: Check content against safety rules
  pi.registerTool({
    name: "luca_safety_check",
    label: "Safety Check",
    description:
      "Check a command or content string against all registered safety rules. Returns any violations found with severity and mitigation advice.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Command or content to check against safety rules",
        },
        context: {
          type: "string",
          description: "Optional context about where this content will be used",
        },
      },
      required: ["content"],
    },
    async execute(
      _toolCallId: string,
      params: { content: string; context?: string },
    ) {
      const violations: Array<{
        rule_id: string;
        name: string;
        severity: Severity;
        matched_pattern: string;
        mitigation: string;
        action: string;
      }> = [];

      for (const rule of rules.values()) {
        const patterns = rule.pattern.split("|").map((p) => p.trim());
        for (const pattern of patterns) {
          if (params.content.toLowerCase().includes(pattern.toLowerCase())) {
            const action =
              gateMode === "block"
                ? "BLOCKED"
                : gateMode === "warn"
                  ? "WARNING"
                  : "LOGGED";

            violations.push({
              rule_id: rule.id,
              name: rule.name,
              severity: rule.severity,
              matched_pattern: pattern,
              mitigation: rule.mitigation,
              action,
            });

            // Record in audit log
            auditLog.push({
              timestamp: new Date().toISOString(),
              rule_id: rule.id,
              action:
                gateMode === "block"
                  ? "blocked"
                  : gateMode === "warn"
                    ? "warned"
                    : "logged",
              context: params.context ?? params.content.slice(0, 200),
            });

            break; // One match per rule is enough
          }
        }
      }

      // Sort by severity (critical first)
      const severityOrder: Record<Severity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      violations.sort(
        (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
      );

      const hasCritical = violations.some((v) => v.severity === "critical");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                safe: violations.length === 0,
                gate_mode: gateMode,
                violations,
                summary:
                  violations.length === 0
                    ? "No safety violations detected"
                    : `${violations.length} violation(s) found${hasCritical ? " — CRITICAL issues present" : ""}`,
                blocked: gateMode === "block" && violations.length > 0,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Tool: Set gate mode
  pi.registerTool({
    name: "luca_set_safety_mode",
    label: "Set Safety Mode",
    description:
      "Set the safety gate enforcement mode: 'block' prevents violations, 'warn' alerts but allows, 'log' silently records.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "Gate mode: block, warn, log",
        },
      },
      required: ["mode"],
    },
    async execute(_toolCallId: string, params: { mode: string }) {
      const validModes = ["block", "warn", "log"];
      if (!validModes.includes(params.mode)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid mode "${params.mode}". Use: ${validModes.join(", ")}`,
            },
          ],
        };
      }

      const previous = gateMode;
      gateMode = params.mode as GateMode;

      return {
        content: [
          {
            type: "text",
            text: `Safety mode changed: ${previous} → ${gateMode}`,
          },
        ],
      };
    },
  });

  // Tool: Get audit log
  pi.registerTool({
    name: "luca_safety_audit",
    label: "Safety Audit Log",
    description:
      "Get the safety audit log showing all checked violations, their actions, and timestamps.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum entries to return (default: 20)",
        },
      },
    },
    async execute(_toolCallId: string, params: { limit?: number }) {
      const limit = params.limit ?? 20;
      const entries = auditLog.slice(-limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_entries: auditLog.length,
                showing: entries.length,
                entries,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  });

  // Event: Check tool_call events against safety rules for command execution
  pi.on("tool_call", async (event: any, _ctx: any) => {
    // Only check Bash/shell tool calls
    const toolName = (event.toolName || "").toLowerCase();
    if (toolName !== "bash" && toolName !== "shell") return;

    const command = event.params?.command || event.params?.input || "";
    if (!command) return;

    // Check command against critical rules only (performance)
    for (const rule of rules.values()) {
      if (rule.severity !== "critical") continue;

      const patterns = rule.pattern.split("|").map((p) => p.trim());
      for (const pattern of patterns) {
        if (command.toLowerCase().includes(pattern.toLowerCase())) {
          auditLog.push({
            timestamp: new Date().toISOString(),
            rule_id: rule.id,
            action: gateMode === "block" ? "blocked" : "warned",
            context: `tool_call: ${command.slice(0, 200)}`,
          });

          if (gateMode === "block") {
            return {
              block: true,
              reason: `Safety rule "${rule.name}" (${rule.severity}): ${rule.mitigation}`,
            };
          }
          break;
        }
      }
    }
  });
}
