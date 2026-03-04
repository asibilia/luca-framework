"use client";

import { PageError } from "~/components/shared/page-error";

export default function AgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Agents" error={error} reset={reset} />;
}
