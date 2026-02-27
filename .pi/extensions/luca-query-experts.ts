/**
 * Luca Query Experts Extension for Pi
 *
 * Provides parallel expert research orchestration. Define expert domains,
 * dispatch focused research queries in parallel, collect results, and
 * synthesize findings. Implements the "query_experts" pattern for
 * multi-perspective analysis.
 *
 * Source: src/hooks/pi-extensions/luca-query-experts.ts
 * Deployed to: .pi/extensions/luca-query-experts.ts
 */
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { sanitizeName } from "./__helpers/sanitize";

/** A research expert definition. */
interface ExpertDef {
  domain: string;
  focus_areas: string[];
  description: string;
}

/** A collected expert finding. */
interface ExpertFinding {
  domain: string;
  query: string;
  finding: string;
  confidence: "high" | "medium" | "low";
  timestamp: string;
}

/** A research session tracking multiple expert queries. */
interface ResearchSession {
  name: string;
  context: string;
  experts: ExpertDef[];
  findings: ExpertFinding[];
  status: "pending" | "researching" | "synthesized";
}

export default function lucaQueryExperts(pi: any) {
  const cwd = process.cwd();
  const researchDir = join(cwd, ".planning", "research");

  /** Active research sessions. */
  const sessions = createRegistry<ResearchSession>("research-sessions");

  /** Built-in expert domains with default focus areas. */
  const BUILTIN_EXPERTS: Record<string, ExpertDef> = {
    stack: {
      domain: "stack",
      focus_areas: [
        "languages",
        "frameworks",
        "databases",
        "infrastructure",
        "tooling",
      ],
      description:
        "Technology stack expert — analyzes languages, frameworks, databases, and infrastructure choices",
    },
    architecture: {
      domain: "architecture",
      focus_areas: [
        "patterns",
        "scalability",
        "modularity",
        "data flow",
        "api design",
      ],
      description:
        "Architecture expert — evaluates structural patterns, scalability, and system design",
    },
    security: {
      domain: "security",
      focus_areas: [
        "authentication",
        "authorization",
        "data protection",
        "injection",
        "supply chain",
      ],
      description:
        "Security expert — identifies vulnerabilities, auth gaps, and data protection issues",
    },
    performance: {
      domain: "performance",
      focus_areas: [
        "latency",
        "throughput",
        "memory",
        "caching",
        "optimization",
      ],
      description:
        "Performance expert — analyzes bottlenecks, caching, and optimization opportunities",
    },
    dx: {
      domain: "dx",
      focus_areas: [
        "ergonomics",
        "documentation",
        "error messages",
        "testing",
        "onboarding",
      ],
      description:
        "Developer experience expert — evaluates API ergonomics, documentation, and testing patterns",
    },
  };

  // Tool: Define a research session with expert panel
  pi.registerTool({
    name: "luca_define_experts",
    label: "Define Expert Panel",
    description:
      "Define a parallel research session with multiple expert domains. Use built-in domains (stack, architecture, security, performance, dx) or define custom experts with focus areas.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Research session name (e.g., 'api-redesign-review')",
        },
        context: {
          type: "string",
          description:
            "Research context — what the experts should analyze (e.g., codebase description, feature requirements)",
        },
        experts: {
          type: "string",
          description:
            "Comma-separated expert domains. Use built-in: stack, architecture, security, performance, dx. Or custom: 'custom:domain:focus1|focus2|focus3'",
        },
      },
      required: ["name", "context", "experts"],
    },
    async execute(
      _toolCallId: string,
      params: {
        name: string;
        context: string;
        experts: string;
      },
    ) {
      // Validate session name length
      if (params.name.length > 128) {
        return createTextResponse(
          "Error: session name exceeds maximum length of 128 characters",
        );
      }

      // Sanitize session name for safe storage and file naming
      const safeName = sanitizeName(params.name, 128);
      if (!safeName) {
        return createTextResponse(
          `Error: session name "${params.name}" contains no valid characters. Use alphanumeric, hyphens, or underscores.`,
        );
      }

      const expertDefs: ExpertDef[] = [];

      const expertList = params.experts
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      for (const expertSpec of expertList) {
        if (expertSpec.startsWith("custom:")) {
          // Parse custom expert: custom:domain:focus1|focus2|focus3
          const parts = expertSpec.slice(7).split(":");
          if (parts.length < 2) {
            return createTextResponse(
              `Invalid custom expert format "${expertSpec}". Use: custom:domain:focus1|focus2|focus3`,
            );
          }
          const safeDomain = sanitizeName(parts[0] ?? "", 64);
          if (!safeDomain) {
            return createTextResponse(
              `Error: custom expert domain "${parts[0]}" contains no valid characters. Use alphanumeric, hyphens, or underscores.`,
            );
          }
          expertDefs.push({
            domain: safeDomain,
            focus_areas: parts[1].split("|").map((f) => f.trim()),
            description: `Custom expert — ${safeDomain}`,
          });
        } else {
          const builtin = BUILTIN_EXPERTS[expertSpec];
          if (!builtin) {
            const available = Object.keys(BUILTIN_EXPERTS).join(", ");
            return createTextResponse(
              `Unknown expert domain "${expertSpec}". Available: ${available}. Or use custom:domain:focus1|focus2`,
            );
          }
          expertDefs.push(builtin);
        }
      }

      const session: ResearchSession = {
        name: safeName,
        context: params.context,
        experts: expertDefs,
        findings: [],
        status: "pending",
      };

      sessions.set(safeName, session);

      return createJsonResponse({
        session: session.name,
        expert_count: session.experts.length,
        experts: session.experts.map((e) => ({
          domain: e.domain,
          focus_areas: e.focus_areas,
          description: e.description,
        })),
        instructions: `Research session "${session.name}" created with ${session.experts.length} experts. Call luca_query_expert for each domain to collect findings, then luca_synthesize_research to produce the final synthesis.`,
      });
    },
  });

  // Tool: Query a single expert (one domain at a time, LLM role-plays the expert)
  pi.registerTool({
    name: "luca_query_expert",
    label: "Query Expert",
    description:
      "Submit a finding from one expert domain. The LLM should role-play as the specified expert and provide focused analysis. Call once per expert domain in a session.",
    parameters: {
      type: "object",
      properties: {
        session: {
          type: "string",
          description: "Research session name",
        },
        domain: {
          type: "string",
          description: "Expert domain to query",
        },
        finding: {
          type: "string",
          description: "The expert's analysis and findings",
        },
        confidence: {
          type: "string",
          description: "Confidence level: high, medium, low (default: medium)",
        },
      },
      required: ["session", "domain", "finding"],
    },
    async execute(
      _toolCallId: string,
      params: {
        session: string;
        domain: string;
        finding: string;
        confidence?: string;
      },
    ) {
      const session = sessions.get(params.session);
      if (!session) {
        return createTextResponse(
          `Session "${params.session}" not found. Define one with luca_define_experts.`,
        );
      }

      const expert = session.experts.find((e) => e.domain === params.domain);
      if (!expert) {
        const available = session.experts.map((e) => e.domain).join(", ");
        return createTextResponse(
          `Domain "${params.domain}" not in session. Available: ${available}`,
        );
      }

      const confidence = (params.confidence ?? "medium") as
        | "high"
        | "medium"
        | "low";
      if (!["high", "medium", "low"].includes(confidence)) {
        return createTextResponse(
          `Invalid confidence "${params.confidence}". Use: high, medium, low`,
        );
      }

      const finding: ExpertFinding = {
        domain: params.domain,
        query: session.context,
        finding: params.finding,
        confidence,
        timestamp: new Date().toISOString(),
      };

      session.findings.push(finding);
      session.status = "researching";

      const remaining = session.experts.filter(
        (e) => !session.findings.some((f) => f.domain === e.domain),
      );

      return createJsonResponse({
        session: session.name,
        domain: params.domain,
        confidence,
        findings_collected: session.findings.length,
        total_experts: session.experts.length,
        remaining_domains: remaining.map((e) => e.domain),
        instructions:
          remaining.length > 0
            ? `${remaining.length} expert(s) remaining: ${remaining.map((e) => e.domain).join(", ")}. Query each, then call luca_synthesize_research.`
            : "All experts queried. Call luca_synthesize_research to produce the final synthesis.",
      });
    },
  });

  // Tool: Synthesize all expert findings
  pi.registerTool({
    name: "luca_synthesize_research",
    label: "Synthesize Research",
    description:
      "Synthesize findings from all experts in a research session. Produces a structured summary with cross-domain insights, writes to .planning/research/.",
    parameters: {
      type: "object",
      properties: {
        session: {
          type: "string",
          description: "Research session name",
        },
        synthesis: {
          type: "string",
          description: "The synthesized analysis combining all expert findings",
        },
      },
      required: ["session", "synthesis"],
    },
    async execute(
      _toolCallId: string,
      params: { session: string; synthesis: string },
    ) {
      const session = sessions.get(params.session);
      if (!session) {
        return createTextResponse(`Session "${params.session}" not found.`);
      }

      if (session.findings.length === 0) {
        return createTextResponse(
          "No findings collected yet. Query experts first.",
        );
      }

      session.status = "synthesized";

      // Write synthesis to .planning/research/
      if (!existsSync(researchDir)) {
        mkdirSync(researchDir, { recursive: true });
      }

      const fileName = `${session.name}-synthesis.md`;
      const filePath = join(researchDir, fileName);

      const findingsSummary = session.findings
        .map(
          (f) =>
            `### ${f.domain} (confidence: ${f.confidence})\n\n${f.finding}`,
        )
        .join("\n\n---\n\n");

      const content = `# Research Synthesis: ${session.name}

> Generated: ${new Date().toISOString()}
> Experts: ${session.experts.map((e) => e.domain).join(", ")}
> Context: ${session.context.slice(0, 500)}

## Expert Findings

${findingsSummary}

---

## Synthesis

${params.synthesis}
`;

      writeFileSync(filePath, content, "utf-8");

      return createJsonResponse({
        session: session.name,
        status: "synthesized",
        findings_count: session.findings.length,
        domains: session.findings.map((f) => f.domain),
        output_file: `.planning/research/${fileName}`,
        confidence_breakdown: {
          high: session.findings.filter((f) => f.confidence === "high").length,
          medium: session.findings.filter((f) => f.confidence === "medium")
            .length,
          low: session.findings.filter((f) => f.confidence === "low").length,
        },
      });
    },
  });

  // Tool: List research sessions
  pi.registerTool({
    name: "luca_research_status",
    label: "Research Status",
    description:
      "Get the status of research sessions, including which experts have reported and synthesis state.",
    parameters: {
      type: "object",
      properties: {
        session: {
          type: "string",
          description: "Session name (omit to list all sessions)",
        },
      },
    },
    async execute(_toolCallId: string, params: { session?: string }) {
      if (params.session) {
        const session = sessions.get(params.session);
        if (!session) {
          return createTextResponse(`Session "${params.session}" not found`);
        }

        return createJsonResponse({
          name: session.name,
          status: session.status,
          experts: session.experts.map((e) => ({
            domain: e.domain,
            reported: session.findings.some((f) => f.domain === e.domain),
          })),
          findings_count: session.findings.length,
        });
      }

      const allSessions = sessions.values().map((s) => ({
        name: s.name,
        status: s.status,
        experts: s.experts.length,
        findings: s.findings.length,
      }));

      return createJsonResponse(allSessions);
    },
  });
}
