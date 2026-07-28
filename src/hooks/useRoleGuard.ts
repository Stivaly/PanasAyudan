"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { obtenerRol } from "@/lib/api";
import {
  clearCachedRole,
  clearVolunteerToken,
  getCachedRole,
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

    function aplicarRol(tokenActual: string, role: VolunteerRole) {
      if (!activo) return;

      if (!permitidos.includes(role)) {
        router.replace(rutaPorRol(role));
        return;
      }

      setState({ token: tokenActual, role, loading: false, error: null });
    }

    async function validar(tokenActual: string) {
      try {
        const role = await obtenerRol(tokenActual);
        setCachedRole(tokenActual, role);
        aplicarRol(tokenActual, role);
      } catch (e) {
        if (!activo) return;

        // Solo token_invalido bota la sesión (issue #48). Un error de red o
        // timeout no debe borrar un token válido: en red intermitente eso
        // desloguearía al voluntario en cada blip.
        const mensaje = e instanceof Error ? e.message : "";
        if (mensaje.includes("token_invalido")) {
          // Refuerzo del interceptor de supabase.ts, que ya limpia y redirige.
          clearVolunteerToken();
          clearCachedRole();
          setState({
            token: null,
            role: null,
            loading: false,
            error: "Sesion invalida. Ingresa tu token nuevamente.",
          });
          router.replace("/voluntarios?sesion=invalida");
          return;
        }

        setState((prev) =>
          prev.role
            ? prev // ya se aplicó el rol cacheado: la página sigue usable
            : {
                token: tokenActual,
                role: null,
                loading: false,
                error: "No se pudo validar la sesion. Revisa tu conexion.",
              }
        );
      }
    }

    function esVolunteerRole(value: string): value is VolunteerRole {
      return (["superadmin", "admin", "colaborador", "voluntario"] as readonly string[]).includes(
        value
      );
    }

    const rolCacheado = getCachedRole(token);
    if (rolCacheado && esVolunteerRole(rolCacheado)) {
      aplicarRol(token, rolCacheado);
    }

    void validar(token);

    return () => {
      activo = false;
    };
  }, [allowedKey, router]);

  return state;
}
