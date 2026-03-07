/**
 * Luca Agent Chain Extension for Pi
 *
 * Provides sequential agent pipeline orchestration. Define chains of
 * agent roles that execute in order, with each step's output feeding
 * the next step's context. Tracks pipeline state and supports
 * checkpoint-based resumption.
 *
 * Source: src/hooks/pi-extensions/luca-chain.ts
 * Deployed to: .pi/extensions/luca-chain.ts
 */
import { existsSync } from "fs";
import { join } from "path";

import type { PiExtensionAPI } from "./__types/pi-context";

import { createRegistry } from "./__helpers/registry";
import { createJsonResponse, createTextResponse } from "./__helpers/response";
import { isValidIdentifier } from "./__helpers/sanitize";
import { readAgentDef } from "./__helpers/spawn";

/** A single step in an agent chain. */
interface ChainStep {
  agent: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
}

/** A named agent chain (pipeline). */
interface Chain {
  name: string;
  description: string;
  steps: ChainStep[];
  currentStep: number;
  status: "pending" | "running" | "completed" | "failed";
}

/**
 * Pi extension: Agent chain orchestration.
 *
 * Registers tools for defining, advancing, and querying sequential
 * agent pipelines. Each chain step specifies an agent role and task,
 * with context passed between steps.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaChain(pi: PiExtensionAPI) {
  const cwd = process.cwd();
  const agentsDir = join(cwd, ".pi", "agents");

  /** Active chains. */
  const chains = createRegistry<Chain>("chains");

  /**
   * Read agent persona summary for chain context injection.
   *
   * Uses readAgentDef() to load the agent's definition and extracts the
   * description from its YAML frontmatter.
   *
   * @param agentName - Agent identifier (matches filename in .pi/agents/)
   * @returns Description string, or a "not found" message if file missing
   */
  function getAgentSummary(agentName: string): string {
    const def = readAgentDef(cwd, agentName);
    return def?.frontmatter?.description ?? `Agent "${agentName}" not found`;
  }

  // Tool: Define a new chain
  pi.registerTool({
    name: "luca_define_chain",
    label: "Define Agent Chain",
    description:
      "Define a sequential agent pipeline. Each step specifies an agent role and a task. Steps execute in order, with each step receiving the previous step's output as context.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Chain name (e.g., 'plan-execute-verify')",
        },
        description: {
          type: "string",
          description: "What this pipeline achieves",
        },
        steps: {
          type: "string",
          description:
            "Pipeline steps as 'agent:task' pairs separated by ' -> '. Example: 'lu-planner:Create plan for feature X -> lu-executor:Execute the plan -> lu-verifier:Verify implementation'",
        },
      },
      required: ["name", "steps"],
    },
    async execute(
      _toolCallId: string,
      params: {
        name: string;
        description?: string;
        steps: string;
      },
    ) {
      // Validate chain name
      if (!isValidIdentifier(params.name)) {
        return createTextResponse(
          `Invalid chain name "${params.name}". Only alphanumeric characters, hyphens, and underscores are allowed.`,
        );
      }

      // Parse steps from 'agent:task -> agent:task' format
      const stepDefs = params.steps
        .split("->")
        .map((s) => s.trim())
        .filter(Boolean);

      const chainSteps: ChainStep[] = [];
      for (const stepDef of stepDefs) {
        const colonIdx = stepDef.indexOf(":");
        if (colonIdx === -1) {
          return createTextResponse(
            `Invalid step format "${stepDef}". Expected "agent:task".`,
          );
        }
        const agent = stepDef.slice(0, colonIdx).trim();
        const task = stepDef.slice(colonIdx + 1).trim();

        // Validate agent name contains only safe characters
        if (!isValidIdentifier(agent)) {
          return createTextResponse(
            `Invalid agent name "${agent}" in step "${stepDef}". Only alphanumeric characters, hyphens, and underscores are allowed.`,
          );
        }

        // Validate agent exists
        if (!existsSync(join(agentsDir, `${agent}.md`))) {
          return createTextResponse(
            `Agent "${agent}" not found in .pi/agents/`,
          );
        }

        chainSteps.push({
          agent,
          task,
          status: "pending",
        });
      }

      const chain: Chain = {
        name: params.name,
        description: params.description ?? "",
        steps: chainSteps,
        currentStep: 0,
        status: "pending",
      };

      chains.set(params.name, chain);

      return createJsonResponse({
        chain: chain.name,
        steps: chain.steps.map((s, i) => ({
          step: i + 1,
          agent: s.agent,
          task: s.task,
        })),
        total_steps: chain.steps.length,
      });
    },
  });

  // Tool: Get next step in chain
  pi.registerTool({
    name: "luca_chain_next",
    label: "Next Chain Step",
    description:
      "Get the next step in an agent chain. Returns the agent role, task, and any previous step output for context handoff. Optionally provide the output from the previous step.",
    parameters: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Chain name",
        },
        previous_output: {
          type: "string",
          description:
            "Output from the previous step to pass as context to the next step",
        },
      },
      required: ["chain"],
    },
    async execute(
      _toolCallId: string,
      params: { chain: string; previous_output?: string },
    ) {
      const chain = chains.get(params.chain);
      if (!chain) {
        return createTextResponse(
          `Chain "${params.chain}" not found. Define one with luca_define_chain.`,
        );
      }

      // Record previous step output if provided
      if (params.previous_output && chain.currentStep > 0) {
        const prevStep = chain.steps[chain.currentStep - 1];
        if (prevStep) {
          prevStep.output = params.previous_output;
          prevStep.status = "completed";
        }
      }

      // Check if chain is complete
      if (chain.currentStep >= chain.steps.length) {
        chain.status = "completed";
        return createJsonResponse({
          chain: chain.name,
          status: "completed",
          message: "All steps completed",
          steps: chain.steps.map((s, i) => ({
            step: i + 1,
            agent: s.agent,
            status: s.status,
            output_preview: s.output ? s.output.slice(0, 200) : null,
          })),
        });
      }

      // Get current step
      const step = chain.steps[chain.currentStep];
      if (!step) {
        chain.status = "completed";
        return createTextResponse(`Chain "${chain.name}" has no more steps.`);
      }
      step.status = "running";
      chain.status = "running";
      chain.currentStep++;

      // Build context from previous steps
      const previousOutputs = chain.steps
        .filter((s) => s.status === "completed" && s.output)
        .map((s) => `[${s.agent}]: ${s.output!.slice(0, 1000)}`)
        .join("\n\n");

      // Single readAgentDef call for description + metadata
      const agentDef = readAgentDef(cwd, step.agent);
      const agentDesc =
        agentDef?.frontmatter?.description ?? `Agent "${step.agent}" not found`;
      const background_spawnable = agentDef?.frontmatter?.background_spawnable;
      const purpose = agentDef?.frontmatter?.purpose;

      return createJsonResponse({
        chain: chain.name,
        step_number: chain.currentStep,
        total_steps: chain.steps.length,
        agent: step.agent,
        agent_description: agentDesc,
        purpose: purpose ?? null,
        background_spawnable: background_spawnable ?? null,
        task: step.task,
        previous_context: previousOutputs || null,
        instructions: `Execute this step as the "${step.agent}" agent. When complete, call luca_chain_next with the output to advance to the next step.`,
      });
    },
  });

  // Tool: Get chain status
  pi.registerTool({
    name: "luca_chain_status",
    label: "Chain Status",
    description:
      "Get the current status of an agent chain, including which steps are complete and which are pending.",
    parameters: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Chain name (omit to list all chains)",
        },
      },
    },
    async execute(_toolCallId: string, params: { chain?: string }) {
      if (params.chain) {
        const chain = chains.get(params.chain);
        if (!chain) {
          return createTextResponse(`Chain "${params.chain}" not found`);
        }
        return createJsonResponse({
          name: chain.name,
          status: chain.status,
          current_step: chain.currentStep,
          total_steps: chain.steps.length,
          steps: chain.steps.map((s, i) => ({
            step: i + 1,
            agent: s.agent,
            task: s.task,
            status: s.status,
          })),
        });
      }

      // List all chains
      const allChains = chains.values().map((c) => ({
        name: c.name,
        status: c.status,
        progress: `${c.steps.filter((s) => s.status === "completed").length}/${c.steps.length}`,
      }));

      return createJsonResponse(allChains);
    },
  });
}
