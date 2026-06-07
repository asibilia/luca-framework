'use client'

import { useCallback, useEffect, useState } from 'react'

import { useAtom } from 'jotai'
import { Database, ChevronDown } from 'lucide-react'

import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '~/components/ui/tooltip'
import { vaultAtom } from '~/stores/vault'

/**
 * Vault selector dropdown for the site header.
 *
 * Fetches available vaults from /api/muninn/vaults on mount and
 * renders a styled select element next to the theme toggle.
 * Selected vault is persisted in localStorage via the vaultAtom.
 */
export function VaultSelector() {
    const [vault, setVault] = useAtom(vaultAtom)
    const [vaults, setVaults] = useState<string[]>([])
    const [loading, setLoading] = useState(true)

    const fetchVaults = useCallback(async () => {
        try {
            const res = await fetch('/api/muninn/vaults')
            if (!res.ok) return
            const data = (await res.json()) as string[]
            if (Array.isArray(data)) {
                setVaults(data)
                // If the persisted vault no longer exists, reset to first available
                if (data.length > 0 && !data.includes(vault)) {
                    setVault(data[0]!)
                }
            }
        } catch {
            // Silently fail — vaults list is best-effort
        } finally {
            setLoading(false)
        }
    }, [vault, setVault])

    useEffect(() => {
        void fetchVaults()
    }, [fetchVaults])

    if (loading || vaults.length <= 1) {
        // Don't show selector if there's only one vault or still loading
        return null
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="relative inline-flex items-center">
                    <Database className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
                    <select
                        value={vault}
                        onChange={(e) => setVault(e.target.value)}
                        aria-label="Select vault"
                        className="h-8 cursor-pointer appearance-none rounded-md border border-input bg-transparent py-1 pl-8 pr-7 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                        {vaults.map((v) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 size-3 text-muted-foreground" />
                </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                <span className="text-xs">Switch MuninnDB vault</span>
            </TooltipContent>
        </Tooltip>
    )
}
