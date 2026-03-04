import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import { Sidebar } from "~/components/layout/sidebar";
import { Header } from "~/components/layout/header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Luca Observer",
  description: "Real-time dashboard for Luca workflow observability",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
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
