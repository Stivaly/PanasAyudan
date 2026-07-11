# Graph Report - .  (2026-07-10)

## Corpus Check
- 147 files · ~114,688 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 499 nodes · 1203 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.88)
- Token cost: 84,423 input · 0 output

## Community Hubs (Navigation)
- Inventario y Solicitudes de Nodo
- Formularios y Paneles (registro, superadmin, voluntarios)
- Documentación y Auditoría
- Panel de Nodo y Home
- Ficha Pública de Nodo
- Búsqueda y Mapas
- Layout y PWA (instalar, batería)
- Dependencias (package.json)
- Recogidas de Voluntario (modelo viejo)
- Config TypeScript
- Aportes y Reservas (modelo viejo)
- Manifest PWA
- Edición de Nodo
- Service Worker
- Config ESLint
- Config Next.js
- Config Tailwind

## God Nodes (most connected - your core abstractions)
1. `supabaseWithToken()` - 44 edges
2. `Voluntarios()` - 17 edges
3. `useRealtimeRefresh()` - 17 edges
4. `ReservarItem()` - 16 edges
5. `compilerOptions` - 16 edges
6. `getEstados()` - 15 edges
7. `EstadoVenezuela` - 15 edges
8. `getCategorias()` - 13 edges
9. `formatEstadoNombre()` - 13 edges
10. `SuperadminPanel()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Token invalidado no fuerza re-login centralizado` --semantically_similar_to--> `Guard de rol reutilizable en cliente`  [INFERRED] [semantically similar]
  issues-draft-frontend.md → AUDITORIA_FRONTEND.md
- `Guía de lectura del proyecto` --semantically_similar_to--> `README PanasAyudan`  [INFERRED] [semantically similar]
  GUIA_PROYECTO.md → README.md
- `Origen obligatorio del aporte y destino de la reserva` --semantically_similar_to--> `Centros de acopio y zonas de rescate (datos curados)`  [INFERRED] [semantically similar]
  README.md → GUIA_PROYECTO.md
- `Alcance issue #24: solo /buscar, nunca la home` --conceptually_related_to--> `Modelo de nodos`  [INFERRED]
  memory/issue-24-scope-buscar-only.md → CLAUDE.md
- `Guía de lectura del proyecto` --references--> `normalizarTelefonoVe (normalización de teléfonos)`  [INFERRED]
  GUIA_PROYECTO.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Migración del modelo viejo al modelo de nodos** — claude_modelo_viejo, claude_modelo_nodos, claude_orden_de_trabajo, auditoria_frontend_auditoria, issues_draft_frontend_issues [INFERRED 0.95]
- **Pipeline de seed de municipios ADM2 (GeoJSON -> staging -> municipios -> adyacencias -> backfill)** — supabase_scripts_generar_seed_municipios_hdx_cod_ab, supabase_scripts_generar_seed_municipios_municipios_seed_raw, supabase_scripts_generar_seed_municipios_recalcular_adyacencias_municipios, supabase_scripts_generar_seed_municipios_backfill_centros_acopio [EXTRACTED 1.00]
- **Privacidad por diseño: contacto y ubicación protegidos por token** — claude_invariante_contacto_privado, claude_invariante_ubicacion_voluntario, claude_supabasewithtoken, issues_draft_frontend_invariantes_verificados [INFERRED 0.95]

## Communities (23 total, 4 thin omitted)

### Community 0 - "Inventario y Solicitudes de Nodo"
Cohesion: 0.07
Nodes (67): GestionarLugar(), EstadoMovimientosNodo(), Props, REALTIME_TABLES, InventarioNodo(), Props, REALTIME_TABLES, SolicitudesDisponibles() (+59 more)

### Community 1 - "Formularios y Paneles (registro, superadmin, voluntarios)"
Cohesion: 0.08
Nodes (51): Dar(), fetchLocationId(), VENEZUELA_CENTRO, RegistrarNodo(), SuperadminPanel(), Vista, Voluntarios(), EstadoCombobox() (+43 more)

