import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAM Issue Escalation Portal",
  description:
    "Escalate and track field issues for Key Account Managers — backed by Supabase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
