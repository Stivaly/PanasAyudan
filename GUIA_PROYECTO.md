# Guia de lectura del proyecto

Este documento resume como esta armado PanasAyudan para que una futura lectura
del repositorio sea mas rapida y segura.

## Proposito

PanasAyudan es una app movil-first para coordinar insumos de emergencia en
Venezuela. Un voluntario registrado publica lo que se puede donar, cualquier
persona lo busca en lista o mapa y reserva una cantidad, y luego la lleva a un
centro de acopio o zona de rescate. El contacto del aporte queda protegido por
token de voluntario.

## Stack

- Next.js con App Router, React, TypeScript y Tailwind CSS.
- Supabase para PostgreSQL, RPC, RLS, Realtime y pg_cron.
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

## Dos identidades, sin login

No hay autenticacion de usuarios. Todo se basa en dos tokens guardados en
`localStorage`:

- **Voluntario** (`panas_volunteer_token`): se obtiene al registrarse en
  `/voluntarios`. Habilita publicar aportes, gestionarlos, ver el contacto del
  donante y confirmar entregas. Se muestra una sola vez y no se recupera.
- **Recogedor** (`panas_recogedor_token`): un UUID que el navegador genera la
  primera vez que se reserva (`src/lib/recogedor.ts`). Identifica al dispositivo
  para que vea, modifique y cancele sus propias reservas en `/mis-recogidas`. No
  es autenticacion: un token ajeno no devuelve nada. Tambien se guardan los
  datos personales del recogedor (`panas_recogedor`) para pre-rellenar reservas.

## Rutas

- `/`: pantalla inicial con acceso a donar, buscar, ver mis recogidas e ingresar
  al area de voluntarios. Muestra estadisticas de impacto agregadas
  (`SeccionImpacto`).
- `/dar`: formulario para publicar un aporte. Solo accesible para voluntarios
  registrados: si no hay token en `localStorage`, muestra un aviso para
  registrarse en `/voluntarios`. Pide descripcion del lugar, estado obligatorio,
  origen obligatorio (centro de acopio o zona de rescate), ubicacion por Google
  Places o mapa manual, items y contacto (telefono y/o Telegram, al menos uno).
  El telefono se normaliza con `normalizarTelefonoVe`. Publica usando la RPC
  `crear_aporte` con el token del voluntario.
- `/buscar`: vista publica de insumos disponibles. Carga categorias y estados,
  permite filtrar por categoria, estado, centro de acopio y zona de rescate;
  muestra lista por defecto y carga el mapa solo cuando el usuario lo pide.
- `/lugar/[id]`: detalle de un lugar con items disponibles. Permite compartir
  por WhatsApp y reservar cantidades mediante `reservar_item`, eligiendo el
  destino. Muestra las reservas activas del propio dispositivo
  (`MisReservasActivas`).
- `/mis-recogidas`: panel del recogedor con todas las reservas de este
  dispositivo (por su token local). Separa pendientes de completadas/canceladas,
  muestra el destino, el contador de 4 horas, el estado de confirmacion, y
  permite cambiar la cantidad o cancelar una reserva pendiente. Escucha cambios
  en Realtime filtrando por `recogedor_token`.
- `/voluntarios`: registro/acceso por token y panel de recogidas pendientes.
  El registro permite asociar un centro de acopio de referencia. El token se
  guarda en `localStorage` y se muestra una sola vez al registrarse.
- `/voluntarios/gestionar/[id]`: panel por lugar para el voluntario dueno de los
  aportes. Lista sus insumos en ese lugar y las solicitudes pendientes agrupadas
  por item, con acciones de completar, confirmar entrega o liberar cada reserva.
  Requiere token.

## Estructura de carpetas

- `src/app`: rutas App Router, layout global, pantallas de carga/error y CSS
  global.
- `src/components`: piezas de interfaz: mapas, formularios, filtros, reserva,
  panel voluntario, acciones sobre recogidas, impacto, contador, combobox de
  estado y registro del service worker.
- `src/hooks`: lectura en tiempo real de inventario y recogidas pendientes.
- `src/lib`: cliente Supabase, acciones de datos (`api.ts`), carga de Google
  Maps, geolocalizacion, normalizacion de telefono (`telefono.ts`), identidad
  local del recogedor (`recogedor.ts`), validaciones y tipos compartidos.
- `src/types`: tipos auxiliares globales para Google Maps.
- `public`: manifest PWA y service worker.
- `supabase/migrations`: migraciones SQL disponibles en el repo (hasta `0027`),
  incluyendo esquema base, RLS/RPC, voluntarios, recogidas, WhatsApp, filtros
  por estado, identidad del recogedor, confirmacion de entrega, estadisticas de
  impacto, bloqueo de cedulas y centros de acopio / zonas de rescate.
- `supabase/scripts`: scripts SQL de mantenimiento manual (no migraciones), p.
  ej. `limpiar_recogidas_aportes.sql`.

