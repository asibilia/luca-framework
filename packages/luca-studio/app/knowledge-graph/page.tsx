'use client'

import { redirect } from 'next/navigation'

/**
 * Knowledge Graph page redirect.
 *
 * This page has been absorbed into the Memory page Graph tab.
 * Redirects to /memory?tab=graph for backward compatibility.
 */
export default function KnowledgeGraphPage() {
    redirect('/memory?tab=graph')
}
