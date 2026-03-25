/**
 * VS Code / GitHub Copilot adapter — compiles Luca definitions to .github/ directory artifacts.
 */
export {
  createVscodeAdapter,
  compileVscodeAgent,
  compileVscodeSkill,
  compileVscodeRule,
} from "./vscode-adapter";
export {
  VSCODE_TOOL_MAP,
  translateVscodeToolName,
} from "./vscode-tool-map";
export type { ToolTranslationResult } from "./vscode-tool-map";
export {
  VSCODE_EVENT_MAP,
  VSCODE_HOOK_PREVIEW_WARNING,
  translateVscodeEvent,
} from "./vscode-hook-map";
export type { VscodeEventMapping } from "./vscode-hook-map";
