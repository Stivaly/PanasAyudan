import type { Metadata, Viewport } from "next";
import "./globals.css";
import KeepAlive from "@/components/KeepAlive";
import RegistrarSW from "@/components/RegistrarSW";
import RecargarEnChunkError from "@/components/RecargarEnChunkError";

export const metadata: Metadata = {
  title: "PanasAyudan",
  description: "Distribución de insumos de emergencia en Venezuela.",
  manifest: "/manifest.json",
  applicationName: "PanasAyudan",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PanasAyudan",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-dvh bg-bg text-white antialiased">
        <KeepAlive />
        <RegistrarSW />
        <RecargarEnChunkError />
        {children}
      </body>
    </html>
  );
}
