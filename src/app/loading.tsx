import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 p-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </main>
  );
}
