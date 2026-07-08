---
name: issue-24-scope-buscar-only
description: Issue #24 (vista pública de nodos) solo toca /buscar, nunca / (home)
metadata:
  type: project
---

En el issue #24 (vista pública de nodos: ListaNodos, /nodo/[id], CompartirNodo, useNodosPublicos) el reemplazo es SOLO de `src/app/buscar/page.tsx`. La home `src/app/page.tsx` NO se toca: conserva su landing (hero + accesos a /dar, /voluntarios, /registrar-nodo y botones "Tengo algo para dar" / "Necesito buscar algo"). El botón "Necesito buscar algo" sigue enlazando a /buscar, que es el aterrizaje del público general de definicion.md.

**Why:** Una lectura literal previa del issue sugería reemplazar también `/`; el usuario corrigió que simplificar accesos del home sería un issue separado.
**How to apply:** No modificar page.tsx al implementar #24. Si algo pide cambiar el home, es fuera de alcance. Ver [[issue-24-scope-buscar-only]].
