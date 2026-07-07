"use client";

// Panel superadmin (issue #18, mínimo). Por ahora solo expone el cierre
// permanente de un nodo, que es exclusivo de superadmin (un admin del nodo solo
// puede pausarlo). El panel de aprobación/gestión completo llega en otro issue.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cerrarNodo, crearAdmin, getEstados, getCentrosAcopioPorEstado } from "@/lib/api";
import { clearVolunteerToken, clearCachedRole } from "@/lib/supabase";
import { normalizarTelefonoVe, errorTelegram, normalizarTelegram } from "@/lib/telefono";
import EstadoCombobox from "@/components/EstadoCombobox";
import SolicitudesRegistroNodo from "@/components/SolicitudesRegistroNodo";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { CentroAcopio, EstadoVenezuela } from "@/lib/types";

export default function SuperadminPanel() {
  const router = useRouter();
  const guard = useRoleGuard(["superadmin"]);
  const token = guard.token;
  const [nodeId, setNodeId] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Crear administrador (issue #17). Solo nombre + apellido son obligatorios;
  // teléfono, telegram y centro de acopio (nodo) son opcionales, igual que en la
  // firma de crear_admin. La verificación de teléfono/telegram replica la del
  // registro de voluntario: opcionales, pero si se ingresan deben ser válidos.
  const [adminNombre, setAdminNombre] = useState("");
  const [adminApellido, setAdminApellido] = useState("");
  const [adminTelefono, setAdminTelefono] = useState("");
  const [adminTelegram, setAdminTelegram] = useState("");
  const [adminTelegramError, setAdminTelegramError] = useState("");
  const [adminEstadoId, setAdminEstadoId] = useState<string | null>(null);
  const [adminCentroId, setAdminCentroId] = useState("");
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [centros, setCentros] = useState<CentroAcopio[]>([]);
  const [cargandoCentros, setCargandoCentros] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [creandoAdmin, setCreandoAdmin] = useState(false);

  useEffect(() => {
    getEstados().then(setEstados).catch(() => setEstados([]));
  }, []);

  // Los centros se cargan solo al elegir un estado, filtrados por ese estado
  // (mismo patrón que el registro de voluntario).
  useEffect(() => {
    // Reset de selects dependientes al cambiar de estado + fetch (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdminCentroId("");
    setCentros([]);
    if (!adminEstadoId) {
      setCargandoCentros(false);
      return;
    }
    setCargandoCentros(true);
    getCentrosAcopioPorEstado(adminEstadoId)
      .then(setCentros)
      .catch(() => setCentros([]))
      .finally(() => setCargandoCentros(false));
  }, [adminEstadoId]);

  // Cierra la sesión: limpia el token persistente y el cache de rol, y vuelve a
  // /voluntarios para poder ingresar con otra cuenta. Sin esto el superadmin
  // quedaría atrapado en su panel (su token lo re-redirige aquí al entrar).
  const salir = () => {
    clearVolunteerToken();
    clearCachedRole();
    router.push("/voluntarios");
  };

  const cerrar = async () => {
    if (!token) return;
    setMensaje(null);
    setError(null);
    if (!nodeId.trim()) {
      setError("Ingresa el ID del punto a cerrar.");
      return;
    }
    if (!window.confirm("El cierre es permanente y no tiene reapertura. Confirmas cerrar este punto?")) {
      return;
    }
    setEnviando(true);
    try {
      await cerrarNodo(nodeId.trim(), token);
      setMensaje("Punto cerrado permanentemente.");
      setNodeId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el punto.");
    } finally {
      setEnviando(false);
    }
  };

  const crear = async () => {
    if (!token) return;
    setAdminError(null);
    if (!adminNombre.trim() || !adminApellido.trim()) {
      setAdminError("Nombre y apellido son obligatorios.");
      return;
    }
    // El teléfono es opcional, pero si se ingresa debe ser un WhatsApp venezolano
    // válido (mismo criterio que el registro de voluntario).
    let telefonoNormalizado: string | null = null;
    if (adminTelefono.trim()) {
      telefonoNormalizado = normalizarTelefonoVe(adminTelefono);
      if (!telefonoNormalizado) {
        setAdminError("Ingresa un WhatsApp venezolano válido. Ej: 0412-1234567 o +58 412 1234567.");
        return;
      }
    }
    // El Telegram es opcional, pero si se ingresa debe tener un formato válido.
    const errTelegram = errorTelegram(adminTelegram);
    if (errTelegram) {
      setAdminError(errTelegram);
      return;
    }
    const telegramNormalizado = normalizarTelegram(adminTelegram) || null;

    setCreandoAdmin(true);
    try {
      const nuevo = await crearAdmin(
        {
          nombre: adminNombre.trim(),
          apellido: adminApellido.trim(),
          telefono: telefonoNormalizado,
          telegram: telegramNormalizado,
          centro_acopio_id: adminCentroId || null,
        },
        token
      );
      // El token se muestra UNA sola vez; no se puede recuperar después.
      setAdminToken(nuevo.token);
      setAdminNombre("");
      setAdminApellido("");
      setAdminTelefono("");
      setAdminTelegram("");
      setAdminEstadoId(null);
      setAdminCentroId("");
    } catch (e) {
      // Mensaje tal cual lo devuelve el backend (ej. 'no_autorizado').
      setAdminError(e instanceof Error ? e.message : "No se pudo crear el admin.");
    } finally {
      setCreandoAdmin(false);
    }
  };

  if (guard.loading || !token) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4">
        <p className="text-sm text-muted">Verificando acceso...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Panel superadmin</h1>
        <button onClick={salir} className="ml-auto text-sm font-semibold text-muted">
          Salir
        </button>
      </div>

      {/* Cola de solicitudes de registro de nodo (issue #21) */}
      {token && <SolicitudesRegistroNodo token={token} />}

      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Cerrar punto (permanente)</p>
        <input
          className="field"
          placeholder="ID del punto"
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
        />
        <p className="text-xs text-muted">
          El cierre es permanente y deja de aparecer en público. No tiene reapertura.
        </p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        {mensaje && <p className="text-sm font-semibold text-accent">{mensaje}</p>}
        <button onClick={cerrar} disabled={enviando} className="btn-primary w-full disabled:opacity-50">
          {enviando ? "Cerrando…" : "Cerrar punto"}
        </button>
      </div>

      {/* Crear administrador (issue #17) */}
      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Crear administrador</p>
        {adminToken ? (
          <>
            <p className="text-sm text-muted">
              Guarda este token y entrégaselo al admin. No se vuelve a mostrar y no se
              puede recuperar.
            </p>
            <input className="field font-mono text-sm" type="text" value={adminToken} readOnly />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(adminToken)}
              className="btn-ghost w-full"
            >
              Copiar token
            </button>
            <button type="button" onClick={() => setAdminToken(null)} className="btn-primary w-full">
              Crear otro admin
            </button>
          </>
        ) : (
          <>
            <label className="text-sm font-semibold text-muted">Nombre</label>
            <input
              className="field"
              placeholder="Nombre"
              value={adminNombre}
              onChange={(e) => setAdminNombre(e.target.value)}
            />
            <label className="text-sm font-semibold text-muted">Apellido</label>
            <input
              className="field"
              placeholder="Apellido"
              value={adminApellido}
              onChange={(e) => setAdminApellido(e.target.value)}
            />
            <label className="text-sm font-semibold text-muted">Teléfono (opcional)</label>
            <input
              className="field"
              type="tel"
              inputMode="tel"
              placeholder="WhatsApp venezolano (ej: 0412-1234567)"
              value={adminTelefono}
              onChange={(e) => setAdminTelefono(e.target.value.replace(/[a-zA-Z]/g, ""))}
            />
            <label className="text-sm font-semibold text-muted">Telegram (opcional)</label>
            <input
              className="field"
              placeholder="Telegram (ej: @usuario)"
              value={adminTelegram}
              onChange={(e) => {
                // Solo letras, números, guion bajo y un único @ al inicio.
                const limpio = e.target.value
                  .replace(/[^a-zA-Z0-9_@]/g, "")
                  .replace(/(?!^)@/g, "");
                setAdminTelegram(limpio);
                if (adminTelegramError) setAdminTelegramError("");
              }}
              onBlur={() => setAdminTelegramError(errorTelegram(adminTelegram) ?? "")}
            />
            {adminTelegramError && (
              <p className="text-sm font-semibold text-danger">{adminTelegramError}</p>
            )}
            <EstadoCombobox
              estados={estados}
              estadoId={adminEstadoId}
              onChange={setAdminEstadoId}
              label="Estado del centro de acopio (opcional)"
              placeholder="Elige un estado (opcional)"
            />
            {adminEstadoId && (
              <>
                <label className="text-sm font-semibold text-muted">Centro de acopio (opcional)</label>
                {cargandoCentros ? (
                  <p className="text-muted text-sm">Cargando centros…</p>
                ) : centros.length === 0 ? (
                  <p className="text-muted text-sm">
                    No hay centros de acopio registrados en este estado todavía.
                  </p>
                ) : (
                  <select
                    className="field"
                    value={adminCentroId}
                    onChange={(e) => setAdminCentroId(e.target.value)}
                  >
                    <option value="">Seleccionar centro (opcional)</option>
                    {centros.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            {adminError && <p className="text-sm font-semibold text-danger">{adminError}</p>}
            <button
              onClick={crear}
              disabled={creandoAdmin}
              className="btn-primary w-full disabled:opacity-50"
            >
              {creandoAdmin ? "Creando…" : "Crear admin"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
