"use client";

// Panel superadmin (issue #18, mínimo). Por ahora solo expone el cierre
// permanente de un nodo, que es exclusivo de superadmin (un admin del nodo solo
// puede pausarlo). El panel de aprobación/gestión completo llega en otro issue.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AvisoCarga from "@/components/AvisoCarga";
import AvisoError from "@/components/AvisoError";
import BotonVolver from "@/components/BotonVolver";
import { cerrarNodo, crearAdmin, getEstados } from "@/lib/api";
import { clearVolunteerToken, clearCachedRole } from "@/lib/supabase";
import {
  normalizarTelefonoVe,
  errorTelegram,
  normalizarTelegram,
  sanitizarTelegram,
} from "@/lib/telefono";
import EstadoCombobox from "@/components/EstadoCombobox";
import SelectorCentro from "@/components/SelectorCentro";
import SolicitudesRegistroNodo from "@/components/SolicitudesRegistroNodo";
import { useCentrosPorEstado } from "@/hooks/useCentrosPorEstado";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { EstadoVenezuela } from "@/lib/types";
import CabeceraPagina from "@/components/CabeceraPagina";

export default function SuperadminPanel() {
  const router = useRouter();
  const guard = useRoleGuard(["superadmin"]);
  const token = guard.token;
  // Cierre de punto: se elige estado y luego el punto de ese estado, en vez de
  // pegar un UUID. La lista viene de centros con activo = true, que son
  // exactamente los cerrables (cerrar_nodo pone activo = false).
  const [cerrarEstadoId, setCerrarEstadoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Crear administrador (issue #17). Todo admin debe quedar asociado a un centro;
  // teléfono y telegram son opcionales, pero si se ingresan deben ser válidos.
  const [adminNombre, setAdminNombre] = useState("");
  const [adminApellido, setAdminApellido] = useState("");
  const [adminTelefono, setAdminTelefono] = useState("");
  const [adminTelegram, setAdminTelegram] = useState("");
  const [adminTelegramError, setAdminTelegramError] = useState("");
  const [adminEstadoId, setAdminEstadoId] = useState<string | null>(null);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [estadosError, setEstadosError] = useState(false);
  const {
    centros: centrosCerrar,
    centroId: nodeId,
    setCentroId: setNodeId,
    cargando: cargandoCentrosCerrar,
    error: centrosCerrarError,
  } = useCentrosPorEstado(cerrarEstadoId, "superadmin_centros_cerrar_changes");

  const {
    centros,
    centroId: adminCentroId,
    setCentroId: setAdminCentroId,
    cargando: cargandoCentros,
    error: centrosError,
  } = useCentrosPorEstado(adminEstadoId, "superadmin_centros_estado_changes");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [mostrarAdminToken, setMostrarAdminToken] = useState(false);
  const [creandoAdmin, setCreandoAdmin] = useState(false);

  useEffect(() => {
    getEstados()
      .then((lista) => {
        setEstados(lista);
        setEstadosError(false);
      })
      .catch(() => setEstadosError(true));
  }, []);

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
    if (!nodeId) {
      setError("Elige el punto que vas a cerrar.");
      return;
    }
    const elegido = centrosCerrar.find((c) => c.id === nodeId);
    if (
      !window.confirm(
        `El cierre es permanente y no tiene reapertura. Confirmas cerrar "${elegido?.nombre ?? "este punto"}"?`
      )
    ) {
      return;
    }
    setEnviando(true);
    try {
      await cerrarNodo(nodeId, token);
      setMensaje(`Punto cerrado permanentemente: ${elegido?.nombre ?? ""}`.trim());
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
    if (!adminEstadoId) {
      setAdminError("Elige el estado del centro de acopio.");
      return;
    }
    if (!adminCentroId) {
      setAdminError("Elige el centro de acopio que administrara esta persona.");
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
          centro_acopio_id: adminCentroId,
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
      <CabeceraPagina
        volver={<BotonVolver />}
        titulo="Panel superadmin"
        acciones={
          <button onClick={salir} className="text-sm font-semibold text-muted">
            Salir
          </button>
        }
      />

      {/* Cola de solicitudes de registro de nodo (issue #21) */}
      {token && <SolicitudesRegistroNodo token={token} />}

      <div className="card border-accent flex flex-col gap-3">
        <p className="text-sm font-semibold text-accent">Cerrar punto (permanente)</p>
        <EstadoCombobox
          estados={estados}
          estadoId={cerrarEstadoId}
          onChange={setCerrarEstadoId}
          label="Estado del punto"
          placeholder="Elige un estado"
        />
        {estadosError && (
          <AvisoCarga>
            No se pudieron cargar los estados. Recarga la página para intentar de nuevo.
          </AvisoCarga>
        )}
        {cerrarEstadoId && (
          <SelectorCentro
            centros={centrosCerrar}
            valor={nodeId}
            onChange={setNodeId}
            cargando={cargandoCentrosCerrar}
            error={centrosCerrarError}
            label="Punto a cerrar"
            placeholder="Elige el punto"
          />
        )}
        <p className="text-xs text-muted">
          El cierre es permanente y deja de aparecer en público. No tiene reapertura.
        </p>
        <AvisoError mensaje={error} />
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
            <div className="flex gap-2">
              <input
                className="field flex-1 font-mono text-sm"
                type={mostrarAdminToken ? "text" : "password"}
                value={adminToken}
                readOnly
              />
              <button
                type="button"
                onClick={() => setMostrarAdminToken((v) => !v)}
                aria-label={mostrarAdminToken ? "Ocultar token" : "Mostrar token"}
                className="btn-ghost px-3 text-sm"
              >
                {mostrarAdminToken ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(adminToken)}
              className="btn-ghost w-full"
            >
              Copiar token
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminToken(null);
                setMostrarAdminToken(false);
              }}
              className="btn-primary w-full"
            >
              Crear otro admin
            </button>
          </>
        ) : (
          <>
            <label htmlFor="admin-nombre" className="text-sm font-semibold text-muted">
              Nombre
            </label>
            <input
              id="admin-nombre"
              className="field"
              placeholder="Nombre"
              value={adminNombre}
              onChange={(e) => setAdminNombre(e.target.value)}
            />
            <label htmlFor="admin-apellido" className="text-sm font-semibold text-muted">
              Apellido
            </label>
            <input
              id="admin-apellido"
              className="field"
              placeholder="Apellido"
              value={adminApellido}
              onChange={(e) => setAdminApellido(e.target.value)}
            />
            <label htmlFor="admin-telefono" className="text-sm font-semibold text-muted">
              Teléfono (opcional)
            </label>
            <input
              id="admin-telefono"
              className="field"
              type="tel"
              inputMode="tel"
              placeholder="WhatsApp venezolano (ej: 0412-1234567)"
              value={adminTelefono}
              onChange={(e) => setAdminTelefono(e.target.value.replace(/[a-zA-Z]/g, ""))}
            />
            <label htmlFor="admin-telegram" className="text-sm font-semibold text-muted">
              Telegram (opcional)
            </label>
            <input
              id="admin-telegram"
              className="field"
              placeholder="Telegram (ej: @usuario)"
              value={adminTelegram}
              onChange={(e) => {
                setAdminTelegram(sanitizarTelegram(e.target.value));
                if (adminTelegramError) setAdminTelegramError("");
              }}
              onBlur={() => setAdminTelegramError(errorTelegram(adminTelegram) ?? "")}
            />
            <AvisoError mensaje={adminTelegramError || null} enfocar={false} />
            <EstadoCombobox
              estados={estados}
              estadoId={adminEstadoId}
              onChange={setAdminEstadoId}
              label="Estado del centro de acopio"
              placeholder="Elige un estado"
            />
            {estadosError && (
              <AvisoCarga>
                No se pudieron cargar los estados. Recarga la página para intentar de nuevo.
              </AvisoCarga>
            )}
            {adminEstadoId && (
              <SelectorCentro
                centros={centros}
                valor={adminCentroId}
                onChange={setAdminCentroId}
                cargando={cargandoCentros}
                error={centrosError}
              />
            )}
            <AvisoError mensaje={adminError} />
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
