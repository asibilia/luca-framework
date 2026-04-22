'use client'

import { PageError } from '~/components/shared/page-error'

export default function MemoryError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return <PageError pageName="Memory" error={error} reset={reset} />
}
