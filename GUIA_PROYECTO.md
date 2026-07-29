# Guía de lectura del proyecto

Este documento resume cómo está armado PanasAyudan para que una futura lectura
del repositorio sea más rápida y segura. La fuente de verdad funcional son los
issues de GitHub y `definicion.md` (que vive fuera del repositorio); esto es un
mapa del código, no la especificación.

## Propósito

PanasAyudan es una app móvil-first para coordinar insumos de emergencia en
Venezuela. La unidad central es el **nodo**: un punto físico de acopio, de
entrega o mixto, con su inventario. Los nodos piden entre sí lo que les falta,
los voluntarios trasladan, y el público consulta dónde hay qué sin reservar
nada. El contacto de cada nodo queda protegido detrás de RPC con token.

## Stack

- Next.js 16 con App Router, React, TypeScript y Tailwind CSS.
- Supabase para PostgreSQL, PostGIS, RPC, RLS, Realtime y pg_cron.
- Google Maps JavaScript API con Places nuevo, Advanced Markers, MarkerClusterer
  y Distance Matrix.
- PWA simple con `manifest.json` y `sw.js`.

Comandos principales (el gestor de paquetes es **pnpm**; `npm` o `yarn` generan
un lockfile paralelo que se desincroniza del `pnpm-lock.yaml` real):

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

Variables necesarias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

Nota: la versión real de Next está en `package.json` (`next ^16.2.9`). Si aparece
algún problema de compatibilidad, revisar primero esa versión.

## Identidad y roles, sin login

No hay autenticación de usuarios. Todo se basa en tokens en `localStorage`
(accedidos siempre por `src/lib/safeStorage.ts`):

- **Voluntario** (`panas_volunteer_token`): se obtiene al registrarse en
  `/voluntarios`. Se muestra una sola vez y no se recupera. Es la única
  credencial del sistema.
- **Rol de sesión** (`panas_session_role`): cache del rol resuelto por
  `obtener_rol`, para no repetir la consulta en cada navegación.
- **Recogedor** (`panas_recogedor_token`, `panas_recogedor`): identidad local del
  modelo viejo de reservas. Solo la usan las rutas legadas.

El rol sale del token, no de la URL: `superadmin | admin | colaborador |
voluntario`. `useRoleGuard` (en `src/hooks/`) resuelve el rol antes de renderizar
cualquier pantalla privilegiada y redirige si no corresponde. Mientras resuelve
muestra skeleton, nunca la UI sensible.

## Rutas

Públicas:

- `/`: pantalla inicial con acceso a buscar, registrar un punto e ingresar al
  área de voluntarios. Muestra el modal de bienvenida (`ModalBienvenida`) y
  estadísticas de impacto agregadas (`SeccionImpacto`).
- `/buscar`: vista pública de nodos activos (`useNodosPublicos`). Lista por
  defecto (`ListaNodos`) con filtros (`FiltrosBuscar`); el mapa
  (`MapaClustersDinamico`) se carga solo cuando el usuario lo pide.
- `/nodo/[id]`: detalle público de un nodo — datos, estado operativo e inventario
  público (`getNodoPublico`, `getInventarioPublico`), con opción de compartir
  (`CompartirNodo`).
- `/registrar-nodo`: formulario público para solicitar el alta de un punto
  (`crearSolicitudRegistroNodo`). Usa `UbicacionPicker` / `PlacesAutocomplete`.
  No crea el nodo: crea una solicitud que aprueba un superadmin.
- `/offline`: fallback que sirve el service worker sin conexión.

Con token:

- `/voluntarios`: registro/acceso por token y panel del voluntario. Al resolver
  el rol redirige: `superadmin` → `/superadmin`, `admin` → `/nodo`,
  `colaborador` → `/nodo/colaborador`; el voluntario se queda aquí.
  `PanelVoluntario` es hoy exclusivamente `SolicitudesDisponibles`.
- `/nodo`: panel del admin sobre un **punto activo** (si administra varios, la
  lista funciona como selector, no se duplica la operación). Secciones por
  `NodoTabBar`: inventario, pedir insumos, movimientos y datos del punto —
  `VerificarNodo`, `EditarNodo`, `InventarioNodo`, `SolicitudesNodo`,
  `EstadoMovimientosNodo`.
- `/nodo/colaborador`: mismo inventario en modo `soloColaborador`: marcar
  agotado y solicitar reposición, sin alta de items ni edición del nodo.
- `/superadmin`: solicitudes de registro (`SolicitudesRegistroNodo`), creación de
  admins y cierre permanente de nodos.

Legado (modelo viejo, sin enlaces desde la navegación principal): `/dar`,
`/lugar/[id]`, `/mis-recogidas`, `/voluntarios/gestionar/[id]`.

## Estructura de carpetas

- `src/app`: rutas App Router, layout global, pantallas de carga/error/offline y
  CSS global.
- `src/components`: mapas, formularios, paneles de nodo, solicitudes, inventario,
  skeletons, avisos de conexión/batería y registro del service worker.
