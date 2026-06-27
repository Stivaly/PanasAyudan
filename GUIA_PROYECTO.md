# Guia de lectura del proyecto

Este documento resume como esta armado PanasAyudan para que una futura lectura
del repositorio sea mas rapida y segura.

## Proposito

PanasAyudan es una app movil-first para coordinar insumos de emergencia en
Venezuela. Una persona publica lo que puede donar, otra lo busca en lista o
mapa, y los voluntarios coordinan recogidas pendientes con acceso a datos de
contacto protegidos por token.

## Stack

- Next.js con App Router, React, TypeScript y Tailwind CSS.
- Supabase para PostgreSQL, RPC, RLS y Realtime.
- Google Maps JavaScript API con Places nuevo, Advanced Markers,
  MarkerClusterer y Distance Matrix.
- PWA simple con `manifest.json` y `sw.js`.

Comandos principales:

```bash
npm install
npm run dev
npm run build
npm run lint
```

Variables necesarias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

Nota: la version real de Next esta en `package.json` (`next ^16.2.9`). Si
aparece algun problema de compatibilidad, revisar primero esa version.

## Rutas

- `/`: pantalla inicial con acceso a donar, buscar e ingresar al area de
  voluntarios.
- `/dar`: formulario para publicar un aporte. Solo accesible para voluntarios
  registrados: si no hay token en `localStorage`, muestra un aviso para
  registrarse en `/voluntarios`. Pide descripcion del lugar, estado obligatorio,
  ubicacion por Google Places o mapa manual, items y contacto (telefono y/o
  Telegram, al menos uno). El telefono se normaliza con `normalizarTelefonoVe`.
  Publica usando la RPC `crear_aporte` con el token del voluntario.
- `/buscar`: vista publica de insumos disponibles. Carga categorias y
  estados, permite filtrar por ambos, muestra lista por defecto y carga el mapa
  solo cuando el usuario lo pide.
- `/lugar/[id]`: detalle de un lugar con items disponibles. Permite compartir
  por WhatsApp y reservar cantidades mediante `reservar_item`.
- `/voluntarios`: registro/acceso por token y panel de recogidas pendientes.
  El token se guarda en `localStorage` y se muestra una sola vez al registrarse.
- `/voluntarios/gestionar/[id]`: panel por lugar para el voluntario dueño de los
  aportes. Lista sus insumos en ese lugar y las solicitudes pendientes agrupadas
  por item, con acciones de completar o liberar cada reserva. Requiere token.

## Estructura de carpetas

- `src/app`: rutas App Router, layout global, pantallas de carga/error y CSS
  global.
- `src/components`: piezas de interfaz: mapas, formularios, filtros, reserva,
  panel voluntario y registro del service worker.
- `src/hooks`: lectura en tiempo real de inventario y recogidas pendientes.
- `src/lib`: cliente Supabase, acciones de datos, carga de Google Maps,
  geolocalizacion, normalizacion de telefono (`telefono.ts`) y tipos
  compartidos.
- `src/types`: tipos auxiliares globales para Google Maps.
- `public`: manifest PWA y service worker.
- `supabase/migrations`: migraciones SQL disponibles en el repo (hasta `0017`),
  incluyendo esquema base, RLS/RPC, voluntarios, recogidas, WhatsApp y filtros
  por estado.
- `supabase/scripts`: scripts SQL de mantenimiento manual (no migraciones), p.
  ej. `limpiar_recogidas_aportes.sql`.

## Modelo de datos esperado

Los tipos en `src/lib/types.ts` muestran el contrato usado por la UI:

- `categories`: categorias con `name` y `slug`.
- `estados`: estados venezolanos publicos para filtrar busquedas y clasificar
  aportes.
- `locations`: lugares con `google_place_id`, nombre, coordenadas, direccion,
  descripcion libre y `estado_id`.
- `aportes`: publicaciones activas o cerradas, asociadas a un lugar.
- `aporte_items`: items de cada aporte, con cantidad aproximada y disponible.
- `recogidas`: reservas pendientes/completadas/canceladas con datos de quien
  ira a buscar.
- `volunteers`: voluntarios con contacto, zona, token y estado activo.

## Capa de datos

`src/lib/api.ts` es el punto de entrada para leer y escribir datos:

- Lecturas publicas: `getCategorias`, `getEstados`, `getItemsActivos`,
  `getItemsDeLugar`, `getLugar`, `getReservasPendientesDeLugar`,
  `getWhatsappVoluntarioItem`.
- Escrituras/RPC publicas: `reservarItem`, `registrarVoluntario`,
  `liberarRecogida`.
- RPC con token de voluntario: `crearAporte`, `getAportesVoluntario`,
  `obtenerContacto`, `completarRecogida`.

`src/lib/supabase.ts` crea dos tipos de cliente:

- `supabase`: cliente anonimo para lecturas publicas, Realtime y RPC publicas.
- `supabaseWithToken(token)`: cliente que envia el header `volunteer-token`.
  Las policies/RPC de voluntarios dependen de ese header.

No exponer contactos desde consultas publicas. El contacto del aporte debe
salir solo por RPC protegida con token.

## Flujos importantes

Publicar aporte:

1. `/dar` exige token de voluntario; sin token muestra el aviso de registro y no
   carga el formulario.
