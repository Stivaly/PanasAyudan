"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "panas_bienvenida_vista";

export default function ModalBienvenida() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);

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

  function cerrar() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignoramos errores de almacenamiento.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center">
      <div className="mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-6 sm:rounded-2xl">
        {/* Slide 1 — Qué es esto */}
        {slide === 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Panas Ayudan
            </p>
            <div className="mt-4 text-accent">
              <svg
                width="72"
                height="72"
                viewBox="0 0 72 72"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="20" y1="20" x2="52" y2="52" />
                <line x1="52" y1="20" x2="20" y2="52" />
                <line x1="36" y1="12" x2="36" y2="60" />
                <circle cx="36" cy="12" r="6" fill="currentColor" stroke="none" />
                <circle cx="18" cy="54" r="6" fill="currentColor" stroke="none" />
                <circle cx="54" cy="54" r="6" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-white">
              Coordinamos insumos de emergencia en Venezuela
            </h2>
            <p className="mt-3 text-base text-muted">
              Los centros de acopio reciben más de lo que pueden distribuir.
              PanasAyudan conecta esos excedentes con otros centros o zonas de
              rescate que los necesitan — con voluntarios que los llevan.
            </p>
            <p className="mt-3 border-l-2 border-accent pl-3 text-sm text-muted">
              No es entrega a domicilio. Es logística entre puntos de acopio.
            </p>
          </div>
        ) : null}

        {/* Slide 2 — Para quién es */}
        {slide === 1 ? (
          <div>
            <h2 className="text-2xl font-bold text-white">
              ¿Para quién es esta app?
            </h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <div className="card flex-1 border-green-700">
                <p className="font-semibold text-white">✓ Es para ti si...</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>
                    Tienes vehículo y puedes mover cajas entre puntos de la
                    ciudad
                  </li>
                  <li>Coordinas o apoyas en un centro de acopio o zona de rescate</li>
                  <li>Puedes comprometerte a completar lo que reservas</li>
                </ul>
              </div>
              <div className="card flex-1">
                <p className="font-semibold text-white">Esta app no es para...</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>Recibir insumos en tu casa o negocio</li>
                  <li>Donaciones sin coordinación previa</li>
                  <li>Quienes no puedan comprometerse con la recogida</li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {/* Slide 3 — Cómo funciona */}
        {slide === 2 ? (
          <div>
            <h2 className="text-2xl font-bold text-white">
              Cómo funciona en 4 pasos
            </h2>
            <div className="mt-4 flex flex-col gap-4 border-l-2 border-accent pl-4">
              <div className="flex gap-3">
                <span className="text-2xl font-bold text-muted">01</span>
                <div>
                  <p className="font-bold text-white">Busca un punto de ayuda</p>
                  <p className="text-sm text-muted">
                    Sin registro: abre la app y ve la lista de puntos
                    verificados, con lo que tienen disponible, su horario y su
                    dirección. Acércate y retira.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl font-bold text-muted">02</span>
                <div>
                  <p className="font-bold text-white">Los centros publican y piden</p>
                  <p className="text-sm text-muted">
                    Cada centro aprobado carga su inventario y solicita lo que
                    le falta. Otros centros pueden comprometer stock para
                    enviárselo.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl font-bold text-muted">03</span>
                <div>
                  <p className="font-bold text-white">Un voluntario lo lleva</p>
                  <p className="text-sm text-muted">
                    Los voluntarios verifican su ubicación una sola vez y ven
                    las solicitudes cercanas que necesitan transporte. Responden
                    &quot;yo lo llevo&quot; con hora estimada y cantidad.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl font-bold text-muted">04</span>
                <div>
                  <p className="font-bold text-white">Emergencia y seguridad</p>
                  <p className="text-sm text-muted">
                    Si ya abriste la app una vez, funciona sin internet y puedes
                    compartir puntos por SMS. Coordina con desconocidos solo lo
                    necesario: tu ubicación es privada, el centro confirma cada
                    llegada y quien no cumple queda bloqueado por su cédula de
                    forma permanente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Slide 4 — Llamado a la acción */}
        {slide === 3 ? (
          <div>
            <h2 className="text-2xl font-bold text-white">
              Construido sobre el compromiso
            </h2>
            <p className="mt-3 text-base text-muted">
              Sabemos que en una emergencia hay personas que actúan de buena fe
              y otras que no. Por eso la app bloquea automáticamente a quienes
              reservan y no cumplen — protegiendo el tiempo y los recursos de
              quienes sí están ayudando.
            </p>
            <div className="mt-5 flex flex-col gap-4 min-[360px]:flex-row">
              <div className="flex flex-1 flex-col items-center text-center text-xs text-muted">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
                </svg>
                <span className="mt-1">Cédula verificada al reservar</span>
              </div>
              <div className="flex flex-1 flex-col items-center text-center text-xs text-muted">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 12V6M12 12h5" />
                </svg>
                <span className="mt-1">4 horas para recoger</span>
              </div>
              <div className="flex flex-1 flex-col items-center text-center text-xs text-muted">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="11" width="14" height="9" rx="1.5" />
                  <path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
                <span className="mt-1">Contacto protegido hasta confirmar</span>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={cerrar}
                className="btn-primary min-h-[44px] w-full"
              >
                Explorar insumos disponibles
              </button>
              <button
                type="button"
                onClick={() => {
                  cerrar();
                  router.push("/voluntarios");
                }}
                className="btn-ghost min-h-[44px] w-full"
              >
                Sumarme al apoyo
              </button>
            </div>
          </div>
        ) : null}

        {/* Navegación inferior */}
        <div className="mt-6 flex items-center justify-between">
          <div className="min-h-[44px] flex items-center">
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

          {slide < 3 ? (
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Ir a la diapositiva ${i + 1}`}
                  onClick={() => setSlide(i)}
                  className={`h-2 w-2 rounded-full ${
                    i === slide ? "bg-accent" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">4 de 4</span>
          )}

          <div className="min-h-[44px] flex items-center">
            {slide < 3 ? (
              <button
                type="button"
                onClick={() => setSlide(slide + 1)}
                className="text-sm font-semibold text-accent"
              >
                Siguiente →
              </button>
            ) : (
              <button
                type="button"
                onClick={cerrar}
                className="text-sm font-semibold text-accent"
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
