"use client";

// Contenido de las láminas de bienvenida. Vive aparte del modal para que el
// modal se ocupe solo de la mecánica (visibilidad, navegación, accesibilidad) y
// para que ninguno de los dos archivos crezca de más.
//
// "Cómo funciona en 4 pasos" ocupa dos láminas: los cuatro pasos juntos eran
// ~160 palabras y no cabían sin scroll dentro de la tarjeta, justo la lámina en
// la que el usuario todavía no sabe si le interesa seguir leyendo. El título se
// repite a propósito en las dos: señala que es el mismo tema continuado.

import type { ReactNode } from "react";

function Paso({ numero, titulo, children }: { numero: string; titulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-2xl font-bold text-muted">{numero}</span>
      <div>
        <p className="font-bold text-fg">{titulo}</p>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}

function Garantia({ children, icono }: { children: ReactNode; icono: ReactNode }) {
  return (
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
        {icono}
      </svg>
      <span className="mt-1">{children}</span>
    </div>
  );
}

export interface Lamina {
  titulo: string;
  cuerpo: ReactNode;
}

export function laminasBienvenida(onVerPuntos: () => void, onSumarme: () => void): Lamina[] {
  return [
    {
      titulo: "Coordinamos insumos de emergencia en Venezuela",
      cuerpo: (
        <>
          <div className="text-accent">
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
          <p className="mt-4 text-base text-muted">
            Los puntos de ayuda aprobados y verificados publican lo que tienen y
            solicitan lo que les falta. La app los conecta entre sí — y con
            voluntarios cuando un envío necesita transporte. Cualquier persona
            puede consultar los puntos sin registrarse.
          </p>
          <p className="mt-3 border-l-2 border-accent pl-3 text-sm text-muted">
            No es entrega a domicilio: acércate al punto en su horario y retira.
          </p>
        </>
      ),
    },
    {
      titulo: "¿Para quién es esta app?",
      cuerpo: (
        <div className="flex flex-col gap-3">
          <div className="card border-green-700">
            <p className="font-semibold text-fg">✓ Es para ti si...</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Buscas insumos: entra sin registro y encuentra el punto más cercano</li>
              <li>Administras o colaboras en un centro de acopio o punto de entrega</li>
              <li>Puedes transportar ayuda entre puntos, con o sin vehículo</li>
            </ul>
          </div>
          <div className="card">
            <p className="font-semibold text-fg">Esta app no es para...</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Recibir insumos en tu casa o negocio</li>
              <li>Donaciones sin coordinar con un centro</li>
              <li>Publicar sin ser un punto aprobado y verificado</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      titulo: "Cómo funciona en 4 pasos",
      cuerpo: (
        <div className="flex flex-col gap-4 border-l-2 border-accent pl-4">
          <Paso numero="01" titulo="Busca un punto de ayuda">
            Sin registro: abre la app y ve la lista de puntos verificados, con lo
            que tienen disponible, su horario y su dirección. Acércate y retira.
          </Paso>
          <Paso numero="02" titulo="Los centros se coordinan entre sí">
            Cada centro aprobado administra su inventario y solicita lo que le
            falta. Otro centro puede comprometer su stock — y si ya tiene quién lo
            lleve (alguien de su confianza, sin registro), el envío queda en camino.
          </Paso>
        </div>
      ),
    },
    {
      titulo: "Cómo funciona en 4 pasos",
      cuerpo: (
        <div className="flex flex-col gap-4 border-l-2 border-accent pl-4">
          <Paso numero="03" titulo="Voluntarios solo donde faltan">
            Solo los envíos que necesitan transporte aparecen a los voluntarios — y
            únicamente a quienes están cerca y tienen la capacidad necesaria.
            Responden &quot;yo lo llevo&quot; con hora estimada y cantidad.
          </Paso>
          <Paso numero="04" titulo="Emergencia y seguridad">
            Si ya abriste la app una vez, funciona sin internet y puedes compartir
            puntos por SMS. Coordina con desconocidos solo lo necesario: tu
            ubicación es privada, el centro confirma cada llegada y quien no cumple
            queda bloqueado por su cédula de forma permanente.
          </Paso>
        </div>
      ),
    },
    {
      titulo: "Construido sobre el compromiso",
      cuerpo: (
        <>
          <p className="text-base text-muted">
            En una emergencia hay quien actúa de buena fe y quien no. Cada
            compromiso de transporte se confirma al llegar: si el centro marca que
            no llegó, esa cédula queda bloqueada de forma permanente — protegiendo
            el tiempo y los recursos de quienes sí están ayudando.
          </p>
          <div className="mt-5 flex flex-col gap-4 min-[360px]:flex-row">
            <Garantia icono={<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />}>
              Cédula al registrarte de voluntario
            </Garantia>
            <Garantia
              icono={
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 12V6M12 12h5" />
                </>
              }
            >
              Llegadas confirmadas por el centro
            </Garantia>
            <Garantia
              icono={
                <>
                  <rect x="5" y="11" width="14" height="9" rx="1.5" />
                  <path d="M8 11V7a4 4 0 018 0v4" />
                </>
              }
            >
              Contactos solo entre coordinadores
            </Garantia>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <button type="button" onClick={onVerPuntos} className="btn-primary min-h-[44px] w-full">
              Ver puntos de ayuda
            </button>
            <button type="button" onClick={onSumarme} className="btn-ghost min-h-[44px] w-full">
              Sumarme al apoyo
            </button>
          </div>
        </>
      ),
    },
  ];
}
