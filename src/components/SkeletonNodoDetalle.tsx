import Skeleton from "./Skeleton";

// Skeleton de página completa para /nodo/[id]: título, badges de tipo y
// estado, dirección y un par de tarjetas de categoría.
export default function SkeletonNodoDetalle() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Skeleton className="h-7 w-2/3" />
      <div className="-mt-2 flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="-mt-2 h-4 w-1/2" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </main>
  );
}
