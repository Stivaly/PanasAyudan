"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getRecogidasDeRecogedor,
  cancelarRecogidaPropia,
  modificarQtyRecogida,
} from "@/lib/api";
import { getRecogedorToken } from "@/lib/recogedor";
import { RecogidaConDetalle } from "@/lib/types";
import Countdown from "@/components/Countdown";

const TOKEN_KEY = "panas_recogedor_token";

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Enlace de WhatsApp al voluntario dueño del aporte, o null si no hay teléfono.
function whatsappHref(telefono: string | null, descripcion: string): string | null {
  if (!telefono) return null;
  const texto = `Hola, solicité ${descripcion} en Panas Ayudan. Quiero coordinar la recogida y la entrega.`;
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}

function BotonWhatsapp({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-primary w-full text-center"
    >
      Escribir al voluntario por WhatsApp
    </a>
  );
}

function PendienteCard({
  r,
  onCancelada,
  onReducida,
}: {
  r: RecogidaConDetalle;
  onCancelada: (id: string) => void;
  onReducida: (id: string, nuevaQty: number) => void;
}) {
  const lugar = r.aporte_item?.aporte?.location;
  const [confirmandoCancel, setConfirmandoCancel] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [yaCompletada, setYaCompletada] = useState(false);
  const [errorCancel, setErrorCancel] = useState<string | null>(null);

  // Tope = lo que ya tengo reservado + lo que queda disponible del item.
  const maxQty = r.qty_a_buscar + (r.aporte_item?.qty_disponible ?? 0);
  const [qtyInput, setQtyInput] = useState(String(r.qty_a_buscar));
  const [confirmandoQty, setConfirmandoQty] = useState(false);
  const [guardandoQty, setGuardandoQty] = useState(false);
  const [errorQty, setErrorQty] = useState<string | null>(null);

  // La reserva vence dentro de las próximas 2 horas (y aún no ha vencido).
  const msHastaVencer = new Date(r.reserved_until).getTime() - Date.now();
  const venceProximo = msHastaVencer > 0 && msHastaVencer <= 2 * 60 * 60 * 1000;

  const qtyParsed = Number(qtyInput);
  const qtyValida =
    qtyInput.trim() !== "" &&
    Number.isInteger(qtyParsed) &&
    qtyParsed >= 1 &&
    qtyParsed <= maxQty &&
    qtyParsed !== r.qty_a_buscar;

  const cancelar = async () => {
    const tok = getRecogedorToken();
    if (!tok) return;
    setCancelando(true);
    setErrorCancel(null);
    try {
      await cancelarRecogidaPropia(r.id, tok);
      onCancelada(r.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cancelar.";
      if (msg.includes("ya marcó") || msg.includes("ya_completada")) {
        setYaCompletada(true);
        setConfirmandoCancel(false);
        setErrorCancel("El voluntario ya confirmó que fuiste, no puedes cancelar.");
      } else {
        setErrorCancel(msg);
      }
    } finally {
      setCancelando(false);
    }
  };

  const guardarQty = async () => {
    const tok = getRecogedorToken();
    if (!tok || !qtyValida) return;
    setGuardandoQty(true);
    setErrorQty(null);
    try {
      await modificarQtyRecogida(r.id, qtyParsed, tok);
      setConfirmandoQty(false);
      onReducida(r.id, qtyParsed);
    } catch (e) {
      setErrorQty(e instanceof Error ? e.message : "No se pudo cambiar la cantidad.");
    } finally {
      setGuardandoQty(false);
    }
  };

  return (
    <div
      className={`card flex flex-col gap-3 ${
        venceProximo ? "border border-danger border-pulso" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.aporte_item?.descripcion ?? "Insumo"}</p>
          <p className="text-xs text-muted">{lugar?.place_name ?? "Lugar"}</p>
          {lugar?.estado && <p className="text-xs text-muted">{lugar.estado}</p>}
          {lugar?.descripcion_libre && (
            <p className="mt-1 text-sm">{lugar.descripcion_libre}</p>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold text-muted">
          {r.qty_a_buscar} {r.qty_a_buscar === 1 ? "objeto" : "objetos"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">Tiempo para ir a buscar</span>
        <span className="font-bold">
          <Countdown hasta={r.reserved_until} vencidoTexto="Liberada" />
        </span>
      </div>

      {venceProximo && (
        <p className="text-sm font-semibold text-danger">
          ⚠ Tu reserva vence pronto. Ve a buscar el insumo.
        </p>
      )}

      <BotonWhatsapp
        href={whatsappHref(r.whatsapp, r.aporte_item?.descripcion ?? "un insumo")}
      />

      {/* Cambiar cantidad (solo si hay margen para subir o bajar). */}
      {maxQty > 1 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-sm text-muted">
            Cambiar cantidad — actual: {r.qty_a_buscar} (máximo {maxQty})
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQty}
              value={qtyInput}
              disabled={confirmandoQty}
              onChange={(e) => setQtyInput(e.target.value)}
              className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50"
            />
            {!confirmandoQty && (
              <button
                type="button"
                onClick={() => setConfirmandoQty(true)}
                disabled={!qtyValida}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
              >
                Cambiar
              </button>
            )}
          </div>
          {confirmandoQty && (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {qtyParsed > r.qty_a_buscar
                  ? `¿Seguro? Reservarás ${qtyParsed} en lugar de ${r.qty_a_buscar}.`
                  : `¿Seguro? Reservarás ${qtyParsed} en lugar de ${r.qty_a_buscar}; el resto quedará disponible para otros.`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={guardarQty}
                  disabled={guardandoQty}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                >
                  {guardandoQty ? "Guardando..." : "Sí, cambiar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoQty(false)}
                  disabled={guardandoQty}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  No, volver
                </button>
              </div>
            </div>
          )}
          {errorQty && <p className="text-sm font-semibold text-danger">{errorQty}</p>}
        </div>
      )}

      {/* Cancelar mi reserva. */}
      {!yaCompletada && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {!confirmandoCancel ? (
            <button
              type="button"
              onClick={() => setConfirmandoCancel(true)}
              className="rounded-lg border border-danger px-3 py-2 text-sm font-semibold text-danger"
            >
              Cancelar mi reserva
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm">¿Seguro? El insumo quedará disponible para otros.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelar}
                  disabled={cancelando}
                  className="rounded-lg bg-danger px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {cancelando ? "Cancelando..." : "Sí, cancelar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoCancel(false)}
                  disabled={cancelando}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  No, volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {errorCancel && <p className="text-sm font-semibold text-danger">{errorCancel}</p>}
    </div>
  );
}

export default function MisRecogidas() {
  const [token, setToken] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [recogidas, setRecogidas] = useState<RecogidaConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
    setToken(t);
    setVerificando(false);
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getRecogidasDeRecogedor(token);
      setRecogidas(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar tus recogidas.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setCargando(false);
      return;
    }
    void cargar();

    // Realtime: cambios en recogidas de este dispositivo (por token local).
    const canal = supabase
      .channel(`recogidas_${token}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recogidas",
          filter: `recogedor_token=eq.${token}`,
        },
        () => void cargar()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [token, cargar]);

  const header = (
    <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <Link href="/buscar" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
        ←
      </Link>
      <h1 className="text-lg font-bold">Mis recogidas</h1>
    </div>
  );

  if (verificando) {
    return <main className="grid min-h-dvh place-items-center text-muted">Cargando...</main>;
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {header}
        <div className="card text-center">
          <p className="text-muted">No tienes recogidas en este dispositivo.</p>
          <Link href="/buscar" className="btn-primary mt-3 inline-block">
            Buscar insumos
          </Link>
        </div>
      </main>
    );
  }

  const pendientes = recogidas.filter((r) => r.status === "pendiente");
  const historicas = recogidas.filter((r) => r.status !== "pendiente");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {header}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      {cargando && <p className="text-muted">Cargando tus recogidas...</p>}

      {!cargando && recogidas.length === 0 && (
        <div className="card text-center">
          <p className="text-muted">No tienes recogidas en este dispositivo.</p>
          <Link href="/buscar" className="btn-primary mt-3 inline-block">
            Buscar insumos
          </Link>
        </div>
      )}

      {pendientes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">Pendientes</h2>
          {pendientes.map((r) => (
            <PendienteCard
              key={r.id}
              r={r}
              onCancelada={(id) =>
                setRecogidas((prev) => prev.filter((x) => x.id !== id))
              }
              onReducida={(id, nueva) =>
                setRecogidas((prev) =>
                  prev.map((x) =>
                    x.id === id ? { ...x, qty_a_buscar: nueva } : x
                  )
                )
              }
            />
          ))}
        </section>
      )}

      {historicas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">
            Completadas / Confirmadas
          </h2>
          {historicas.map((r) => {
            const cancelada = r.status === "cancelada";
            const lugar = r.aporte_item?.aporte?.location;
            return (
              <div
                key={r.id}
                className={`card flex flex-col gap-2 ${cancelada ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${cancelada ? "text-muted" : ""}`}>
                      {r.aporte_item?.descripcion ?? "Insumo"}
                    </p>
                    <p className="text-xs text-muted">{lugar?.place_name ?? "Lugar"}</p>
                    {lugar?.estado && <p className="text-xs text-muted">{lugar.estado}</p>}
                    {lugar?.descripcion_libre && (
                      <p className="mt-1 text-sm">{lugar.descripcion_libre}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-muted">
                    {r.qty_a_buscar} {r.qty_a_buscar === 1 ? "objeto" : "objetos"}
                  </span>
                </div>

                {cancelada ? (
                  <p className="text-sm font-semibold text-muted">Cancelada</p>
                ) : r.confirmada_at ? (
                  <p className="text-sm font-semibold text-green-400">
                    ✓ Entrega confirmada el {formatearFecha(r.confirmada_at)}
                  </p>
                ) : (
                  <p className="text-sm text-muted">⏳ Esperando confirmación del voluntario</p>
                )}

                {!cancelada && !r.confirmada_at && (
                  <BotonWhatsapp
                    href={whatsappHref(r.whatsapp, r.aporte_item?.descripcion ?? "un insumo")}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
