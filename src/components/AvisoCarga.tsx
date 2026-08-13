import type { ReactNode } from "react";

export default function AvisoCarga({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-warning">{children}</p>;
}
