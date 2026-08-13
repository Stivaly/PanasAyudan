// Fila de un compromiso: descripción larga a la izquierda, su estado o su
// acción a la derecha. Aparece en las solicitudes del punto y en los
// movimientos entrantes.
//
// El patrón anterior era `justify-between` con la descripción encogible y el
// estado en `shrink-0`. Como el estado es texto largo ("esperando voluntario",
// "retiro vencido"), a 320-360 px se quedaba con media fila y la descripción
// colapsaba a una palabra por línea (issue #156).
//
// Aquí la fila envuelve y la descripción reclama 16rem de base: si el estado no
// cabe junto a esos 16rem, baja completo a la línea siguiente y la descripción
// se queda con el ancho entero. Un estado corto ("retirado") sí sigue cabiendo
// al lado, así que la fila solo se parte cuando de verdad hace falta.
//
// La base va con `grow` y no con `flex-1`: `flex-1` es `flex: 1 1 0%` y pisaría
// el flex-basis, dejando que la descripción se encogiera igual.

interface Props {
  children: React.ReactNode;
  derecha: React.ReactNode;
}

export default function FilaCompromiso({ children, derecha }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg bg-surface p-2">
      <span className="min-w-0 grow basis-64">{children}</span>
      {derecha}
    </div>
  );
}
