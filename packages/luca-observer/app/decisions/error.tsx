"use client";

import { PageError } from "~/components/shared/page-error";

export default function DecisionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Decisions" error={error} reset={reset} />;
}
