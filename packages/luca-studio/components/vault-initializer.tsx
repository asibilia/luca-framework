"use client";

import { useEffect } from "react";

import { useSetAtom } from "jotai";
import get from "lodash/get";

import { vaultAtom } from "~/stores/vault";

/**
 * VaultInitializer — renderless component that auto-detects the project vault.
 *
 * On first mount it fetches `/api/config` (which serves `.planning/config.json`)
 * and reads `muninn.vault`. If the user has not explicitly chosen a vault
 * (localStorage key "luca-studio-vault" is absent or still at the factory
 * default "default"), the atom is updated to the project vault so that
 * session engrams stored in the project vault are visible immediately.
 *
 * If the user has already selected a custom vault (i.e. the stored value is
 * something other than "default"), their choice is preserved.
 *
 * This runs exactly once per page load — no polling.
 */
export function VaultInitializer() {
  const setVault = useSetAtom(vaultAtom);

  useEffect(() => {
    // atomWithStorage serialises values as JSON, so the stored string for the
    // default "default" value appears as '"default"' (with surrounding quotes).
    const stored = localStorage.getItem("luca-studio-vault");
    const isDefault = !stored || stored === '"default"' || stored === "default";

    // User already picked a non-default vault — honour their choice.
    if (!isDefault) return;

    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        const configVault = get(config, "muninn.vault", "") as string;
        if (configVault && configVault !== "default") {
          setVault(configVault);
        }
      })
      .catch(() => {
        /* graceful degradation — keep "default" if fetch fails */
      });
  }, [setVault]);

  // Renderless — no DOM output.
  return null;
}
