/**
 * Shared mock factory for Pi extension testing.
 *
 * Provides a unified `createMockPi()` that replaces 6 divergent local
 * implementations across Pi test files. Uses Maps internally for O(1)
 * lookup by name, with helper methods to find tools/commands/events.
 */
import type {
  PiExtensionAPI,
  PiExtensionContext,
  PiContextUI,
} from "~/hooks/pi-extensions/__types/pi-context";

// ─── Mock Pi API ────────────────────────────────────────────────────────────

export interface MockPiResult {
  /** The pi API object to pass to extension default exports. */
  api: PiExtensionAPI;
  /** All registered tools, keyed by name. */
  tools: Map<string, any>;
  /** All registered event handlers, keyed by event name. */
  events: Map<string, Function[]>;
  /** All registered commands, keyed by command name. */
  commands: Map<string, any>;
  /** All registered keybindings. */
  keybindings: Array<{ key: string; config: any }>;
  /** All registered message renderers, keyed by custom type. */
  messageRenderers: Map<string, Function>;
  /** All appendEntry calls recorded. */
  entries: Array<{ type: string; data: Record<string, unknown> }>;
  /** All sendMessage calls recorded. */
  sentMessages: Array<{ message: any; options?: any }>;
  /** Current model (set by setModel). */
  currentModel: string | null;
  /** Current active tools (set by setActiveTools). */
  activeTools: string[] | null;
  /** Current thinking level (set by setThinkingLevel). */
  thinkingLevel: string | null;

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Get a registered tool by name. Throws if not found. */
  getTool(name: string): any;
  /** Get event handlers for a given event name. */
  getEventHandlers(event: string): Function[];
  /** Fire all handlers for a given event. */
  fireEvent(event: string, eventData?: any, ctx?: any): Promise<void>;
  /** Get a registered command by name. */
  getCommand(name: string): any;
}

/**
 * Create a unified mock Pi API for testing extensions.
 *
 * @returns MockPiResult with the api object and inspection helpers
 *
 * @example
 * ```typescript
 * const mock = createMockPi();
 * lucaComplexity(mock.api);
 * expect(mock.tools.size).toBe(3);
 * const result = await mock.getTool("luca_read_complexity").execute("id", {});
 * ```
 */
export function createMockPi(): MockPiResult {
  const tools = new Map<string, any>();
  const events = new Map<string, Function[]>();
  const commands = new Map<string, any>();
  const keybindings: Array<{ key: string; config: any }> = [];
  const messageRenderers = new Map<string, Function>();
  const entries: Array<{ type: string; data: Record<string, unknown> }> = [];
  const sentMessages: Array<{ message: any; options?: any }> = [];
  let currentModel: string | null = null;
  let activeTools: string[] | null = null;
  let thinkingLevel: string | null = null;

  const api: PiExtensionAPI = {
    registerTool: (def: any) => tools.set(def.name, def),
    on: (event: string, handler: Function) => {
      if (!events.has(event)) events.set(event, []);
      events.get(event)!.push(handler);
    },
    registerCommand: (name: string, opts: any) => commands.set(name, opts),
    registerKeybinding: (key: string, config: any) =>
      keybindings.push({ key, config }),
    registerMessageRenderer: (type: string, renderer: Function) =>
      messageRenderers.set(type, renderer),
    sendMessage: (message: any, options?: any) =>
      sentMessages.push({ message, options }),
    appendEntry: (type: string, data: Record<string, unknown>) =>
      entries.push({ type, data }),
    setModel: (model: string) => {
      currentModel = model;
    },
    getModel: () => currentModel,
    setActiveTools: (names: string[]) => {
      activeTools = names;
    },
    getActiveTools: () => activeTools,
    setThinkingLevel: (level: string) => {
      thinkingLevel = level;
    },
    getThinkingLevel: () => thinkingLevel,
    executeCommand: (name: string) => {
      const cmd = commands.get(name);
      if (cmd?.handler) cmd.handler({});
    },
  };

  return {
    api,
    tools,
    events,
    commands,
    keybindings,
    messageRenderers,
    entries,
    sentMessages,
    get currentModel() {
      return currentModel;
    },
    get activeTools() {
      return activeTools;
    },
    get thinkingLevel() {
      return thinkingLevel;
    },

    getTool(name: string) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool "${name}" not registered`);
      return tool;
    },
    getEventHandlers(event: string) {
      return events.get(event) ?? [];
    },
    async fireEvent(event: string, eventData: any = {}, ctx: any = {}) {
      const handlers = events.get(event) ?? [];
      for (const handler of handlers) {
        await handler(eventData, ctx);
      }
    },
    getCommand(name: string) {
      return commands.get(name);
    },
  };
}

// ─── Mock Context ───────────────────────────────────────────────────────────

export interface MockCtxResult {
  /** The ctx object to pass to event handlers / tool execute. */
  ctx: PiExtensionContext;
  /** All notifications recorded. */
  notifications: Array<{ message: string; level?: string }>;
  /** All system contexts injected. */
  systemContexts: Array<{ key: string; content: string }>;
}

/**
 * Create a mock PiExtensionContext for testing.
 *
 * @param overrides - Partial overrides for the context
 * @returns MockCtxResult with the ctx object and recording arrays
 */
export function createMockCtx(
  overrides?: Partial<PiExtensionContext>,
): MockCtxResult {
  const notifications: Array<{ message: string; level?: string }> = [];
  const systemContexts: Array<{ key: string; content: string }> = [];

  const ui: PiContextUI = {
    notify: (message: string, level?: string) =>
      notifications.push({ message, level }),
    confirm: async () => true,
    select: async () => null,
    input: async () => null,
    setStatus: () => {},
    setFooter: () => {},
    setWidget: () => {},
  };

  const ctx: PiExtensionContext = {
    ui,
    cwd: process.cwd(),
    hasUI: true,
    addSystemContext: (key: string, content: string) =>
      systemContexts.push({ key, content }),
    ...overrides,
  };

  return { ctx, notifications, systemContexts };
}
