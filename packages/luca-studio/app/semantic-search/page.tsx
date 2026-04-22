import { redirect } from 'next/navigation'

/**
 * Semantic Search page redirect.
 *
 * This page has been absorbed into the Memory page Search tab.
 * Redirects to /memory?tab=search for backward compatibility.
 */
export default function SemanticSearchPage() {
    redirect('/memory?tab=search')
}
