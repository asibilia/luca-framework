'use client'

import { useEffect, useRef } from 'react'

import { useSetAtom } from 'jotai'

import { configAtom, configEtagAtom } from '~/stores/config-atoms'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hydrate `configAtom` from `GET /api/config` on mount.
 *
 * Fetches the Luca planning config from the server once and seeds the
 * server-state atom so that downstream consumers (pipeline editor,
 * config draft, save hooks) have data to work with immediately.
 *
 * Safe to call from multiple components -- a `useRef` guard prevents
 * duplicate fetches in React strict-mode double-mount.
 *
 * @example
 * ```tsx
 * function App() {
 *   useConfigHydration();
 *   return <PipelinePage />;
 * }
 * ```
 */
export function useConfigHydration(): void {
    const setConfig = useSetAtom(configAtom)
    const setConfigEtag = useSetAtom(configEtagAtom)
    const fetchedRef = useRef(false)

    useEffect(() => {
        if (fetchedRef.current) return
        fetchedRef.current = true

        void (async () => {
            try {
                const res = await fetch('/api/config')
                if (!res.ok) return

                const etag = res.headers.get('ETag')
                if (etag) setConfigEtag(etag)

                const data = (await res.json()) as Record<string, unknown>
                setConfig(data)
            } catch {
                // Graceful degradation -- configAtom stays null and consumers
                // fall back to their default behavior.
            }
        })()
    }, [setConfig, setConfigEtag])
}
