import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fernández Conde Finanzas",
  description: "Presupuestos, recibos y control financiero de Fernández Conde, S.C.",
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fc-favicon-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fc-icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fc-icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    shortcut: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fc-favicon-32.png`,
    apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fc-apple-touch-icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body className="antialiased">{children}</body>
    </html>
  );
}
