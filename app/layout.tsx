import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const body = Inter({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sutra · Native context layer",
  description:
    "A demo of Sutra as a context layer across Native's product, supplier, manufacturing, quality, service, and warranty data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
