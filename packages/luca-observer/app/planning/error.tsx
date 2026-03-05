"use client";

import { PageError } from "~/components/shared/page-error";

export default function PlanningError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Planning" error={error} reset={reset} />;
}
