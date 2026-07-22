"use client";

import Link from "next/link";

export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
      <div>
        <p className="text-lg font-bold">Sin conexión</p>
        <p className="mt-1 text-muted">
          Esta página no está guardada para uso offline. Revisa tu conexión e
          intenta de nuevo.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={() => location.reload()} className="btn-primary">
            Reintentar
          </button>
          <Link href="/" className="btn-primary">
            Volver al mapa
          </Link>
        </div>
      </div>
    </main>
  );
}
