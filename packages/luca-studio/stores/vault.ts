import { atomWithStorage } from "jotai/utils";

/**
 * Selected vault atom persisted in localStorage.
 *
 * Stores the active MuninnDB vault name under "luca-studio-vault".
 * Defaults to "default" on first visit. All API-fetching hooks should
 * read this atom to scope data to the selected vault.
 */
export const vaultAtom = atomWithStorage<string>(
  "luca-studio-vault",
  "default",
);