2. Con token, carga categorias, estados y centro aproximado.
3. El usuario elige estado obligatorio y ubicacion por Places o pin manual.
4. `ItemsForm` valida categoria, descripcion y cantidad; el contacto exige
   telefono valido (`normalizarTelefonoVe`) y/o Telegram, al menos uno.
5. `crearAporte` manda `location_data` con `estado_id`, `items_data` y
   `contact_data`, usando `supabaseWithToken` (RPC `crear_aporte` solo
   voluntarios).
6. Despues se busca el `location.id` recien creado y se navega a `/lugar/[id]`.

Buscar insumos:

1. `/buscar` usa `useItemsRealtime` con filtros opcionales de categoria y
   estado.
2. `getItemsActivos` lee items con `qty_disponible > 0`, aporte activo y
   estado cuando aplica.
3. El hook agrupa items por `location`.
4. La lista se muestra primero; `MapaClusters` se importa de forma dinamica
   solo al tocar "Ver en mapa".

Reservar item:

1. `/lugar/[id]` muestra items disponibles.
2. `ReservarItem` pide nombre, apellido, cedula, placa opcional y cantidad.
3. `reservarItem` crea una recogida y reduce disponibilidad en base de datos.
4. La UI muestra un contador local de 4 horas.
5. La liberacion real depende de RPC/cron en Supabase.

Voluntarios:

1. `/voluntarios` registra via `registrar_voluntario` o acepta un token ya
   existente.
2. El token vive en `localStorage` bajo `panas_volunteer_token`.
3. `PanelVoluntario` usa `useRecogidasPendientes(token)` para ordenar reservas
   por cercania.
4. El contacto del donante se obtiene con `obtener_aporte_con_contacto`.
5. El panel puede completar o liberar una reserva.

## Google Maps y ubicacion

- `src/lib/maps.ts` carga Google Maps de forma diferida en cliente.
- `MAP_ID` es necesario para `AdvancedMarkerElement`. El tema oscuro del mapa
  se configura en Google Cloud sobre ese Map ID.
- `PlacesAutocomplete` usa `PlaceAutocompleteElement`, no el Autocomplete
  legacy.
- `resolverCentro` intenta IP y luego GPS solo si el permiso ya estaba
  concedido. No dispara el prompt de geolocalizacion.
- `calcularDistancias` usa Distance Matrix en lotes de 25 destinos.

## PWA

- `RegistrarSW` registra `/sw.js` despues de cargar la pagina.
- `sw.js` usa network-first para navegacion y cache-first para estaticos.
- El service worker ignora llamadas externas a Supabase, Google, ip-api y
  WhatsApp.

### Deuda tecnica (frontend)

- Se elimino el componente `BotonInstalar` (boton "Instalar app" / instrucciones
  iOS para `beforeinstallprompt`). Ya no se muestra ningun prompt de instalacion
  PWA en la UI. El `manifest.json` y el service worker siguen activos, asi que la
  app aun es instalable manualmente desde el navegador. Pendiente: reintroducir un
  flujo de instalacion mejor pensado (timing, descartado, soporte iOS) si se
  retoma la promocion de la PWA.

## Estilo de UI

- Modo oscuro forzado desde `layout.tsx` con `<html className="dark">`.
- Colores extendidos en Tailwind: `bg`, `surface`, `border`, `accent`,
  `danger`, `muted`.
- Clases globales reutilizables en `globals.css`: `btn`, `btn-primary`,
  `btn-danger`, `btn-ghost`, `field`, `card`.
- La app esta optimizada para pantallas moviles y usa `safe-area-inset`.

## Cuidados al modificar

- Mantener la privacidad del contacto: nunca agregarlo a lecturas publicas.
- Revisar RLS/RPC antes de cambiar flujos de voluntarios.
- Si se agrega una categoria, actualizar datos en Supabase y verificar que el
  `CategorySlug` de TypeScript siga alineado.
- Si se modifica la lista de estados, actualizar la tabla `estados` y mantener
  obligatorio el `estado_id` en `crear_aporte`.
- Si se toca Google Maps, probar Places nuevo, Map ID y Advanced Markers.
- Si se cambia cache PWA, subir el nombre de cache en `public/sw.js`.
- Si se cambia la duracion de reservas, revisar UI, RPC y cron juntos.
- El proyecto depende de `.env.local`, pero no documentar ni copiar secretos.

## Archivos clave para empezar

- `src/lib/api.ts`: contrato principal con Supabase.
- `src/lib/types.ts`: modelo mental de tablas y payloads.
- `src/app/dar/page.tsx`: flujo de publicacion.
- `src/app/buscar/page.tsx`: flujo de busqueda.
- `src/app/lugar/[id]/page.tsx`: detalle y reservas.
- `src/app/voluntarios/page.tsx`: acceso y registro de voluntarios.
- `src/app/voluntarios/gestionar/[id]/page.tsx`: gestion por lugar de los
  aportes propios y sus solicitudes pendientes.
- `src/components/PanelVoluntario.tsx`: coordinacion de recogidas.
- `src/lib/telefono.ts`: normalizacion/validacion de WhatsApp venezolano.
- `src/hooks/useItemsRealtime.ts`: inventario publico en tiempo real.
- `src/hooks/useRecogidasPendientes.ts`: panel voluntario ordenado por
  distancia.
- `public/sw.js`: estrategia offline/cache.
- `supabase/migrations`: historial SQL de esquema, RLS y RPC.
