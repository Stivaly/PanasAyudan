"use client";

// Barra de navegación inferior del panel de punto (bottom tab bar).
// Secciona el panel admin para móvil: cada función vive en su propia vista y se
// alcanza con el pulgar, en lugar de un único scroll interminable.

export type NodoTab = "estado" | "inventario" | "pedir" | "cercanos" | "ajustes";

interface Props {
  active: NodoTab;
  onChange: (tab: NodoTab) => void;
  // Marca visual opcional sobre una pestaña (p. ej. punto no operativo en Estado).
  alertas?: Partial<Record<NodoTab, boolean>>;
  disabled?: Partial<Record<NodoTab, boolean>>;
}

type Item = { key: NodoTab; label: string; icon: React.ReactNode };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ITEMS: Item[] = [
  {
    key: "estado",
    label: "Estado",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
        <path d="M3 12l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    key: "inventario",
    label: "Inventario",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </svg>
    ),
  },
  {
    key: "pedir",
    label: "Pedir",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
        <path d="M12 21s-7-4.5-9-9a4.5 4.5 0 019-1 4.5 4.5 0 019 1c-2 4.5-9 9-9 9z" />
      </svg>
    ),
  },
  {
    key: "cercanos",
    label: "Cercanos",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
        <path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" />
        <circle cx="12" cy="11" r="2.2" />
      </svg>
    ),
  },
  {
    key: "ajustes",
    label: "Ajustes",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.6 1.6 1.6 0 01-3.1 0 1.6 1.6 0 00-2.7-.6l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-.6-2.7 1.6 1.6 0 010-3.1 1.6 1.6 0 00.6-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-.6 1.6 1.6 0 013.1 0 1.6 1.6 0 002.7.6l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8z" />
      </svg>
    ),
  },
];

export default function NodoTabBar({ active, onChange, alertas, disabled }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-lg">
        {ITEMS.map((item) => {
          const activo = item.key === active;
          const bloqueado = Boolean(disabled?.[item.key]);
          return (
            <button
              key={item.key}
              onClick={() => {
                if (!bloqueado) onChange(item.key);
              }}
              disabled={bloqueado}
              aria-current={activo ? "page" : undefined}
              className={
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors " +
                (bloqueado
                  ? "cursor-not-allowed text-muted/45"
                  : activo
                  ? "text-accent"
                  : "text-muted active:text-white")
              }
            >
              <span className="relative">
                {item.icon}
                {alertas?.[item.key] && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
                )}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
