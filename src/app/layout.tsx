import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exclusive Resorts Itinerary Proposals",
  description: "Concierge itinerary proposals for Exclusive Resorts members.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
