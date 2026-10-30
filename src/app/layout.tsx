import type { Metadata } from "next";
import { Suspense } from "react";
import { Provider } from "@/components/provider";
import { Chrome } from "@/components/chrome";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: "Knightfall Arena — Chess. Elevated.",
    template: "%s | Knightfall Arena",
  },
  description:
    "Discover competitive chess tournaments, register eligible players, and join your next challenge on Chess.com.",
  openGraph: {
    title: "Knightfall Arena — Your next move. Your next victory.",
    description: "Online chess tournaments for the player in you.",
    type: "website",
  },
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Suspense
          fallback={<div className="app-loading">Opening the arena…</div>}
        >
          <Provider>
            <Chrome>{children}</Chrome>
          </Provider>
        </Suspense>
      </body>
    </html>
  );
}
