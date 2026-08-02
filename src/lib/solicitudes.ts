// Helpers puros de presentación de solicitudes de un nodo (issue #80).
// Movidos desde SolicitudesNodo.tsx sin cambios de lógica.

import { CompromisoNodo, CompromisoVoluntario, SolicitudNodo } from "@/lib/types";

const cantidadActivaNodo = (s: SolicitudNodo) =>
  s.compromisos_nodo
    .filter((c) => c.status === "comprometido" || c.status === "en_camino" || c.status === "entregado")
    .reduce((total, c) => total + (c.cantidad ?? 0), 0);

const cantidadActivaVoluntarioDirecto = (s: SolicitudNodo) =>
  s.compromisos_voluntario
    .filter(
      (c) =>
        !c.compromiso_nodo_id &&
        (c.status === "pendiente" || c.status === "retirado" || c.status === "completado")
    )
    .reduce((total, c) => total + (c.cantidad ?? 0), 0);

export const comprometido = (s: SolicitudNodo) =>
  cantidadActivaNodo(s) + cantidadActivaVoluntarioDirecto(s);

export const falta = (s: SolicitudNodo) => Math.max(0, (s.cantidad ?? 0) - comprometido(s));

export const estadoSolicitud = (s: SolicitudNodo) => {
  if (s.status === "abierta") return "Abierta";
  if (s.status === "cerrada") return "Recibida";
  if (s.status === "en_camino") return "Con envíos en camino";
  return "Con compromisos";
};

export const estadoVoluntario = (c: CompromisoVoluntario) => {
  if (c.status === "completado") return "recibido";
  if (c.status === "incumplido") return "incumplido";
  if (c.status === "retirado") {
    return c.atrasado_24h ? "retirado, confirmacion vencida" : "retirado, esperando confirmacion";
  }
  if (c.atrasado_4h) return "retiro vencido";
  return "pendiente de retiro";
};

export const estadoNodo = (c: CompromisoNodo) => {
  if (c.status === "entregado") return "recibido";
  if (c.status === "cancelado") return "cancelado";
  if (c.status === "en_camino") return "enviado";
  if (c.tiene_transporte) return "pendiente de envio";
  if ((c.cantidad_disponible_transporte ?? 0) > 0) return "esperando voluntario";
  return "transporte asignado";
};
