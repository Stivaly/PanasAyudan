import type { Metadata, Viewport } from "next";
import "./globals.css";
import KeepAlive from "@/components/KeepAlive";
import RegistrarSW from "@/components/RegistrarSW";
import InstalarApp from "@/components/InstalarApp";
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
      {/* suppressHydrationWarning: extensiones del navegador (p. ej. Bitdefender)
          inyectan atributos como bis_register/__processed_* en <body> antes de la
          hidratación. Suprime solo el mismatch de atributos de este nodo, no el
          contenido ni los componentes hijos. */}
      <body className="min-h-dvh bg-bg text-white antialiased" suppressHydrationWarning>
        <KeepAlive />
        <RegistrarSW />
        <InstalarApp />
        <RecargarEnChunkError />
        {children}
      </body>
    </html>
  );
}
