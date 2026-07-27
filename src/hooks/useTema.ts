"use client";

import { useCallback, useSyncExternalStore } from "react";
import { safeSetItem } from "@/lib/safeStorage";

export type Tema = "dark" | "light";

const THEME_KEY = "pa_theme";
const THEME_EVENT = "pa_theme_change";
const THEME_COLOR: Record<Tema, string> = {
  dark: "#0a0a0a",
  light: "#f8fafc",
};

function temaDesdeDocumento(): Tema {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function notificarTema() {
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function aplicarTema(tema: Tema) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", tema === "dark");
  root.style.colorScheme = tema;
  safeSetItem(THEME_KEY, tema);

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[tema];

  notificarTema();
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) callback();
  };

  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTema() {
  const tema = useSyncExternalStore(subscribe, temaDesdeDocumento, () => "dark");

  const setTema = useCallback((nuevo: Tema) => {
    aplicarTema(nuevo);
  }, []);

  const toggleTema = useCallback(() => {
    aplicarTema(temaDesdeDocumento() === "dark" ? "light" : "dark");
  }, []);

  return { tema, setTema, toggleTema };
}
