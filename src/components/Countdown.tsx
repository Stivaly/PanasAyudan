"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  hasta: Date | string;
  vencidoTexto?: string;
}

function restante(hasta: Date): number {
  return Math.max(0, hasta.getTime() - Date.now());
}

function formatear(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function Countdown({ hasta, vencidoTexto = "Vencida" }: Props) {
  // useMemo evita recrear el Date en cada render, lo que cambiaría la dependencia
  // del efecto de intervalo y lo reiniciaría constantemente.
  const fecha = useMemo(
    () => (typeof hasta === "string" ? new Date(hasta) : hasta),
    [hasta]
  );
  const [ms, setMs] = useState(() => restante(fecha));

  useEffect(() => {
    const id = setInterval(() => setMs(restante(fecha)), 1000);
    return () => clearInterval(id);
  }, [fecha]);

  if (ms <= 0) {
    return <span className="text-danger">{vencidoTexto}</span>;
  }

  return <span className={ms < 30 * 60 * 1000 ? "text-danger" : ""}>{formatear(ms)}</span>;
}
