"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useVolunteerToken } from "@/hooks/useVolunteerToken";
import { obtenerRol } from "@/lib/api";
import { getCachedRole, setCachedRole } from "@/lib/supabase";
import { VolunteerRole } from "@/lib/types";
import SeccionImpacto from "@/components/SeccionImpacto";
import Skeleton from "@/components/Skeleton";
import TemaToggle from "@/components/TemaToggle";
import { CLASE_BOTON_ICONO, IconoAyuda, IconoPanel } from "@/components/Iconos";

const ModalBienvenida = dynamic(() => import("@/components/ModalBienvenida"), {
  ssr: false,
});

export default function Home() {
  const token = useVolunteerToken();
  const tieneToken = token !== null;
  const [role, setRole] = useState<VolunteerRole | null>(null);
  const [cargandoRol, setCargandoRol] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  useEffect(() => {
    const onCambioVisibilidad = (e: Event) => {
      setModalAbierto((e as CustomEvent<{ visible: boolean }>).detail.visible);
    };
    window.addEventListener("bienvenida-visible-change", onCambioVisibilidad);
    return () => window.removeEventListener("bienvenida-visible-change", onCambioVisibilidad);
  }, []);

  useEffect(() => {
    if (!token) {
      // Sin token, la sesion local vuelve al estado anonimo.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRole(null);
      setCargandoRol(false);
      return;
    }
    const cached = getCachedRole(token) as VolunteerRole | null;
    if (cached) {
      // El rol cacheado evita una llamada remota en la portada.
      setRole(cached);
      setCargandoRol(false);
      return;
    }
    setCargandoRol(true);
    let activo = true;
    obtenerRol(token)
      .then((r) => {
        if (!activo) return;
        setCachedRole(token, r);
        setRole(r);
        setCargandoRol(false);
      })
      .catch(() => {
        if (activo) {
          setRole(null);
          setCargandoRol(false);
        }
      });
    return () => {
      activo = false;
    };
  }, [token]);

  const panel = useMemo(() => {
    if (role === "admin") return { href: "/nodo", label: "Ir al panel de mi centro" };
    if (role === "colaborador") return { href: "/nodo/colaborador", label: "Ir al panel colaborador" };
    if (role === "superadmin") return { href: "/superadmin", label: "Ir al panel superadmin" };
    return { href: "/voluntarios", label: "Ir a mi panel voluntario" };
  }, [role]);

  return (
    <main className="relative flex min-h-dvh w-full flex-col bg-bg px-4 py-8">
      <ModalBienvenida />
      {/* La portada no tiene cabecera con título, así que sus controles viven
          en esta fila. Antes eran dos píldoras de texto con el botón de tema
          flotando entre ellas y tapándolas (issue #153); ahora son tres iconos
          del mismo tamaño y peso, con el tema al final que es donde se
          acostumbra buscarlo. Los tres son atajos: lo que de verdad hay que
          hacer está en los botones grandes de abajo.

          Van centrados: la portada no tiene flecha de volver ni título que
          alinear a la izquierda, así que arrinconarlos deja la fila coja. */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("abrir-bienvenida"))}
          aria-haspopup="dialog"
          aria-expanded={modalAbierto}
          aria-label="Cómo funciona"
          title="Cómo funciona"
          className={CLASE_BOTON_ICONO}
        >
          <IconoAyuda />
        </button>
        {tieneToken && cargandoRol ? (
          <Skeleton className="h-11 w-11 rounded-full" />
        ) : (
          <Link
            href={tieneToken ? panel.href : "/voluntarios"}
            aria-label={tieneToken ? "Mi panel" : "Entrar o registrarme"}
            title={tieneToken ? "Mi panel" : "Entrar o registrarme"}
            className={CLASE_BOTON_ICONO}
          >
            <IconoPanel />
          </Link>
        )}
        <TemaToggle />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3">
        <header className="mb-5 text-center">
          <p className="mb-3 inline-flex items-center justify-center gap-2 text-sm font-semibold text-accent" aria-label="Venezuela">
            <span className="text-xl" aria-hidden="true">
              🇻🇪
            </span>
            Venezuela se ayuda
          </p>
          <h1 className="text-3xl font-bold text-fg">Panas Ayudan</h1>
          <p className="mt-2 text-base text-muted">
            Coordina la búsqueda y traslado de insumos entre centros de acopio y zonas de rescate.
          </p>
        </header>

        {/* Una sola acción principal. Antes la portada explicaba lo mismo tres
            veces —subtítulo, tarjeta verde y recuadro gris— y recién después
            ofrecía algo que hacer; encima "Necesito buscar algo", que es lo que
            busca quien llega en emergencia, era el más apagado y el último. La
            explicación larga sigue a un toque, en el icono de ayuda. */}
        <Link href="/buscar" className="btn-primary w-full shadow-lg">
          Necesito buscar algo
        </Link>

        {tieneToken && cargandoRol ? (
          <Skeleton className="h-[60px] w-full rounded-xl" />
        ) : (
          <Link
            href={tieneToken ? panel.href : "/voluntarios"}
            className="btn-ghost w-full shadow-lg"
          >
            {tieneToken ? panel.label : "Entrar o registrarme"}
          </Link>
        )}

        <p className="mt-1 text-center text-xs text-muted">
          Tienes un centro de acopio o entrega?{" "}
          <Link href="/registrar-nodo" className="font-semibold text-accent underline">
            Regístralo aquí
          </Link>
        </p>
      </div>

      <SeccionImpacto />
    </main>
  );
}
