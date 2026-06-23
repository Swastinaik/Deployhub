import type { Metadata } from "next";
import { Instrument_Serif, Azeret_Mono } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeployHub — Cloud Orchestration & Deployment Control",
  description: "Access your cloud platform dashboard. Manage deployments, scale instances, and monitor cluster health.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${azeretMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
