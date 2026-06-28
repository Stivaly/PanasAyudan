"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { registrarVoluntario, getCentrosAcopioTodos, getEstados } from "@/lib/api";
import { getVolunteerToken, setVolunteerToken } from "@/lib/supabase";
import PanelVoluntario from "@/components/PanelVoluntario";
import { CentroAcopio, EstadoVenezuela } from "@/lib/types";

type Vista = "menu" | "registro" | "acceso" | "panel";

export default function Voluntarios() {
  const [vista, setVista] = useState<Vista>("menu");
  const [token, setToken] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [telegram, setTelegram] = useState("");
  const [zona, setZona] = useState("");
  const [centroAcopioId, setCentroAcopioId] = useState("");
  const [centros, setCentros] = useState<CentroAcopio[]>([]);
  const [estados, setEstados] = useState<EstadoVenezuela[]>([]);
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const guardado = getVolunteerToken();
    if (guardado) {
      setToken(guardado);
      setVista("panel");
    }
  }, []);

  // Al abrir el formulario de registro, cargar centros y estados (para agrupar).
  useEffect(() => {
    if (vista !== "registro" || centros.length > 0) return;
    getCentrosAcopioTodos().then(setCentros).catch(() => setCentros([]));
    getEstados().then(setEstados).catch(() => setEstados([]));
  }, [vista, centros.length]);

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
    setEnviando(true);
    try {
      const v = await registrarVoluntario({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefonoNormalizado,
        telegram: telegram.trim() || null,
        zona_descripcion: zona.trim() || null,
        centro_acopio_id: centroAcopioId || null,
      });
      setTokenNuevo(v.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setEnviando(false);
    }
  };

  const entrar = () => {
    const t = tokenInput.trim();
    if (!t) {
      setError("Ingresa tu token.");
      return;
    }
    setVolunteerToken(t);
    setToken(t);
    setVista("panel");
  };

  const guardarYEntrar = () => {
    if (!tokenNuevo) return;
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
          <h1 className="text-lg font-bold">🇻🇪 Voluntarios</h1>
          {vista === "panel" && <p className="text-xs text-muted">Estás logueada como voluntaria</p>}
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
            <p className="rounded-xl bg-surface p-3">Coordina recogidas cercanas.</p>
            <p className="rounded-xl bg-surface p-3">Conecta clínicas, centros de acopio y rescatistas.</p>
            <p className="rounded-xl bg-surface p-3">Ayuda sin exponerte: tú eliges tu zona.</p>
          </div>

          <button onClick={() => setVista("registro")} className="btn-primary w-full">
            Registrarme como voluntario
          </button>
          <button onClick={() => setVista("acceso")} className="btn-ghost w-full">
            Ya tengo token
          </button>
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
          <div className="rounded-xl border border-border bg-bg p-3 text-sm text-muted">
            Puedes guardar este token en el navegador como una contraseña para entrar más rápido la próxima vez.
          </div>
          <input type="hidden" name="username" autoComplete="username" value="voluntario-panasayudan" readOnly />
          <input
            id="volunteer-token"
            name="password"
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder="Ingresa tu token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            Entrar
          </button>
          <button type="button" onClick={() => { setError(null); setVista("menu"); }} className="btn-ghost w-full">
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
            type="tel"
            inputMode="tel"
            placeholder="WhatsApp venezolano (ej: 0412-1234567)"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/[a-zA-Z]/g, ""))}
          />
          <p className="text-xs text-muted">
            Este número se compartirá por WhatsApp cuando alguien solicite uno de tus aportes.
          </p>
          <input className="field" placeholder="Telegram (ej: @usuario)" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          <textarea
            className="field min-h-24"
            placeholder="Tu zona de cobertura (texto libre, ej: Chacao y alrededores)"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
          />
          <label className="text-sm font-semibold text-muted">Centro de acopio</label>
          <select
            className="field"
            value={centroAcopioId}
            onChange={(e) => setCentroAcopioId(e.target.value)}
          >
            <option value="">Seleccionar centro (opcional)</option>
            {estados.map((est) => {
              const delEstado = centros.filter((c) => c.estado_id === est.id);
              if (delEstado.length === 0) return null;
              return (
                <optgroup key={est.id} label={est.nombre}>
                  {delEstado.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
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
            <p className="font-semibold text-accent">Guarda tu token</p>
            <p className="mt-1 text-sm text-muted">
              Es tu única forma de acceder. No se muestra de nuevo y no se puede recuperar.
            </p>
            <p className="mt-3 rounded-xl border border-border bg-bg p-3 text-sm text-muted">
              Tu navegador puede ofrecer guardarlo como contraseña. Acepta esa opción para entrar rápido en este dispositivo.
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
              Copiar token
            </button>
          </div>
          <button type="submit" className="btn-primary w-full">
            Ya lo guardé, entrar
          </button>
        </form>
      )}
    </main>
  );
}
