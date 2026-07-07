"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  registrarVoluntario,
  getCentrosAcopioPorEstado,
  getEstados,
  validarTokenVoluntario,
  obtenerRol,
} from "@/lib/api";
import {
  getVolunteerToken,
  setVolunteerToken,
  getCachedRole,
  setCachedRole,
  clearCachedRole,
} from "@/lib/supabase";
import { normalizarTelegram, errorTelegram } from "@/lib/telefono";
import { validarCedula, formatearCedula, limpiarCedula } from "@/lib/validaciones";
import PanelVoluntario from "@/components/PanelVoluntario";
import EstadoCombobox from "@/components/EstadoCombobox";
import { CentroAcopio, EstadoVenezuela, VolunteerRole } from "@/lib/types";

type Vista = "menu" | "registro" | "acceso" | "panel";

export default function Voluntarios() {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("menu");
  const [token, setToken] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [telegram, setTelegram] = useState("");
  const [zona, setZona] = useState("");
  // Capacidad de vehículo (issue #19): al registrarse se pregunta si tiene
  // vehículo; si sí, se pide peso y volumen aproximado que puede transportar.
  const [tieneVehiculo, setTieneVehiculo] = useState(false);
  const [capacidadPeso, setCapacidadPeso] = useState("");
  const [capacidadVolumen, setCapacidadVolumen] = useState("");
  const [estadoId, setEstadoId] = useState<string | null>(null);
  const [centroAcopioId, setCentroAcopioId] = useState("");
  const [centros, setCentros] = useState<CentroAcopio[]>([]);
  const [cargandoCentros, setCargandoCentros] = useState(false);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [telegramError, setTelegramError] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Resuelve el rol del token (cacheado una sola vez por sesión) y enruta según
  // su valor. Para 'voluntario' usa el panel actual sin cambios; para los demás
  // roles navega a su panel (placeholder si la ruta aún no existe). Si el token
  // es inválido/inactivo, obtenerRol lanza y NO se navega a ningún panel.
  const resolverYRedirigir = async (t: string): Promise<VolunteerRole> => {
    let role = getCachedRole(t) as VolunteerRole | null;
    if (!role) {
      role = await obtenerRol(t); // lanza si el token es inválido
      setCachedRole(t, role);
    }
    switch (role) {
      case "superadmin":
        router.push("/superadmin");
        break;
      case "admin":
        router.push("/nodo");
        break;
      case "colaborador":
        router.push("/nodo/colaborador");
        break;
      default:
        // voluntario: panel actual, sin cambios.
        setToken(t);
        setVista("panel");
    }
    return role;
  };

  useEffect(() => {
    const guardado = getVolunteerToken();
    if (!guardado) return;
    // Token persistido: resolvemos su rol (desde cache si ya existe) y enrutamos.
    // Si el token quedó inválido, limpiamos el cache de rol y dejamos el menú; el
    // guard de PanelVoluntario ya cubre la limpieza del token persistente.
    // Token persistido leído al montar: resuelve rol y enruta (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resolverYRedirigir(guardado).catch(() => {
      clearCachedRole();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el guard del panel detectó una sesión inválida, redirige aquí con
  // ?sesion=invalida. Mostramos el aviso en el área de error del formulario de
  // acceso y limpiamos el parámetro de la URL sin recargar la página.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sesion") === "invalida") {
      // Aviso derivado del parámetro de URL al montar (intencional).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVista("acceso");
      setError("Codigo invalido. Ingresa tu codigo de acceso nuevamente.");
      router.replace("/voluntarios");
    }
  }, [router]);

  // Al abrir el formulario de registro, cargar la lista de estados (no los centros).
  useEffect(() => {
    if (vista !== "registro" || estados.length > 0) return;
    getEstados().then(setEstados).catch(() => setEstados([]));
  }, [vista, estados.length]);

  // Los centros se cargan solo al elegir un estado, filtrados por ese estado.
  useEffect(() => {
    // Reset de selects dependientes al cambiar de estado + fetch (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCentroAcopioId("");
    setCentros([]);
    if (!estadoId) {
      setCargandoCentros(false);
      return;
    }
    setCargandoCentros(true);
    getCentrosAcopioPorEstado(estadoId)
      .then(setCentros)
      .catch(() => setCentros([]))
      .finally(() => setCargandoCentros(false));
  }, [estadoId]);

  const normalizarTelefonoVe = (valor: string): string | null => {
    let digits = valor.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) {
      digits = "58" + digits.slice(1);
    }
    return /^58(412|414|416|424|426)\d{7}$/.test(digits) ? digits : null;
  };

  const registrar = async () => {
    setError(null);
    if (!nombre.trim() || !apellido.trim()) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    // La cédula es obligatoria (issue #23): es la base del bloqueo por
    // incumplimiento. Se valida y se envía limpia (solo dígitos).
    const cedulaCheck = validarCedula(cedula);
    if (!cedulaCheck.valida) {
      setError(cedulaCheck.error ?? "Cédula inválida.");
      return;
    }
    // El spec exige al menos un medio de contacto: teléfono O Telegram.
    // Esta validación corre antes de cualquier llamada de red.
    if (!telefono.trim() && !telegram.trim()) {
      setError("Ingresa al menos un medio de contacto: teléfono o Telegram");
      return;
    }
    // El teléfono es opcional, pero si se ingresa debe ser un WhatsApp venezolano válido.
    let telefonoNormalizado: string | null = null;
    if (telefono.trim()) {
      telefonoNormalizado = normalizarTelefonoVe(telefono);
      if (!telefonoNormalizado) {
        setError("Ingresa un WhatsApp venezolano válido. Ej: 0412-1234567 o +58 412 1234567.");
        return;
      }
    }
    // El Telegram es opcional, pero si se ingresa debe tener un formato válido.
    const errTelegram = errorTelegram(telegram);
    if (errTelegram) {
      setError(errTelegram);
      return;
    }
    const telegramNormalizado = normalizarTelegram(telegram);
    // Si declara vehículo, peso y volumen son obligatorios (lo refuerza también
    // el CHECK volunteers_capacidad_vehiculo en la BD).
    let pesoNum: number | null = null;
    let volumenNum: number | null = null;
    if (tieneVehiculo) {
      pesoNum = Number(capacidadPeso);
      volumenNum = Number(capacidadVolumen);
      if (!capacidadPeso.trim() || !capacidadVolumen.trim() || !(pesoNum > 0) || !(volumenNum > 0)) {
        setError("Si tienes vehículo, indica el peso (kg) y el volumen (m³) que puedes transportar.");
        return;
      }
    }
    setEnviando(true);
    try {
      const v = await registrarVoluntario({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        cedula: limpiarCedula(cedula),
        telefono: telefonoNormalizado,
        telegram: telegramNormalizado || null,
        zona_descripcion: zona.trim() || null,
        centro_acopio_id: centroAcopioId || null,
        tiene_vehiculo: tieneVehiculo,
        capacidad_peso_kg: pesoNum,
        capacidad_volumen_m3: volumenNum,
      });
      setTokenNuevo(v.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setEnviando(false);
    }
  };

  const entrar = async () => {
    const t = tokenInput.trim();
    if (!t) {
      setError("Ingresa tu codigo de acceso.");
      return;
    }
    setError(null);
    setVerificando(true);
    // Validar el token contra la base de datos ANTES de guardarlo o navegar.
    // Un token falso o inválido no debe escribir nada en localStorage.
    const valido = await validarTokenVoluntario(t);
    if (!valido) {
      setVerificando(false);
      setError("Codigo no reconocido. Verifica que lo copiaste correctamente.");
      return;
    }
    // El token cambió respecto a una sesión previa: invalidamos el cache de rol
    // para no arrastrar un rol viejo, y resolvemos el rol de este token una vez.
    clearCachedRole();
    setVolunteerToken(t);
    try {
      await resolverYRedirigir(t);
    } catch {
      // obtenerRol falló (token inválido/inactivo): mismo mensaje del flujo del
      // issue #3, sin navegar a ningún panel.
      setError("Codigo no reconocido. Verifica que lo copiaste correctamente.");
    } finally {
      setVerificando(false);
    }
  };

  const guardarYEntrar = () => {
    if (!tokenNuevo) return;
    // El registro libre solo crea voluntarios: vamos directo al panel actual y
    // cacheamos el rol para no pedirlo de nuevo en esta sesión.
    clearCachedRole();
    setCachedRole(tokenNuevo, "voluntario");
    setVolunteerToken(tokenNuevo);
    setToken(tokenNuevo);
    setVista("panel");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold">🇻🇪 Apoyo en traslados</h1>
          {vista === "panel" && <p className="text-xs text-muted">Estas en solicitudes para ayudar</p>}
        </div>
      </div>

      {vista === "panel" && token && (
        <PanelVoluntario
          token={token}
          onSalir={() => {
            setToken(null);
            setVista("menu");
          }}
        />
      )}

      {vista === "menu" && (
        <div className="flex flex-col gap-3">
          <div className="card border-accent">
            <p className="text-sm font-semibold text-accent">Sé parte de la ayuda</p>
            <h2 className="mt-2 text-2xl font-bold">Mueve lo que sobra hacia donde falta.</h2>
            <p className="mt-2 text-sm text-muted">
              Muchos centros reciben insumos; las zonas de rescate necesitan manos que acerquen esa ayuda.
            </p>
          </div>

          <div className="grid gap-2 text-sm text-muted">
            <p className="rounded-xl bg-surface p-3">Responde solicitudes cercanas.</p>
            <p className="rounded-xl bg-surface p-3">Apoya traslados entre puntos y zonas que necesitan ayuda.</p>
            <p className="rounded-xl bg-surface p-3">Ayuda sin exponerte: tú eliges tu zona.</p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-accent bg-bg p-4">
            <p className="text-sm font-semibold text-accent">¿Es tu primera vez?</p>
            <p className="text-xs text-muted">
              Créate una cuenta con tus datos. Al terminar recibirás un código de acceso
              propio para volver a entrar.
            </p>
            <button onClick={() => setVista("registro")} className="btn-primary mt-1 w-full">
              Crear cuenta nueva
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
            <p className="text-sm font-semibold">¿Ya te registraste antes?</p>
            <p className="text-xs text-muted">
              Entra con el código de acceso que recibiste cuando creaste tu cuenta.
            </p>
            <button onClick={() => setVista("acceso")} className="btn-ghost mt-1 w-full">
              Entrar con mi código de acceso
            </button>
          </div>

          <p className="text-center text-xs text-muted">
            ¿Tienes un centro de acopio o entrega?{" "}
            <Link href="/registrar-nodo" className="font-semibold text-accent underline">
              Regístralo aquí
            </Link>
          </p>
        </div>
      )}

      {vista === "acceso" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            entrar();
          }}
        >
          <div>
            <h2 className="text-xl font-bold">Entrar con tu código de acceso</h2>
            <p className="mt-1 text-sm text-muted">
              Pega el código que recibiste al crear tu cuenta. Si aún no tienes uno, vuelve y
              crea una cuenta nueva.
            </p>
          </div>
          <input type="hidden" name="username" autoComplete="username" value="voluntario-panasayudan" readOnly />
          <input
            id="volunteer-token"
            name="password"
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder="Código de acceso"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={verificando} className="btn-primary w-full disabled:opacity-50">
            {verificando ? "Verificando..." : "Entrar"}
          </button>
          <button type="button" disabled={verificando} onClick={() => { setError(null); setVista("menu"); }} className="btn-ghost w-full">
            Volver
          </button>
        </form>
      )}

      {vista === "registro" && !tokenNuevo && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-accent bg-bg p-3 text-sm">
            <p className="font-semibold text-accent">Tu zona puede ser el puente.</p>
            <p className="mt-1 text-muted">Deja tu WhatsApp venezolano y el área donde puedes apoyar traslados.</p>
          </div>
          <input className="field" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input className="field" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
          <input
            className="field"
            inputMode="numeric"
            placeholder="Cédula (ej: 12.345.678)"
            value={cedula}
            onChange={(e) => setCedula(formatearCedula(e.target.value))}
          />
          <p className="text-xs text-muted">
            Tu cédula no se muestra públicamente. Se usa solo para el registro y queda
            bloqueada si no cumples un compromiso aceptado.
          </p>
          <input
            className="field"
            type="tel"
            inputMode="tel"
            placeholder="WhatsApp venezolano (ej: 0412-1234567)"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/[a-zA-Z]/g, ""))}
          />
          <p className="text-xs text-muted">
            Este numero se usara para coordinar los compromisos que aceptes.
          </p>
          <input
            className="field"
            placeholder="Telegram (ej: @usuario)"
            value={telegram}
            onChange={(e) => {
              // Solo letras, números, guion bajo y un único @ al inicio.
              const limpio = e.target.value
                .replace(/[^a-zA-Z0-9_@]/g, "")
                .replace(/(?!^)@/g, "");
              setTelegram(limpio);
              if (telegramError) setTelegramError("");
            }}
            onBlur={() => {
              setTelegramError(errorTelegram(telegram) ?? "");
            }}
          />
          {telegramError && <p className="text-sm font-semibold text-danger">{telegramError}</p>}
          <textarea
            className="field min-h-24"
            placeholder="Tu zona de cobertura (texto libre, ej: Chacao y alrededores)"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
          />
          <label className="flex items-center gap-2 rounded-xl border border-border bg-bg p-3 text-sm">
            <input
              type="checkbox"
              checked={tieneVehiculo}
              onChange={(e) => setTieneVehiculo(e.target.checked)}
            />
            <span>Tengo vehículo para transportar insumos</span>
          </label>
          {tieneVehiculo && (
            <div className="flex gap-2">
              <input
                className="field"
                inputMode="decimal"
                placeholder="Peso aprox. (kg)"
                value={capacidadPeso}
                onChange={(e) => setCapacidadPeso(e.target.value.replace(/[^0-9.]/g, ""))}
              />
              <input
                className="field"
                inputMode="decimal"
                placeholder="Volumen aprox. (m³)"
                value={capacidadVolumen}
                onChange={(e) => setCapacidadVolumen(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>
          )}
          <EstadoCombobox
            estados={estados}
            estadoId={estadoId}
            onChange={setEstadoId}
            label="Estado del centro de acopio"
            placeholder="Elige un estado (opcional)"
          />
          {estadoId && (
            <>
              <label className="text-sm font-semibold text-muted">Centro de acopio</label>
              {cargandoCentros ? (
                <p className="text-muted text-sm">Cargando centros…</p>
              ) : centros.length === 0 ? (
                <p className="text-muted text-sm">
                  No hay centros de acopio registrados en este estado todavía.
                </p>
              ) : (
                <select
                  className="field"
                  value={centroAcopioId}
                  onChange={(e) => setCentroAcopioId(e.target.value)}
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
          <p className="text-xs text-muted">
            Puedes ser el centro o solo un voluntario que ayuda desde ahí.
          </p>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button onClick={registrar} disabled={enviando} className="btn-primary w-full disabled:opacity-50">
            {enviando ? "Registrando..." : "Registrarme"}
          </button>
          <button onClick={() => { setError(null); setVista("menu"); }} className="btn-ghost w-full">
            Volver
          </button>
        </div>
      )}

      {vista === "registro" && tokenNuevo && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardarYEntrar();
          }}
        >
          <div className="card border-accent">
            <p className="font-semibold text-accent">Guarda tu código de acceso</p>
            <p className="mt-1 text-sm text-muted">
              Es tu forma de volver a entrar a tu panel. No se muestra de nuevo y no se puede recuperar.
            </p>
            <p className="mt-3 rounded-xl border border-border bg-bg p-3 text-sm text-muted">
              Tu navegador puede ofrecer guardarlo. Acepta esa opcion para usarlo rapido en este dispositivo.
            </p>
            <input type="hidden" name="username" autoComplete="username" value="voluntario-panasayudan" readOnly />
            <input
              className="field mt-3 font-mono text-sm"
              type="password"
              name="password"
              autoComplete="new-password"
              value={tokenNuevo}
              readOnly
            />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(tokenNuevo)}
              className="btn-ghost mt-3 w-full"
            >
              Copiar codigo
            </button>
          </div>
          <button type="submit" className="btn-primary w-full">
            Ya lo guarde, usar codigo
          </button>
        </form>
      )}
    </main>
  );
}
