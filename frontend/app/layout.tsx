import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "FluxApply",
  description: "Tailor a resume and cover letter to a job in a few steps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}