- `src/hooks`: Realtime (`useRealtimeRefresh`, `useInventarioNodo`,
  `useNodosPublicos`), guard de rol, token, tema y conexión.
- `src/lib`: cliente Supabase, acciones de datos (`api.ts`), Google Maps,
  geolocalización, teléfono (`telefono.ts`), storage seguro (`safeStorage.ts`),
  fetch con timeout, validaciones y tipos compartidos.
- `src/types`: tipos auxiliares globales para Google Maps.
- `public`: manifest PWA y service worker.
- `supabase/migrations`: migraciones SQL numeradas, hasta `0062`.
- `supabase/scripts`: scripts SQL de mantenimiento manual (no migraciones).

## Modelo de datos

Los tipos en `src/lib/types.ts` muestran el contrato usado por la UI.

Modelo de nodos (vigente):

- `centros_acopio`: la tabla que sostiene los nodos, con `tipo`
  (`acopio | entrega | mixto`), `status` (`inactivo | activo | pausado |
  cerrado`), verificación GPS y pausa granular (`pausado_recepcion`,
  `pausado_entrega`).
- `node_admins` / `node_collaborators`: membresía de cada nodo por rol.
- `node_inventory`: inventario por nodo, con categoría, subcategoría, condición,
  magnitud y disponibilidad.
- `solicitudes`: lo que un nodo pide, con cantidad y `magnitud_nivel`
  (`unidades` … `gandola`, ordenadas por `magnitud_orden()`).
- `compromisos_voluntario`: compromiso de un voluntario sobre una solicitud —
  **sin ubicación del voluntario, por diseño**; solo tiempo estimado y cantidad.
- `compromisos_nodo`: compromiso de un nodo hacia otro.
- `solicitudes_registro_nodo`: altas pendientes de aprobación por superadmin.
- `categories` / `subcategories`: taxonomía de 10 macrocategorías con
  subcategorías (alineada con `CategorySlug` en `src/lib/types.ts`).
- `estados`: estados venezolanos, para filtros y clasificación.
- `volunteers`: voluntarios con contacto, token, rol, vehículo y capacidad.
- `cedulas_bloqueadas`: cédulas bloqueadas por incumplimiento de un compromiso.
- `municipios` / `municipios_adyacentes`: legado del rango por adyacencia (0038),
  reemplazado por radio geográfico en 0043/0047. Ver el punto 1 del issue #34
  antes de tocarlos.

