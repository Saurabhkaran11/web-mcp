import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Loop | Smart Commerce Agent",
  description: "A WebMCP commerce demo where people and browser agents work from the same cart.",
  applicationName: "Local Loop",
  keywords: ["WebMCP", "AI agents", "local commerce", "Next.js"],
  openGraph: {
    title: "Local Loop | Shop with your agent",
    description: "A safe WebMCP commerce demo with shared carts and explicit confirmation.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