## Modelo de datos esperado

Los tipos en `src/lib/types.ts` muestran el contrato usado por la UI:

- `categories`: categorias con `name` y `slug`.
- `estados`: estados venezolanos publicos para filtrar busquedas y clasificar
  aportes.
- `centros_acopio`: centros de acopio curados (solo lectura) por estado, con
  direccion, horario y contacto. Origen de aportes y destino de recogidas.
- `zonas_rescate`: zonas de rescate de referencia (solo lectura) por estado.
- `locations`: lugares con `google_place_id`, nombre, coordenadas, direccion,
  descripcion libre, `estado_id` y referencias opcionales a centro de acopio /
  zona de rescate.
- `aportes`: publicaciones activas o cerradas, asociadas a un lugar.
- `aporte_items`: items de cada aporte, con cantidad aproximada y disponible.
- `recogidas`: reservas pendientes/completadas/canceladas con datos de quien ira
  a buscar, `recogedor_token`, destino (centro/zona), `confirmation_deadline` y
  `confirmada_at`.
- `cedulas_bloqueadas`: cedulas que reservaron y no fueron a buscar; no pueden
  volver a reservar.
- `volunteers`: voluntarios con contacto, zona, centro de acopio de referencia,
  token y estado activo.

## Capa de datos

`src/lib/api.ts` es el punto de entrada para leer y escribir datos:

- Lecturas publicas: `getCategorias`, `getEstados`, `getCentrosAcopioPorEstado`,
  `getZonasRescatePorEstado`, `getCentrosAcopioTodos`, `getItemsActivos`,
  `getItemsDeLugar`, `getLugar`, `getReservasDeRecogedor`,
  `getWhatsappVoluntarioItem`, `verificarCedulaBloqueada`.
- Escrituras/RPC publicas: `reservarItem`, `registrarVoluntario`,
  `liberarRecogida`, `cancelarRecogidaPropia`, `modificarQtyRecogida`,
  `getRecogidasDeRecogedor`, `getEstadisticasImpacto`.
- RPC con token de voluntario: `crearAporte`, `getAportesVoluntario`,
  `obtenerContacto`, `completarRecogida`, `confirmarEntrega`.

`src/lib/supabase.ts` crea dos tipos de cliente:

- `supabase`: cliente anonimo para lecturas publicas, Realtime y RPC publicas.
- `supabaseWithToken(token)`: cliente que envia el header `volunteer-token`.
  Las policies/RPC de voluntarios dependen de ese header.

No exponer contactos desde consultas publicas. El contacto del aporte debe salir
solo por RPC protegida con token.

## Flujos importantes

Publicar aporte:

1. `/dar` exige token de voluntario; sin token muestra el aviso de registro y no
   carga el formulario.
2. Con token, carga categorias, estados, centros de acopio / zonas del estado y
   centro aproximado.
3. El usuario elige estado obligatorio, origen obligatorio (centro o zona) y
   ubicacion por Places o pin manual.
4. `ItemsForm` valida categoria, descripcion y cantidad; el contacto exige
   telefono valido (`normalizarTelefonoVe`) y/o Telegram, al menos uno.
5. `crearAporte` manda `location_data` con `estado_id`, `centro_acopio_id` o
   `zona_rescate_id`, `items_data` y `contact_data`, usando `supabaseWithToken`
   (RPC `crear_aporte` solo voluntarios; el constraint `origen_requerido`
   refuerza el origen en la BD).
6. Despues se busca el `location.id` recien creado y se navega a `/lugar/[id]`.

Buscar insumos:

1. `/buscar` usa `useItemsRealtime` con filtros opcionales de categoria, estado,
   centro de acopio y zona de rescate.
2. `getItemsActivos` lee items con `qty_disponible > 0`, aporte activo y los
   filtros aplicados.
3. El hook agrupa items por `location`.
4. La lista se muestra primero; `MapaClusters` se importa de forma dinamica solo
   al tocar "Ver en mapa".

Reservar item:

1. `/lugar/[id]` muestra items disponibles.
2. `ReservarItem` pide nombre, apellido, cedula, placa opcional, cantidad y
   destino. Antes de reservar verifica que la cedula no este bloqueada
   (`verificarCedulaBloqueada`).
3. `reservarItem` crea una recogida (con `recogedor_token` y destino) y reduce
   disponibilidad en base de datos.
4. La UI muestra un contador local de 4 horas.
5. La liberacion real depende de RPC/cron en Supabase.

Mis recogidas (recogedor):

1. `/mis-recogidas` lee todas las reservas del dispositivo con
   `getRecogidasDeRecogedor(token)` y escucha Realtime por `recogedor_token`.
2. El recogedor puede cambiar la cantidad (`modificarQtyRecogida`, ajusta stock)
   o cancelar (`cancelarRecogidaPropia`, libera stock) una reserva pendiente.
