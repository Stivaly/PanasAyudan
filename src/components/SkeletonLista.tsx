import Skeleton from "./Skeleton";

interface Props {
  filas?: number;
}

// Skeleton genérico para las listas de tarjetas "rounded-xl bg-bg p-3"
// (solicitudes, movimientos): título + badge y dos líneas de detalle.
export default function SkeletonLista({ filas = 3 }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl bg-bg p-3">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-12 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}
