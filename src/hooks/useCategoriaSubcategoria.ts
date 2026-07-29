"use client";

import { useCallback, useEffect, useState } from "react";
import { getCategorias, getSubcategorias } from "@/lib/api";
import { Category, Subcategory } from "@/lib/types";

// Selector encadenado categoría -> subcategoría (issue #78).
//
// Estaba duplicado en InventarioNodo y SolicitudesNodo: mismo par de efectos
// (cargar macrocategorías al montar; al cambiar la macro, resetear la
// subcategoría elegida y traer las que corresponden) y mismos cuatro estados de
// datos/error. Cada copia podía divergir en el manejo de errores, que es lo que
// se ve en pantalla cuando la taxonomía no carga.
//
// `activo` permite montar el hook sin que dispare red: InventarioNodo en modo
// colaborador no muestra el formulario de alta y por lo tanto no necesita la
// taxonomía.
export function useCategoriaSubcategoria(activo = true) {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [categoriasError, setCategoriasError] = useState(false);
  const [subcategorias, setSubcategorias] = useState<Subcategory[]>([]);
  const [subcategoriasError, setSubcategoriasError] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");

  useEffect(() => {
    if (!activo) return;
    getCategorias()
      .then((lista) => {
        setCategorias(lista);
        setCategoriasError(false);
      })
      .catch(() => setCategoriasError(true));
  }, [activo]);

  useEffect(() => {
    if (!activo) return;
    // Reset del selector dependiente al cambiar la macro + fetch (intencional).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubcategoryId("");
    if (!categoryId) {
      setSubcategorias([]);
      return;
    }
    getSubcategorias(categoryId)
      .then((lista) => {
        setSubcategorias(lista);
        setSubcategoriasError(false);
      })
      .catch(() => setSubcategoriasError(true));
  }, [categoryId, activo]);

  // Vuelve el par al estado inicial. La lista de subcategorías la limpia el
  // efecto de arriba al ver la macro vacía.
  const reset = useCallback(() => {
    setCategoryId("");
    setSubcategoryId("");
  }, []);

  return {
    categorias,
    categoriasError,
    subcategorias,
    subcategoriasError,
    categoryId,
    setCategoryId,
    subcategoryId,
    setSubcategoryId,
    reset,
  };
}
