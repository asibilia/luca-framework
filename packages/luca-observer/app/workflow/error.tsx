"use client";

import { PageError } from "~/components/shared/page-error";

export default function WorkflowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Workflow" error={error} reset={reset} />;
}