3. Ve el destino, el estado de confirmacion y un boton de WhatsApp al voluntario.

Voluntarios:

1. `/voluntarios` registra via `registrar_voluntario` (con centro de acopio de
   referencia opcional) o acepta un token ya existente.
2. El token vive en `localStorage` bajo `panas_volunteer_token`.
3. `PanelVoluntario` usa `useRecogidasPendientes(token)` para ordenar reservas
   por cercania.
4. El contacto del donante se obtiene con `obtener_aporte_con_contacto`.
5. El panel puede completar, confirmar la entrega o liberar una reserva
   (`AccionesRecogidaVoluntario`).

## Centros de acopio y zonas de rescate

- Son datos curados de solo lectura, sembrados por estado en la migracion
  `0025`. Alta/edicion solo via service role; los roles publicos solo tienen
  `select`.
- Un aporte (location) referencia su origen; una recogida referencia su destino.
- El selector de voluntario puede asociar un centro de acopio de referencia.

## Cedulas bloqueadas

- Una cedula que reserva y no va a buscar (reserva pendiente vencida) se bloquea
  con un job de pg_cron cada 30 min (`bloquear_cedulas_sin_confirmacion`).
- `reservar_item` rechaza cedulas bloqueadas (`cedula_bloqueada`) antes de
  verificar stock, y el frontend lo chequea antes con `verificarCedulaBloqueada`.

## Confirmacion de entrega e impacto

- La recogida lleva un `confirmation_deadline` (24h) y un `confirmada_at`.
- El voluntario confirma la entrega con `confirmarEntrega` (RPC con su token).
- `get_estadisticas_impacto` devuelve metricas agregadas publicas (recogidas
  completadas/confirmadas, cantidad coordinada, aportes y lugares activos) sin
  exponer datos personales; se muestran en `SeccionImpacto`.

## Google Maps y ubicacion

- `src/lib/maps.ts` carga Google Maps de forma diferida en cliente.
- `MAP_ID` es necesario para `AdvancedMarkerElement`. El tema oscuro del mapa se
  configura en Google Cloud sobre ese Map ID.
- `PlacesAutocomplete` usa `PlaceAutocompleteElement`, no el Autocomplete legacy.
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
  `btn-danger`, `btn-ghost`, `field`, `card`, `badge`.
- La app esta optimizada para pantallas moviles y usa `safe-area-inset`.

## Cuidados al modificar

- Mantener la privacidad del contacto: nunca agregarlo a lecturas publicas.
- Revisar RLS/RPC antes de cambiar flujos de voluntarios o recogedor.
- Las RPC del recogedor (`SECURITY DEFINER`) validan el `recogedor_token`; no
  exponer recogidas al rol anonimo por consulta directa.
- Si se agrega una categoria, actualizar datos en Supabase y verificar que el
  `CategorySlug` de TypeScript siga alineado.
- Si se modifica la lista de estados, actualizar la tabla `estados` y mantener
  obligatorio el `estado_id` en `crear_aporte`.
- Centros de acopio y zonas de rescate son de solo lectura: alta/edicion via
  service role.
- Si se toca Google Maps, probar Places nuevo, Map ID y Advanced Markers.
- Si se cambia cache PWA, subir el nombre de cache en `public/sw.js`.
- Si se cambia la duracion de reservas (4h) o el plazo de confirmacion (24h),
  revisar UI, RPC y cron juntos.
- El proyecto depende de `.env.local`, pero no documentar ni copiar secretos.

## Archivos clave para empezar

- `src/lib/api.ts`: contrato principal con Supabase.
- `src/lib/types.ts`: modelo mental de tablas y payloads.
- `src/lib/recogedor.ts`: identidad local del recogedor (token + datos).
- `src/app/dar/page.tsx`: flujo de publicacion.
- `src/app/buscar/page.tsx`: flujo de busqueda.
- `src/app/lugar/[id]/page.tsx`: detalle y reservas.
- `src/app/mis-recogidas/page.tsx`: reservas del propio dispositivo.
- `src/app/voluntarios/page.tsx`: acceso y registro de voluntarios.
- `src/app/voluntarios/gestionar/[id]/page.tsx`: gestion por lugar de los
  aportes propios y sus solicitudes pendientes.
- `src/components/PanelVoluntario.tsx`: coordinacion de recogidas.
- `src/components/SeccionImpacto.tsx`: estadisticas de impacto en la home.
- `src/lib/telefono.ts`: normalizacion/validacion de WhatsApp venezolano.
- `src/hooks/useItemsRealtime.ts`: inventario publico en tiempo real.
- `src/hooks/useRecogidasPendientes.ts`: panel voluntario ordenado por
  distancia.
- `public/sw.js`: estrategia offline/cache.
- `supabase/migrations`: historial SQL de esquema, RLS y RPC.