### Community 2 - "Documentación y Auditoría"
Cohesion: 0.06
Nodes (55): Auditoría Frontend - Modelo de Nodos, Guard de rol reutilizable en cliente, InventarioNodo (correcciones de formulario), Matriz de responsabilidades por rol, PanelVoluntario (rediseño a panel puro), Pantalla /nodo/colaborador, Pantalla /nodo (panel admin), Pantalla /superadmin (+47 more)

### Community 3 - "Panel de Nodo y Home"
Cohesion: 0.08
Nodes (38): ColaboradorPanel(), REALTIME_TABLES, NodoAdminPanel(), REALTIME_TABLES, Home(), ModalBienvenida, Item, ITEMS (+30 more)

### Community 4 - "Ficha Pública de Nodo"
Cohesion: 0.06
Nodes (44): NodoDetalle(), TIPO_LABEL, BotonVolver(), CompartirNodo(), Props, ListaNodos(), Props, TIPO_LABEL (+36 more)

### Community 5 - "Búsqueda y Mapas"
Cohesion: 0.11
Nodes (30): Buscar(), MapaClusters, MAPA_SOLO_BASE, MapaClusters(), NodoMapa, pinIcon(), pinSvg(), Props (+22 more)

### Community 6 - "Layout y PWA (instalar, batería)"
Cohesion: 0.10
Nodes (21): metadata, viewport, AvisoBateria(), Banner, BatteryManagerLike, NavigatorConBateria, umbralParaNivel(), BeforeInstallPromptEvent (+13 more)

### Community 7 - "Dependencias (package.json)"
Cohesion: 0.07
Nodes (26): dependencies, @googlemaps/markerclusterer, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, devDependencies (+18 more)

### Community 8 - "Recogidas de Voluntario (modelo viejo)"
Cohesion: 0.14
Nodes (18): formatearFecha(), MisRecogidas(), PendienteCard(), whatsappHref(), AccionesRecogidaVoluntario(), formatearFecha(), Props, Countdown() (+10 more)

### Community 9 - "Config TypeScript"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Aportes y Reservas (modelo viejo)"
Cohesion: 0.17
Nodes (16): LugarDetalle(), Props, Props, agrupar(), Estado, ItemConLugar, PuntoMapa, useItemsRealtime() (+8 more)

### Community 11 - "Manifest PWA"
Cohesion: 0.14
Nodes (13): background_color, categories, description, dir, display, icons, lang, name (+5 more)

### Community 12 - "Edición de Nodo"
Cohesion: 0.28
Nodes (8): EditarNodo(), Props, Props, UbicacionSeleccion, editarNodo(), EditarNodoDatos, NodeTipo, NodoAdmin

## Knowledge Gaps
- **123 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+118 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabase` connect `Layout y PWA (instalar, batería)` to `Inventario y Solicitudes de Nodo`, `Panel de Nodo y Home`, `Ficha Pública de Nodo`, `Búsqueda y Mapas`, `Recogidas de Voluntario (modelo viejo)`, `Aportes y Reservas (modelo viejo)`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `supabaseWithToken()` connect `Inventario y Solicitudes de Nodo` to `Formularios y Paneles (registro, superadmin, voluntarios)`, `Panel de Nodo y Home`, `Edición de Nodo`, `Búsqueda y Mapas`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `Coords` connect `Búsqueda y Mapas` to `Formularios y Paneles (registro, superadmin, voluntarios)`, `Ficha Pública de Nodo`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Inventario y Solicitudes de Nodo` be split into smaller, more focused modules?**
  _Cohesion score 0.06718597857838364 - nodes in this community are weakly interconnected._
- **Should `Formularios y Paneles (registro, superadmin, voluntarios)` be split into smaller, more focused modules?**
  _Cohesion score 0.08221153846153846 - nodes in this community are weakly interconnected._
- **Should `Documentación y Auditoría` be split into smaller, more focused modules?**
  _Cohesion score 0.055218855218855216 - nodes in this community are weakly interconnected._