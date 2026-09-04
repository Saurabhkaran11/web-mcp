import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Local Loop | Smart Commerce Agent",
  description: "A WebMCP-ready local commerce storefront.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
