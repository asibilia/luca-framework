"use client";

import { PageError } from "~/components/shared/page-error";

export default function NotesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError pageName="Notes" error={error} reset={reset} />;
}
