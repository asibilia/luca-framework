"use client";

import { PageError } from "~/components/shared/page-error";

export default function HarnessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Harness" error={error} reset={reset} />;
}
