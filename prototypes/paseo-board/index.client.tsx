import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MissionControlSurface } from "./client/variant-a-mission-control";
import { DenseListPanel } from "./client/variant-b-dense-list";
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
 * Throwaway prototype for asibilia/luca-framework#343: the same fake Luca run in three places.
 * A: sidebar surface. B: workspace panel. C: rows in an agent's timeline via /luca-board-demo.
 */
export default function contribute(client: PluginClientContext) {
  // A: sidebar surface.
  client.addSurface("board", MissionControlSurface);
  client.addSidebarItem({
    id: "board",
    title: "Luca board (prototype)",
    icon: "Kanban",
    surface: "board",
  });
  client.addCommandCenterItem({
    id: "open-board",
    title: "Luca board (prototype): A, mission control",
    icon: "Kanban",
    keywords: ["luca", "board", "prototype", "run", "tickets"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("board");
    },
  });

  // B: workspace panel, a tab beside agents, terminals and files.
  client.addWorkspacePanel({
    id: "board-list",
    title: "Luca board (prototype)",
    icon: "Rows3",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: DenseListPanel,
  });
  client.addCommandCenterItem({
    id: "open-board-list",
    title: "Luca board (prototype): B, dense list tab",
    icon: "Rows3",
    keywords: ["luca", "board", "prototype", "panel", "list"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("board-list");
    },
  });
  client.addCommandCenterItem({
    id: "open-board-list-explorer",
    title: "Luca board (prototype): B, dense list in the Explorer",
    icon: "Rows3",
    keywords: ["luca", "board", "prototype", "explorer", "list"],
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
