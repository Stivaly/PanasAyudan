"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" className="dark">
      <body
        style={{
          backgroundColor: "#0a0a0a",
          color: "#f5f5f5",
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontWeight: 700, fontSize: "1.125rem" }}>Algo salió mal</p>
          <p style={{ color: "#9ca3af", marginTop: "0.5rem" }}>
            Revisa tu conexión e intenta de nuevo.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              backgroundColor: "#22c55e",
              color: "#000",
              border: "none",
              borderRadius: "0.75rem",
              padding: "1rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
