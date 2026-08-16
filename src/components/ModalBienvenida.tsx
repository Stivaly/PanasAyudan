"use client";

// Carrusel de bienvenida. Solo la mecánica: visibilidad, navegación y
// accesibilidad. El contenido de las láminas vive en BienvenidaSlides.
//
// Tres arreglos sobre la versión anterior:
//
// 1. Estaba anclado abajo. El `sm:items-center` nunca entraba porque `sm` son
//    640px y ningún teléfono los alcanza, así que en móvil siempre era una hoja
//    pegada al borde inferior con la portada asomando arriba. Ahora va centrado.
//
// 2. No había salida. Sin ✕ ni "saltar", para entrar a la app había que pasar
//    por las cuatro láminas. En una app de emergencia no se puede encerrar a
//    nadie en el onboarding: el ✕ está desde la primera y Escape también cierra.
//
// 3. La barra de navegación scrolleaba junto al contenido, así que en pantallas
//    cortas los puntos y "Siguiente" quedaban fuera de vista justo en la lámina
//    más larga. Ahora la tarjeta es una columna con cabecera y navegación fijas
//    y solo el cuerpo scrollea.

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { laminasBienvenida } from "@/components/BienvenidaSlides";

const STORAGE_KEY = "panas_bienvenida_vista";

export default function ModalBienvenida() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
  const tituloId = useId();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Primera visita (según localStorage): mostrar el modal al montar.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVisible(true);
      }
    } catch {
      // Si localStorage no está disponible, no mostramos el modal.
    }

    // Permite reabrir el carrusel manualmente desde cualquier botón.
    const abrir = () => {
      setSlide(0);
      setVisible(true);
    };
    window.addEventListener("abrir-bienvenida", abrir);
    return () => window.removeEventListener("abrir-bienvenida", abrir);
  }, []);

  // Notifica el estado de visibilidad para que el botón que abre el modal
  // pueda anunciar aria-expanded correctamente.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("bienvenida-visible-change", { detail: { visible } }));
  }, [visible]);

  function cerrar() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignoramos errores de almacenamiento.
    }
    setVisible(false);
  }

  // Escape cierra, como cualquier diálogo.
  useEffect(() => {
    if (!visible) return;
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", onTecla);
    return () => window.removeEventListener("keydown", onTecla);
  }, [visible]);

  if (!visible) return null;

  const laminas = laminasBienvenida(cerrar, () => {
    cerrar();
    router.push("/voluntarios");
  });
  const actual = laminas[slide];
  const ultima = slide === laminas.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-2xl bg-surface"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-6 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Panas Ayudan</p>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <h2 id={tituloId} className="text-2xl font-bold text-fg">
            {actual.titulo}
          </h2>
          <div className="mt-4">{actual.cuerpo}</div>
        </div>

        {/* Los laterales reparten el sobrante en partes iguales (flex-1 con
            basis-0), no `justify-between`: así los puntos quedan centrados en
            la tarjeta aunque un lado esté vacío, como en la última lámina, que
            ya no lleva "Siguiente". */}
        <div className="flex shrink-0 items-center border-t border-border px-6 py-2">
          <div className="flex min-h-[44px] flex-1 basis-0 items-center">
            {slide > 0 ? (
              <button
                type="button"
                onClick={() => setSlide(slide - 1)}
                className="text-sm text-muted underline"
              >
                ← Anterior
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {laminas.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir a la diapositiva ${i + 1}`}
                aria-current={i === slide ? "true" : undefined}
                onClick={() => setSlide(i)}
                className={`h-2 w-2 rounded-full ${i === slide ? "bg-accent" : "bg-muted"}`}
              />
            ))}
          </div>

          <div className="flex min-h-[44px] flex-1 basis-0 items-center justify-end">
            {/* En la última la acción está en los botones grandes del cuerpo:
                un "Entrar" aquí sería un tercer control que hace lo mismo. */}
            {ultima ? null : (
              <button
                type="button"
                onClick={() => setSlide(slide + 1)}
                className="text-sm font-semibold text-accent"
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
