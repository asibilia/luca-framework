"use client";

import { PageError } from "~/components/shared/page-error";

export default function SessionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Sessions" error={error} reset={reset} />;
}
