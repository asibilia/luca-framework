import { redirect } from "next/navigation";

/**
 * Learning page redirect.
 *
 * This page has been absorbed into the Memory page Learning tab.
 * Redirects to /memory?tab=learning for backward compatibility.
 */
export default function LearningPage() {
  redirect("/memory?tab=learning");
}
