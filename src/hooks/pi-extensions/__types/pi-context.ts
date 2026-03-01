/**
 * Type definitions for Pi extension API objects.
 *
 * Provides interfaces for the `pi` (PiExtensionAPI) and `ctx`
 * (PiExtensionContext) objects passed to Pi extensions. Derived from
 * observed usage across all 15+ extensions in this codebase.
 *
 * All methods are optional to support defensive coding patterns —
 * extensions already guard with `?.` for backward compatibility with
 * older Pi versions.
 *
 * Source: src/hooks/pi-extensions/__types/pi-context.ts
 * Deployed to: .pi/extensions/__types/pi-context.ts
 */

// ─── Tool Response ──────────────────────────────────────────────────────────

/** Standard tool response returned by tool execute handlers. */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}

// ─── Tool Registration ──────────────────────────────────────────────────────

/** Configuration for registering a tool with Pi. */
export interface PiToolConfig {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    params: any,
    signal?: AbortSignal,
    onUpdate?: any,
    ctx?: PiExtensionContext,
  ): Promise<ToolResponse>;
  renderCall?(args: any, theme: any): string;
  renderResult?(result: any, opts: any, theme: any): string;
}

/** Configuration for registering a slash command with Pi. */
export interface PiCommandConfig {
  description: string;
  handler(args: any, ctx: PiExtensionContext): Promise<void>;
}

/** Configuration for registering a keybinding with Pi. */
export interface PiKeybindingConfig {
  description: string;
  handler(ctx: PiExtensionContext): Promise<void>;
}

/** Message payload for sendMessage / registerMessageRenderer. */
export interface PiMessage {
  customType?: string;
  content?: string;
  display?: boolean;
  details?: Record<string, unknown>;
}

// ─── PiExtensionAPI ─────────────────────────────────────────────────────────

/**
 * The Pi extension registration API.
 *
 * Passed as the sole argument to each extension's default export function.
 * Extensions use this to register tools, commands, keybindings, event
 * handlers, and message renderers.
 */
export interface PiExtensionAPI {
  /** Register a tool available to the LLM. */
  registerTool(config: PiToolConfig): void;

  /** Register a user-facing slash command. */
  registerCommand?(name: string, config: PiCommandConfig): void;

  /** Register a keyboard shortcut. */
  registerKeybinding?(shortcut: string, config: PiKeybindingConfig): void;

  /** Subscribe to a Pi session event. Handlers may return a blocking response for tool_call events. */
  on(
    event: string,
    handler: (
      event: any,
      ctx: PiExtensionContext,
    ) => void | Promise<void | { block: boolean; reason: string }>,
  ): void;

  /** Register a custom message type renderer. */
  registerMessageRenderer?(
    customType: string,
    renderer: (message: PiMessage) => string,
  ): void;

  /** Send a follow-up message to the conversation. */
  sendMessage?(message: PiMessage, options?: { deliverAs?: "followUp" }): void;

  /** Append a session log entry. */
  appendEntry?(type: string, data: Record<string, unknown>): void;

  /** Set the active model. */
  setModel?(model: string): void;

  /** Get the current model name. */
  getModel?(): string | null;

  /** Restrict available tools to a subset. */
  setActiveTools?(toolNames: string[]): void;

  /** Get current tool restrictions. */
  getActiveTools?(): string[] | null;

  /** Set the thinking/reasoning level. */
  setThinkingLevel?(level: string): void;

  /** Get the current thinking level. */
  getThinkingLevel?(): string | null;

  /** Execute a registered command by name. */
  executeCommand?(commandName: string): void;
}

// ─── PiContextUI ────────────────────────────────────────────────────────────

/**
 * The UI layer available on the Pi extension context.
 *
 * Provides methods for displaying notifications, dialogs, status
 * indicators, and widgets. All methods are optional — headless Pi
 * sessions may not have a UI.
 */
export interface PiContextUI {
  /** Display a notification banner. */
  notify?(message: string, level?: "info" | "warn" | "error"): void;

  /** Show a confirmation dialog. Returns true if confirmed. */
  confirm?(title: string, body: string): Promise<boolean>;

  /** Show a selection dialog. Returns selected value or null. */
  select?(
    title: string,
    options: Array<{ label: string; value: string }>,
  ): Promise<string | null>;

  /** Show a text input dialog. Returns entered text or null. */
  input?(prompt: string, defaultValue?: string): Promise<string | null>;

  /** Set a status message in the footer bar. */
  setStatus?(key: string, message: string): void;

  /** Set a custom footer renderer. */
  setFooter?(renderer: (theme: any) => string): void;

  /** Register a persistent widget. Pass null factory to remove. */
  setWidget?(
    key: string,
    factory?: ((ui: any, theme: any) => any) | null,
  ): void;

  /** Theme object with color methods. */
  theme?: any;
}

// ─── PiExtensionContext ─────────────────────────────────────────────────────

/**
 * The context object passed to Pi event handlers and tool execute calls.
 *
 * Provides access to UI methods, session information, and control
 * mechanisms like abort signals and system context injection.
 */
export interface PiExtensionContext {
  /** UI interaction layer (notifications, dialogs, widgets). */
  ui?: PiContextUI;

  /** Current working directory. */
  cwd?: string;

  /** Current model name. */
  model?: string;

  /** Whether UI is available in this session. */
  hasUI?: boolean;

  /** Inject content into the system prompt. */
  addSystemContext?(key: string, content: string): void;

  /** Abort the current tool execution. */
  abort?(): void;

  /** AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;

  /** Get context window token usage. */
  getContextUsage?(): {
    totalTokens?: number;
    total?: number;
    maxTokens?: number;
    limit?: number;
  };
}
