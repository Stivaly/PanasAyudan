import type { Metadata, Viewport } from "next";
import "./globals.css";
import KeepAlive from "@/components/KeepAlive";
import RegistrarSW from "@/components/RegistrarSW";
import InstalarApp from "@/components/InstalarApp";
import RecargarEnChunkError from "@/components/RecargarEnChunkError";
import TemaToggle from "@/components/TemaToggle";
import AvisoBateria from "@/components/AvisoBateria";

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

const themeScript = `
try {
  var tema = localStorage.getItem("pa_theme") || "dark";
  var root = document.documentElement;
  if (tema === "light") {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  } else {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "light" ? "#f8fafc" : "#0a0a0a");
} catch (_) {
  document.documentElement.classList.add("dark");
}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      {/* suppressHydrationWarning: extensiones del navegador (p. ej. Bitdefender)
          inyectan atributos como bis_register/__processed_* en <body> antes de la
          hidratación. Suprime solo el mismatch de atributos de este nodo, no el
          contenido ni los componentes hijos. */}
      <body className="min-h-dvh bg-bg text-fg antialiased" suppressHydrationWarning>
        <KeepAlive />
        <RegistrarSW />
        <InstalarApp />
        <RecargarEnChunkError />
        <TemaToggle />
        <AvisoBateria />
        {children}
      </body>
    </html>
  );
}
