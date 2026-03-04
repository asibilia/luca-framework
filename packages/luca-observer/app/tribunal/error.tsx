"use client";

import { PageError } from "~/components/shared/page-error";

export default function TribunalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Tribunal" error={error} reset={reset} />;
}
