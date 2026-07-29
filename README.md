# PanasAyudan

App de emergencia para distribución de insumos en Venezuela. La coordinación
gira alrededor de **nodos** (puntos de acopio, de entrega o mixtos): cada nodo
publica su inventario, pide lo que le falta a otros nodos, y los voluntarios
mueven los insumos entre puntos. El público consulta dónde hay qué, sin
reservar ni exponer contactos privados.

> **Nota de estado.** El proyecto migró del modelo viejo (aportes publicados por
> voluntarios + reservas del público) al modelo de nodos. Quedan rutas del modelo
> viejo vivas por compatibilidad, ya sin enlaces desde la navegación principal;
> se retiran en los issues #25 y #26. Ver [Modelo viejo en convivencia](#modelo-viejo-en-convivencia).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + PostGIS + RPC + RLS + Realtime + pg_cron)
- Google Maps JS API (Places API New + MarkerClusterer + Distance Matrix)
- PWA (manifest + service worker), modo oscuro por defecto con toggle manual
- **pnpm** como gestor de paquetes

## Requisitos

- Node.js 18.18+ (recomendado 20+)
- **pnpm** (`corepack enable pnpm` o `npm i -g pnpm`)
- Un proyecto en Supabase con la extensión `postgis` habilitada (el rango del
  voluntario se calcula con `ST_DWithin`)
- Una API key de Google Maps con **Maps JavaScript API**, **Places API (New)** y
  **Distance Matrix API** habilitadas. La Places API legacy no funciona con keys
  nuevas; el autocomplete usa `PlaceAutocompleteElement` (Places API nuevo).
- Un **Map ID** (Google Cloud → Map Management), requerido por los marcadores
  avanzados (`AdvancedMarkerElement`). El tema oscuro del mapa se define en la
  consola sobre ese Map ID: con `mapId` presente, los estilos inline se ignoran.

## Configuración

1. Instala dependencias. El gestor es **pnpm**: `npm` o `yarn` generan un
   lockfile paralelo que se desincroniza del `pnpm-lock.yaml` real.

   ```bash
   pnpm install
   ```

2. Copia las variables de entorno y complétalas:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

3. Ejecuta las migraciones SQL en tu proyecto de Supabase (SQL Editor), en orden
   numérico (`supabase/migrations`, hasta `0062`). A grandes rasgos: esquema
   base, RLS/RPC y voluntarios (`0001-0029`); roles por token (`0030`); modelo de
   nodos (`0031`); solicitudes entre nodos (`0032`); taxonomía de categorías
   (`0037`); rango del voluntario por GPS (`0038`, `0043`, `0047`); inventario
   por nodo (`0039`); incumplimiento por cédula (`0040`); alta y edición de nodos
   (`0041`, `0042`, `0044`); y el resto de ajustes operativos hasta `0062`.
   `pg_cron` debe estar habilitado. Los scripts de mantenimiento manual viven en
   `supabase/scripts` (no son migraciones).

4. Levanta el entorno de desarrollo:

   ```bash
   pnpm dev
   ```

   Otros comandos: `pnpm build`, `pnpm start`, `pnpm lint`.

## Rutas

**Públicas** — `/` (inicio), `/buscar` (nodos activos en lista, mapa opcional),
`/nodo/[id]` (detalle de un nodo y su inventario público), `/registrar-nodo`
(solicitud de alta, la aprueba un superadmin), `/offline` (fallback PWA).

**Con token** — `/voluntarios` (registro/acceso y panel del voluntario), `/nodo`
(panel del admin de su punto), `/nodo/colaborador` (inventario operativo),
`/superadmin` (aprobaciones y cierre de nodos). La ruta a la que entras depende
del rol que devuelve tu token, no de la URL que escribas.

## Estructura

```
src/
  app/            Rutas (App Router): / · /buscar · /nodo/[id] · /registrar-nodo
                  /voluntarios · /nodo · /nodo/colaborador · /superadmin
                  /offline · (legado: /dar · /lugar/[id] · /mis-recogidas)
  components/     Mapas, formularios, paneles de nodo, solicitudes, inventario,
                  skeletons y avisos de conexión/batería
  hooks/          Realtime, guard de rol, token, inventario, tema y conexión
  lib/            Cliente Supabase, api.ts, tipos, geo, Google Maps, teléfono,
                  storage seguro, validaciones y estados
public/           manifest.json y service worker
supabase/         migraciones SQL (esquema/RLS/RPC/cron) y scripts manuales
```

## Roles e identidades

