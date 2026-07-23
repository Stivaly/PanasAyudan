import Skeleton from "./Skeleton";

interface Props {
  filas?: number;
}

// Skeleton para ListaNodos (/buscar): título + badge de estado, tipo de
// punto, fila de categorías y dirección.
export default function SkeletonListaNodos({ filas = 4 }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: filas }).map((_, i) => (
        <li key={i} className="card flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-1/3" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}
