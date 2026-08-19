import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "maxxy-me Phase 0",
  description: "Deployment and runtime spike for maxxy-me",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
