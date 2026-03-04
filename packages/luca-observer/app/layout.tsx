import type { ReactNode } from "react";

import type { Metadata } from "next";

import { Sidebar } from "~/components/layout/sidebar";
import { Header } from "~/components/layout/header";

import { Providers } from "./providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Luca Observer",
  description: "Real-time dashboard for Luca workflow observability",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("luca-observer-theme");if(t==="light"||t==="dark"){document.documentElement.classList.add(t)}else if(window.matchMedia("(prefers-color-scheme:light)").matches){document.documentElement.classList.add("light")}else{document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden">
        <Providers>
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
