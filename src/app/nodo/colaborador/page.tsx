import Link from "next/link";

// Placeholder del panel de colaborador (issue #17): solo fija el destino del
// routing por rol. La operación real del colaborador llega en un issue posterior.
export default function ColaboradorPlaceholder() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/voluntarios" className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold">
          ←
        </Link>
        <h1 className="text-lg font-bold">Panel de colaborador</h1>
      </div>
      <div className="card border-accent">
        <p className="text-sm text-muted">Panel de colaborador — próximamente.</p>
      </div>
    </main>
  );
}
