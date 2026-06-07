import type { ReactNode } from 'react'

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { Header } from '~/components/layout/header'
import { LayoutShell } from '~/components/layout/layout-shell'
import { NavContent } from '~/components/layout/nav-content'
import { cn } from '~/lib/utils'

import { Providers } from './providers'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
    title: 'Luca Studio',
    description: 'Real-time dashboard for Luca workflow observability',
}

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={cn('font-sans', inter.variable)}
        >
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem("luca-studio-theme");try{t=JSON.parse(t)}catch(e){}if(t==="dark"){document.documentElement.classList.add("dark")}else if(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})()`,
                    }}
                />
            </head>
            <body className="overflow-hidden">
                <Providers>
                    <LayoutShell navChildren={<NavContent />}>
                        <Header />
                        <div className="flex flex-1 flex-col overflow-auto">
                            <div className="@container/main flex flex-1 flex-col gap-2">
                                {children}
                            </div>
                        </div>
                    </LayoutShell>
                </Providers>
            </body>
        </html>
    )
}
