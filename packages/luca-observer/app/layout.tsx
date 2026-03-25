import type { ReactNode } from "react";

import type { Metadata } from "next";

import { Sidebar } from "~/components/layout/sidebar";
import { Header } from "~/components/layout/header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

import { Providers } from "./providers";

import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "~/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Luca Observer",
  description: "Real-time dashboard for Luca workflow observability",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", inter.variable)}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("luca-observer-theme");try{t=JSON.parse(t)}catch(e){}if(t==="dark"){document.documentElement.classList.add("dark")}else if(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <Providers>
          <SidebarProvider
            style={
              {
                "--sidebar-width": "calc(var(--spacing) * 72)",
                "--header-height": "calc(var(--spacing) * 12)",
              } as React.CSSProperties
            }
          >
            <Sidebar variant="inset" />
            <SidebarInset>
              <Header />
              <div className="flex flex-1 flex-col overflow-auto">
                <div className="@container/main flex flex-1 flex-col gap-2">
                  {children}
                </div>
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
