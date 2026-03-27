import { redirect } from "next/navigation";

/**
 * Decisions page redirect.
 *
 * Decision content is accessible under the Sessions page.
 * Redirects to /sessions for backward compatibility.
 */
export default function DecisionsPage() {
  redirect("/sessions");
}