Modelo viejo (en convivencia hasta #25/#26): `locations`, `aportes`,
`aporte_items`, `recogidas`, `zonas_rescate`.

## Capa de datos

`src/lib/api.ts` es el punto de entrada para leer y escribir. Agrupado por uso:

- **Lecturas públicas**: `getCategorias`, `getSubcategorias`, `getEstados`,
  `getNodosPublicos`, `getNodoPublico`, `getInventarioPublico`,
  `getCentrosAcopioPorEstado`, `getCentrosAcopioTodos`, `getEstadisticasImpacto`.
- **Alta pública**: `crearSolicitudRegistroNodo`, `registrarVoluntario`.
- **Nodo (token admin)**: `crearNodo`, `verificarNodo`, `editarNodo`,
  `pausarNodo`, `cerrarNodo`, `listarNodosAdmin`, `listarNodosMiembro`.
- **Inventario (token)**: `getInventarioNodo`, `upsertInventario`,
  `marcarAgotado`, `eliminarInventario`, `solicitarReposicion`.
- **Solicitudes y compromisos (token)**: `crearSolicitud`, `editarSolicitud`,
  `eliminarSolicitud`, `listarSolicitudesDisponibles`, `listarSolicitudesNodo`,
  `listarSolicitudesParaNodo`, `responderSolicitudVoluntario`,
  `responderSolicitudNodo`, `marcarRetiroCompromiso`,
  `marcarCompromisoNodoEnviado`, `cancelarCompromiso`,
  `confirmarEntregaCompromiso`, `confirmarLlegadaCompromiso`,
  `listarMovimientosNodo`.
- **Voluntario (token)**: `obtenerRol`, `validarTokenVoluntario`,
  `verificarUbicacionVoluntario`.
- **Superadmin (token)**: `crearAdmin`, `listarSolicitudesRegistro`,
  `aprobarSolicitudRegistro`, `rechazarSolicitudRegistro`.
- **Legado**: `crearAporte`, `getItemsActivos`, `getItemsDeLugar`, `getLugar`,
  `reservarItem`, `getRecogidasDeRecogedor`, `liberarRecogida`,
  `completarRecogida`, `obtenerContacto` y afines.

`src/lib/supabase.ts` crea dos clientes:

- `supabase`: anónimo, para lecturas públicas, Realtime y RPC públicas.
- `supabaseWithToken(token)`: envía el header `volunteer-token`. Las policies y
  RPC con permisos dependen de ese header.

No exponer contactos desde consultas públicas: el contacto sale solo por RPC
protegida con token.

## Flujos importantes

**Alta de un nodo**: `/registrar-nodo` crea una fila en
`solicitudes_registro_nodo` → el superadmin la revisa en `/superadmin` →
`aprobar_solicitud_registro` activa el centro y precarga `node_inventory` con las
categorías declaradas (0058) → el admin entra a `/nodo` y **verifica el punto
estando físicamente ahí** (`verificar_nodo`, tolerancia por `distancia_metros`).

**Pedir y mover insumos**: el admin crea una solicitud desde `/nodo` (cantidad +
magnitud) → aparece en `SolicitudesDisponibles` (voluntarios en rango) y en
`SolicitudesEntreCentros` (otros nodos) → quien responde queda con un compromiso
→ marca retiro / en camino → el nodo destino confirma llegada o marca "no llegó",
lo que bloquea la cédula del voluntario.

**Rango del voluntario**: `verificarUbicacionVoluntario` toma el GPS, lo usa
dentro de la RPC con `ST_DWithin` y lo descarta. La verificación vale 24 h. El
radio es 40 km con vehículo registrado y 15 km sin él (`0061`; los 650/300 de
`0047` quedaron atrás). Ojo con no confundirlo con el rango **entre nodos**, que
es otra RPC y otro número: `listar_solicitudes_para_nodo` usa 650 km (`0053`).

**Inventario**: el admin da de alta items con categoría, subcategoría, condición,
magnitud y disponibilidad; el colaborador solo marca agotado y pide reposición.
Todo pasa por RPC atómica, nunca por `UPDATE` directo.

## Google Maps y ubicación

- `src/lib/maps.ts` carga Google Maps de forma diferida en cliente.
- `MAP_ID` es necesario para `AdvancedMarkerElement`. El tema oscuro del mapa se
  configura en Google Cloud sobre ese Map ID.
- `PlacesAutocomplete` usa `PlaceAutocompleteElement`, no el Autocomplete legacy.
- `resolverCentro` intenta IP y luego GPS solo si el permiso ya estaba concedido.
  No dispara el prompt de geolocalización.
- `MapaClusters` todavía usa `google.maps.Marker` legacy: es el issue #73.

## PWA

- `RegistrarSW` registra `/sw.js` después de cargar la página; `InstalarApp`
  ofrece la instalación.
- `sw.js` usa network-first para navegación y cache-first para estáticos, con
  `/offline` como fallback.
- El service worker ignora llamadas externas a Supabase, Google, ip-api y
  WhatsApp.
- Si se cambia el cache, subir el nombre: hoy es `panasayudan-v9`.

## Estilo de UI

- Modo oscuro por defecto con toggle manual (`TemaToggle`, `useTema`); modo claro
  para luz solar directa.
- Colores extendidos en Tailwind: `bg`, `surface`, `border`, `accent`, `danger`,
  `muted`. La paleta es deliberadamente mínima: agregar un color implica tocar
  `tailwind.config.ts` y `globals.css` (`:root` y `html.dark`) a la vez.
- Clases globales reutilizables en `globals.css`: `btn`, `btn-primary`,
  `btn-danger`, `btn-ghost`, `field`, `card`, `badge`.
- Optimizada para móvil, usa `safe-area-inset`.

## Cuidados al modificar

- Mantener la privacidad del contacto: nunca agregarlo a lecturas públicas.
- La ubicación del voluntario no se guarda ni se comparte: solo tiempo estimado y
  cantidad comprometida.
- Stock y cantidades solo por RPC atómica.
- Migraciones numeradas secuenciales, idempotentes (`if not exists`, `on
  conflict`, drop defensivo por firma — ver `0033` y `0059`), con RLS explícita en
  cada tabla nueva. RPC `security definer` con `set search_path = public`.
- Si se agregan categorías o estados, alinear la tabla en Supabase, `CategorySlug`
  en `src/lib/types.ts` y sus consumidores (`buscar`, `InventarioNodo`,
  `SolicitudesNodo`).
- Si se toca Google Maps, probar Places nuevo, Map ID y Advanced Markers.
- Si se cambia el cache PWA, subir el nombre en `public/sw.js`.
- No borrar el modelo viejo por iniciativa propia: se retira en #25 y #26.
- El proyecto depende de `.env.local`, pero no documentar ni copiar secretos.

## Archivos clave para empezar

- `src/lib/api.ts`: contrato principal con Supabase.
- `src/lib/types.ts`: modelo mental de tablas y payloads.
- `src/app/buscar/page.tsx`: vista pública de nodos.
- `src/app/nodo/page.tsx`: panel operativo del admin.
- `src/app/registrar-nodo/page.tsx`: alta pública de un punto.
- `src/app/superadmin/page.tsx`: aprobaciones y cierre.
- `src/app/voluntarios/page.tsx`: acceso, registro y panel del voluntario.
- `src/components/InventarioNodo.tsx` y `SolicitudesNodo.tsx`: el corazón
  operativo (y los dos componentes más grandes: issue #80).
- `src/hooks/useRoleGuard.ts`: cómo se protege cada pantalla.
- `src/lib/telefono.ts`: normalización/validación de WhatsApp venezolano.
- `public/sw.js`: estrategia offline/cache.
- `supabase/migrations`: historial SQL de esquema, RLS y RPC.
