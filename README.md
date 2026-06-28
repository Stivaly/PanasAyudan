# PanasAyudan

App de emergencia para distribución de insumos en Venezuela. Los voluntarios
registrados publican en un mapa lo que hay para dar; cualquier persona busca,
reserva una cantidad y coordina la recogida, llevándola a un centro de acopio o
zona de rescate.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Realtime + RLS + pg_cron)
- Google Maps JS API (Places Autocomplete + MarkerClusterer + Distance Matrix)
- PWA (manifest + service worker), modo oscuro forzado

## Requisitos

- Node.js 18.18+ (recomendado 20+)
- Un proyecto en Supabase
- Una API key de Google Maps con **Maps JavaScript API**, **Places API (New)** y
  **Distance Matrix API** habilitadas. La Places API legacy no funciona con keys
  nuevas; el autocomplete usa `PlaceAutocompleteElement` (Places API nuevo).
- Un **Map ID** (Google Cloud → Map Management), requerido por los marcadores
  avanzados (`AdvancedMarkerElement`). El tema oscuro del mapa se define en la
  consola sobre ese Map ID: con `mapId` presente, los estilos inline se ignoran.

## Configuración

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia las variables de entorno y complétalas:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`

3. Ejecuta las migraciones SQL en tu proyecto de Supabase (SQL Editor),
   en orden numérico (`supabase/migrations`, hasta `0027`): esquema, RLS, RPC,
   cron, recogidas, voluntarios, WhatsApp, filtros por estado, identidad local
   del recogedor, confirmación de entrega, estadísticas de impacto, bloqueo de
   cédulas, y centros de acopio / zonas de rescate con su semilla de datos.
   `pg_cron` debe estar habilitado (libera reservas vencidas y bloquea cédulas
   que no fueron a buscar). Los scripts de mantenimiento manual viven en
   `supabase/scripts`.

4. Levanta el entorno de desarrollo:

   ```bash
   npm run dev
   ```

## Estructura

```
src/
  app/            Rutas (App Router): / · /buscar · /dar · /lugar/[id]
                  /mis-recogidas · /voluntarios · /voluntarios/gestionar/[id]
  components/     Mapa, formularios, panel de voluntarios, impacto y UI
  hooks/          Suscripciones Realtime y carga de recogidas
  lib/            Cliente Supabase, tipos, geo, Google Maps, teléfono,
                  identidad local del recogedor y validaciones
public/           manifest.json y service worker
supabase/         migraciones SQL (esquema/RLS/RPC/cron) y scripts
```

## Notas

- Modo oscuro siempre activo; no hay toggle de tema.
- Hay dos identidades, ninguna con login:
  - **Voluntario**: publica en `/dar`, gestiona sus aportes y solicitudes, y
    confirma entregas. Se identifica con un token que se muestra una sola vez al
    registrarse y se guarda en `localStorage` (no se puede recuperar).
  - **Recogedor**: cualquiera que reserva. El navegador genera un token UUID
    local permanente (`src/lib/recogedor.ts`) que le permite ver, modificar y
    cancelar sus propias reservas en `/mis-recogidas`.
- Cada aporte indica un **origen obligatorio** (centro de acopio o zona de
  rescate) y cada reserva indica un **destino** a dónde se llevará el insumo.
  Los centros de acopio y zonas de rescate son datos curados de solo lectura.
- El teléfono de contacto se normaliza a WhatsApp venezolano (`src/lib/telefono.ts`).
- El contacto del aporte nunca se expone en lecturas públicas: solo los
  voluntarios lo ven, vía RPC, usando su token.
- Las reservas expiran a las 4 horas y se liberan automáticamente (pg_cron). El
  recogedor tiene un plazo de confirmación de entrega de 24 horas.
- Las cédulas que reservan y no van a buscar se bloquean automáticamente (job
  de pg_cron cada 30 min) y no pueden volver a reservar.
- La pantalla de inicio muestra estadísticas de impacto agregadas (sin datos
  personales) vía RPC pública.

## Deploy

Despliegue nativo en Vercel. Configura las cuatro variables de entorno en el
panel del proyecto. El service worker y el manifest se sirven desde `public/`.