No hay login: todo se basa en un token de voluntario guardado en `localStorage`
(`panas_volunteer_token`), que se muestra **una sola vez** al registrarse y no se
puede recuperar. Ese mismo token determina el rol (`obtener_rol`):

| Rol | Pantalla | Puede |
| --- | --- | --- |
| `superadmin` | `/superadmin` | Aprobar/rechazar solicitudes de nodo, crear admins, cerrar nodos |
| `admin` | `/nodo` | Verificar, editar y pausar su punto; inventario; pedir insumos; enviar/recibir compromisos |
| `colaborador` | `/nodo/colaborador` | Marcar inventario agotado y solicitar reposición |
| `voluntario` | `/voluntarios` | Ver solicitudes en su rango y comprometerse a trasladar |

## Cómo funciona

- **Alta de un nodo**: cualquiera la solicita en `/registrar-nodo`; un superadmin
  la aprueba y el nodo nace con su inventario precargado. El admin verifica el
  punto **estando físicamente ahí** (GPS con tolerancia por distancia) antes de
  operar. Un nodo puede pausar recepción y entrega por separado.
- **Solicitudes**: un nodo pide lo que le falta con una cantidad y una magnitud
  (`unidades` … `gandola`). Otro nodo o un voluntario se compromete, marca el
  retiro, va en camino, y el nodo destino confirma la llegada.
- **Rango del voluntario**: se verifica su ubicación por GPS y vale 24 horas. Ve
  solicitudes hasta 40 km si registró vehículo, 15 km si no (`0061`). Su
  ubicación **nunca se guarda**: vive dentro de la RPC y se descarta. El rango
  **entre nodos** es distinto y más amplio: 650 km (`0053`).
- **Incumplimiento**: si el nodo destino marca "no llegó" sobre un compromiso, la
  cédula del voluntario se bloquea. No hay bloqueo automático por vencimiento
  (el aviso de 24 h es informativo).

## Invariantes

- El contacto (teléfono/Telegram) **nunca** sale en lecturas públicas: solo por
  RPC con token.
- La ubicación del voluntario **nunca** se guarda ni se comparte; solo se
  registran tiempo estimado y cantidad comprometida.
- Stock y cantidades se modifican solo por RPC atómica, nunca con `UPDATE`
  directo.
- Los teléfonos se normalizan siempre con `normalizarTelefonoVe`
  (`src/lib/telefono.ts`).
- La geolocalización pasa por `resolverCentro` (IP primero, GPS solo si el
  permiso ya estaba concedido): no se dispara el prompt de permisos por sorpresa.
- Si tocas `public/sw.js`, sube el nombre de cache (hoy `panasayudan-v9`).

## Modelo viejo en convivencia

`/dar`, `/lugar/[id]`, `/mis-recogidas` y `/voluntarios/gestionar/[id]` siguen
existiendo con sus tablas (`aportes`, `aporte_items`, `recogidas`) y sus RPC. Ya
no hay enlaces hacia ellas desde la navegación principal. Se eliminan en los
issues #25 y #26, y solo cuando sus reemplazos estén en producción: no las borres
por iniciativa propia. Los bugs abiertos que viven ahí (#5, #16) no se arreglan.

## Memoria de agentes

El repositorio versiona `.codebase-memory/graph.db.zst` como snapshot compartido
del grafo de conocimiento usado por agentes. El archivo se genera al indexar el
proyecto con persistencia habilitada y debe tratarse como un artefacto
regenerable (lo mismo aplica a `graphify-out/`).

`.gitattributes` configura el merge del snapshot asi:

```gitattributes
.codebase-memory/graph.db.zst merge=ours
```

Cada clon local debe registrar una vez el driver de merge correspondiente:

```bash
git config merge.ours.driver true
```

Esa configuracion vive en `.git/config`, por lo que no se commitea. Antes de
resolver merges que puedan tocar `.codebase-memory/graph.db.zst`, verifica que
el driver este configurado. Si el snapshot queda desactualizado despues de un
merge, reindexa el proyecto con persistencia habilitada y commitea el nuevo
artefacto.

## Contribuir

El flujo de ramas y PRs está en [CONTRIBUTING.md](CONTRIBUTING.md). Resumen: una
rama `issue-N` por issue, partiendo de `Development`, y PR hacia `Development`
(nunca hacia `main`).

## Deploy

Despliegue nativo en Vercel. Configura las cuatro variables de entorno en el
panel del proyecto. El service worker y el manifest se sirven desde `public/`.
