import type { PluginClientContext } from "@getpaseo/plugin/client";
import { StageStackPanel } from "./client/variant-b-stage-stack";
import { EventRowLine, LimitRowCard, RunRowCard, StuckRowCard } from "./client/variant-c-timeline-rows";
import {
  ROW_KIND,
  ROW_VERSION,
  eventRowSchema,
  feedControlRpc,
  limitRowSchema,
  runRowSchema,
  stuckRowSchema,
} from "./shared/board";

/**
 * Throwaway prototype for asibilia/luca-framework#343: the same fake Luca run in two places.
 * B: a stage-stack workspace panel. C: rows in an agent's timeline via /luca-board-demo.
 * Variant A (the sidebar surface) was retired in v2; it lives on in the branch history at 222e34c.
 */
export default function contribute(client: PluginClientContext) {
  // B: workspace panel, a tab beside agents, terminals and files.
  client.addWorkspacePanel({
    id: "board-list",
    title: "Luca board (prototype)",
    icon: "Rows3",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: StageStackPanel,
  });
  client.addCommandCenterItem({
    id: "open-board-list",
    title: "Luca board (prototype)",
    icon: "Rows3",
    keywords: ["luca", "board", "prototype", "run", "tickets", "stages"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("board-list");
    },
  });
  client.addCommandCenterItem({
    id: "open-board-list-explorer",
    title: "Luca board (prototype) in the Explorer",
    icon: "Rows3",
    keywords: ["luca", "board", "prototype", "explorer", "stages"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("board-list", { location: "explorer" });
    },
  });

  // C: plugin-owned timeline rows, pushed by the daemon into the agent the command runs in.
  client.addSlashCommand({
    name: "luca-board-demo",
    description: "Prototype: stream a fake Luca run into this timeline (UI rows only, nothing reaches the agent)",
    argumentHint: "[stop]",
    context: "agent",
    async onSubmit({ args, agent, rpc }) {
      const action = args.trim().toLowerCase() === "stop" ? "stop" : "start";
      const result = await rpc(feedControlRpc, { agentId: agent.id, action });
      if (!result.ok) {
        throw new Error(result.message);
      }
    },
  });
  client.addTimelineRenderer({ kind: ROW_KIND.run, version: ROW_VERSION, schema: runRowSchema, Component: RunRowCard });
  client.addTimelineRenderer({ kind: ROW_KIND.event, version: ROW_VERSION, schema: eventRowSchema, Component: EventRowLine });
  client.addTimelineRenderer({ kind: ROW_KIND.stuck, version: ROW_VERSION, schema: stuckRowSchema, Component: StuckRowCard });
  client.addTimelineRenderer({ kind: ROW_KIND.limit, version: ROW_VERSION, schema: limitRowSchema, Component: LimitRowCard });

  return () => {};
}
