import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@radix-ui/react-toast";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-serif",
});

export const metadata: Metadata = {
  title: "Order ORD-10482 · ZUS Back office",
  description: "Refund flow for ZUS Coffee operations",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexSerif.variable} h-full antialiased`}
    >
      <ToastProvider swipeDirection="right">
        <body className="min-h-svh bg-canvas font-sans text-ink">
          <header className="border-b border-brand/20 bg-brand text-white">
            <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
              <p className="text-lg font-bold tracking-wide">ZUS Coffee</p>
            </div>
          </header>
          {children}
        </body>
      </ToastProvider>
    </html>
  );
}
