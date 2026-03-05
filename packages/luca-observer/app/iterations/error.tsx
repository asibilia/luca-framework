"use client";

import { PageError } from "~/components/shared/page-error";

export default function IterationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Iterations" error={error} reset={reset} />;
}
