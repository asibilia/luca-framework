"use client";

import { redirect } from "next/navigation";

/**
 * Vault page redirect.
 *
 * This page has been absorbed into the Memory page Health tab.
 * Redirects to /memory?tab=health for backward compatibility.
 */
export default function VaultPage() {
  redirect("/memory?tab=health");
}
