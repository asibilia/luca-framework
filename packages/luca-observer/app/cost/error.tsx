"use client";

import { PageError } from "~/components/shared/page-error";

export default function CostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Cost" error={error} reset={reset} />;
}
