import { PageContainer } from '~/components/layout/page-container'
import { LoadingSkeleton } from '~/components/shared/loading-skeleton'

export default function SessionsLoading() {
    return (
        <PageContainer title="Sessions" subtitle="Session Explorer">
            <LoadingSkeleton variant="card" />
            <div className="grid gap-6 lg:grid-cols-3">
                <LoadingSkeleton variant="text" rows={6} />
                <LoadingSkeleton variant="text" rows={6} />
                <LoadingSkeleton variant="text" rows={6} />
            </div>
        </PageContainer>
    )
}
