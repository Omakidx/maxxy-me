import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "maxxy-me",
  description: "Personal Codex orchestration workspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
