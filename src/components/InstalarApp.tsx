"use client";
// InstalarApp (issue #31): banner discreto de instalación PWA.
// - Android/Chrome: captura beforeinstallprompt y ofrece el prompt nativo.
// - iOS/Safari: sin beforeinstallprompt; se muestran instrucciones manuales.
// - Nunca se muestra en modo standalone (ya instalada).
// - Descartarlo lo oculta 14 días. No aparece en el primer render: espera 30 s
//   de uso o segunda visita, para no interrumpir a quien entra en emergencia.
import { useEffect, useState } from "react";

const KEY_DESCARTE = "pa_install_dismissed";
const KEY_VISITA = "pa_install_visited";
const DIAS_DESCARTE = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstalarApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [esIos, setEsIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const desc = Number(localStorage.getItem(KEY_DESCARTE) || 0);
    if (desc && Date.now() - desc < DIAS_DESCARTE * 24 * 60 * 60 * 1000) return;

    const segundaVisita = localStorage.getItem(KEY_VISITA) === "1";
    localStorage.setItem(KEY_VISITA, "1");

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se deriva del navegador al montar el banner
    setEsIos(ios);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const activar = () => {
      if (segundaVisita) {
        setMostrar(true);
      } else {
        timer = setTimeout(() => setMostrar(true), 30000);
      }
    };

    if (ios) {
      activar();
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      activar();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const descartar = () => {
    localStorage.setItem(KEY_DESCARTE, String(Date.now()));
    setMostrar(false);
  };

  const instalar = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const eleccion = await deferred.userChoice;
    setDeferred(null);
    if (eleccion.outcome === "accepted") setMostrar(false);
    else descartar();
  };

  if (!mostrar) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-accent bg-surface p-3 shadow-lg">
        <div className="flex-1 text-sm">
          <p className="font-semibold text-fg">Instala la app</p>
          <p className="text-xs text-muted">
            {esIos
              ? 'En Safari: toca Compartir y luego "Agregar a pantalla de inicio" para usarla sin conexión.'
              : "Úsala sin conexión y comparte puntos por SMS cuando no haya datos."}
          </p>
        </div>
        {!esIos && (
          <button onClick={instalar} className="btn-primary px-4 py-2 text-sm">
            Instalar
          </button>
        )}
        <button onClick={descartar} aria-label="Cerrar" className="btn-ghost px-3 py-2 text-sm">
          ✕
        </button>
      </div>
    </div>
  );
}
