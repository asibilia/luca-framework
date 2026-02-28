import { mock } from "bun:test";

export interface ClackMockConfig {
  groupResponse?: Record<string, unknown> | null;
  selectResponses?: (string | symbol)[];
  multiselectResponse?: string[] | symbol;
  confirmResponse?: boolean | symbol;
  textResponses?: (string | symbol)[];
}

const CANCEL_SYMBOL = Symbol.for("cancel");

export function createWizardResponses(options: {
  cancel?: false;
  frameworkName?: string;
  commandPrefix?: string;
  stack?: string;
  workTracker?: string;
}): ClackMockConfig {
  return {
    groupResponse: {
      frameworkName: options.frameworkName ?? "Luca",
      commandPrefix: options.commandPrefix ?? "lu",
      ticketPattern: "[A-Z]+-\\d+",
      placeholderTicket: "PROJ-0000",
    },
    selectResponses: [options.stack ?? "custom", options.workTracker ?? "none"],
    confirmResponse: true,
  };
}

export function createCancelledWizardResponses(
  cancelAt: "group" | "stack" | "tracker" | "confirm",
): ClackMockConfig {
  if (cancelAt === "group") return { groupResponse: null };
  if (cancelAt === "stack")
    return {
      groupResponse: {
        frameworkName: "Luca",
        commandPrefix: "lu",
        ticketPattern: "[A-Z]+-\\d+",
        placeholderTicket: "PROJ-0000",
      },
      selectResponses: [CANCEL_SYMBOL],
    };
  if (cancelAt === "tracker")
    return {
      groupResponse: {
        frameworkName: "Luca",
        commandPrefix: "lu",
        ticketPattern: "[A-Z]+-\\d+",
        placeholderTicket: "PROJ-0000",
      },
      selectResponses: ["custom", CANCEL_SYMBOL],
    };
  return {
    groupResponse: {
      frameworkName: "Luca",
      commandPrefix: "lu",
      ticketPattern: "[A-Z]+-\\d+",
      placeholderTicket: "PROJ-0000",
    },
    selectResponses: ["custom", "none"],
    confirmResponse: CANCEL_SYMBOL as unknown as boolean,
  };
}

export function installClackMock(config: ClackMockConfig) {
  let selectCallIndex = 0;
  let textCallIndex = 0;

  mock.module("@clack/prompts", () => ({
    intro: () => {},
    outro: () => {},
    cancel: () => {},
    note: () => {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
    spinner: () => ({
      start: () => {},
      stop: () => {},
    }),
    isCancel: (value: unknown) => typeof value === "symbol",
    group: async () => config.groupResponse,
    select: async () => {
      const response = config.selectResponses?.[selectCallIndex] ?? "default";
      selectCallIndex++;
      return response;
    },
    multiselect: async () => config.multiselectResponse ?? ["claude", "cursor"],
    confirm: async () => config.confirmResponse ?? true,
    text: async () => {
      const response = config.textResponses?.[textCallIndex] ?? "default";
      textCallIndex++;
      return response;
    },
  }));
}
