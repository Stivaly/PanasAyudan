"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerRol } from "@/lib/api";
import {
  clearCachedRole,
  clearVolunteerToken,
  getVolunteerToken,
  setCachedRole,
} from "@/lib/supabase";
import { VolunteerRole } from "@/lib/types";

interface RoleGuardState {
  token: string | null;
  role: VolunteerRole | null;
  loading: boolean;
  error: string | null;
}

function rutaPorRol(role: VolunteerRole): string {
  switch (role) {
    case "superadmin":
      return "/superadmin";
    case "admin":
      return "/nodo";
    case "colaborador":
      return "/nodo/colaborador";
    default:
      return "/voluntarios";
  }
}

export function useRoleGuard(allowed: VolunteerRole[]): RoleGuardState {
  const router = useRouter();
  const allowedKey = allowed.join("|");
  const [state, setState] = useState<RoleGuardState>({
    token: null,
    role: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let activo = true;
    const permitidos = allowedKey.split("|") as VolunteerRole[];
    const token = getVolunteerToken();

    if (!token) {
      router.replace("/voluntarios");
      return;
    }

    async function validar(tokenActual: string) {
      try {
        const role = await obtenerRol(tokenActual);
        setCachedRole(tokenActual, role);

        if (!activo) return;

        if (!permitidos.includes(role)) {
          router.replace(rutaPorRol(role));
          return;
        }

        setState({ token: tokenActual, role, loading: false, error: null });
      } catch {
        if (!activo) return;
        clearVolunteerToken();
        clearCachedRole();
        setState({
          token: null,
          role: null,
          loading: false,
          error: "Sesion invalida. Ingresa tu token nuevamente.",
        });
        router.replace("/voluntarios?sesion=invalida");
      }
    }

    void validar(token);

    return () => {
      activo = false;
    };
  }, [allowedKey, router]);

  return state;
}
