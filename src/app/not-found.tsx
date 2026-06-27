import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
      <div>
        <p className="text-lg font-bold">Página no encontrada</p>
        <p className="mt-1 text-muted">La ruta que buscas no existe.</p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          Volver al mapa
        </Link>
      </div>
    </main>
  );
}
